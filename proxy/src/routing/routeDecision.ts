// 路由决策链——L0 → L0.5 → L1 → L2 → L3 → Fallback
import type {
  ChatMessage,
  ChatCompletionResponse,
  RouteDecisionResult,
} from "../types/index.js";
import { config } from "../config.js";
import {
  getRoutingEnableL2,
  getRoutingEnableL3,
  getSemanticCacheCheckMs,
} from "../runtimeConfig.js";
import { getDbPool } from "../cache/db.js";
import { logger } from "../utils/logger.js";
import { checkExactCache as checkCache } from "../cache/exactCache.js";
import { matchRule } from "./ruleEngine.js";
import { incrementFallbackCounter } from "../cache/redis.js";
import { toRouterMessageItems } from "../utils/routerMessages.js";

export interface RouteOutput {
  decision: RouteDecisionResult;
  cachedResponse: ChatCompletionResponse | null;
}

async function checkExactCacheLayer(
  model: string,
  messages: ChatMessage[],
): Promise<{ hit: false } | { hit: true; response: ChatCompletionResponse }> {
  try {
    const cached = await checkCache(model, messages);
    if (cached) return { hit: true, response: cached };
  } catch (err) {
    logger.debug("L0 精确缓存检查失败", { error: err });
  }
  return { hit: false };
}

function evaluateRules(
  messages: ChatMessage[],
  estimatedTokens: number,
): RouteDecisionResult {
  const result = matchRule(messages, estimatedTokens);
  if (result) {
    return {
      matched: true,
      layer: "L1_RULE",
      targetModel: result.targetModel,
      confidence: 1.0,
      ruleId: result.ruleId,
      fallbackChain: result.fallbackChain,
      latencyMs: 0,
    };
  }
  return {
    matched: false,
    layer: "L1_RULE",
    targetModel: null,
    confidence: 0,
    latencyMs: 0,
  };
}

// ---------------------------------------------------------------------------
// L0.5：语义缓存（HTTP → Python Router，超时见 getSemanticCacheCheckMs，ISSUE-V4-03）
// ---------------------------------------------------------------------------

async function checkSemanticCacheLayer(
  messages: ChatMessage[],
): Promise<RouteOutput | null> {
  try {
    const resp = await fetch(`${config.pythonRouterUrl}/cache/semantic/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: toRouterMessageItems(messages),
        model: "",
      }),
      signal: AbortSignal.timeout(getSemanticCacheCheckMs()),
    });

    if (!resp.ok) return null;

    const data = (await resp.json()) as {
      hit: boolean;
      cached_response: ChatCompletionResponse | null;
      similarity: number;
      model?: string;
    };

    if (data.hit && data.cached_response) {
      return {
        decision: {
          matched: true,
          layer: "L0.5_SEMANTIC_CACHE",
          targetModel: data.model || data.cached_response.model || "cached",
          confidence: data.similarity || 1.0,
          latencyMs: 0,
        },
        cachedResponse: data.cached_response,
      };
    }
    return null;
  } catch {
    logger.debug("L0.5 语义缓存检查失败或超时");
    return null;
  }
}

// ---------------------------------------------------------------------------
// L2：语义路由（HTTP → Python Router，55ms 超时）
// ---------------------------------------------------------------------------
async function callL2Semantic(
  messages: ChatMessage[],
  estimatedTokens: number,
): Promise<RouteDecisionResult> {
  const start = performance.now();
  try {
    const res = await fetch(`${config.pythonRouterUrl}/route/semantic`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: toRouterMessageItems(messages),
        estimated_tokens: estimatedTokens,
      }),
      signal: AbortSignal.timeout(config.timeouts.l2Semantic),
    });

    if (!res.ok) {
      return miss("L2_SEMANTIC", start);
    }

    const data = (await res.json()) as {
      matched: boolean;
      target_model: string | null;
      confidence: number;
      route_name?: string | null;
    };

    if (data.matched && data.target_model) {
      return {
        matched: true,
        layer: "L2_SEMANTIC",
        targetModel: data.target_model,
        confidence: data.confidence,
        routeName: data.route_name ?? undefined,
        latencyMs: performance.now() - start,
      };
    }
    return miss("L2_SEMANTIC", start);
  } catch {
    logger.debug("L2 语义路由调用失败或超时");
    return miss("L2_SEMANTIC", start);
  }
}

// ---------------------------------------------------------------------------
// L3：Arch-Router（HTTP → Python Router，140ms 超时）
// ---------------------------------------------------------------------------
async function callL3ArchRouter(
  messages: ChatMessage[],
  estimatedTokens: number,
): Promise<RouteDecisionResult> {
  const start = performance.now();
  try {
    const res = await fetch(`${config.pythonRouterUrl}/route/arch-router`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: toRouterMessageItems(messages),
        estimated_tokens: estimatedTokens,
      }),
      signal: AbortSignal.timeout(config.timeouts.l3ArchRouter),
    });

    if (!res.ok) {
      return miss("L3_ARCH_ROUTER", start);
    }

    const data = (await res.json()) as {
      matched: boolean;
      target_model: string | null;
      confidence: number;
    };

    if (data.matched && data.target_model) {
      return {
        matched: true,
        layer: "L3_ARCH_ROUTER",
        targetModel: data.target_model,
        confidence: data.confidence,
        latencyMs: performance.now() - start,
      };
    }
    return miss("L3_ARCH_ROUTER", start);
  } catch {
    logger.debug("L3 Arch-Router 调用失败或超时");
    return miss("L3_ARCH_ROUTER", start);
  }
}

// ---------------------------------------------------------------------------
// Fallback：从数据库取第一个启用的模型
// ---------------------------------------------------------------------------
async function getDefaultModel(): Promise<string | null> {
  try {
    const pool = getDbPool();
    const result = await pool.query<{ name: string; modelId: string }>(
      `SELECT p.name, m."modelId"
       FROM models m
       JOIN providers p ON p.id = m."providerId"
       WHERE m.enabled = true AND p.enabled = true
       ORDER BY p.name, m."modelId"
       LIMIT 1`,
    );
    if (result.rows.length === 0) return null;
    return `${result.rows[0].name}/${result.rows[0].modelId}`;
  } catch (err) {
    logger.error("查询默认模型失败", { error: err });
    return null;
  }
}

// ---------------------------------------------------------------------------
// 主决策入口
// ---------------------------------------------------------------------------

export async function makeRouteDecision(
  model: string,
  messages: ChatMessage[],
  estimatedTokens: number,
): Promise<RouteOutput> {
  const chainStart = performance.now();

  // 非 auto 模式：用户指定模型，先检查 L0 精确缓存再返回
  if (model !== "auto") {
    const l0Start = performance.now();
    const cacheResult = await checkExactCacheLayer(model, messages);
    const l0LatencyMs = performance.now() - l0Start;
    if (cacheResult.hit) {
      return {
        decision: {
          matched: true,
          layer: "L0_EXACT_CACHE",
          targetModel: cacheResult.response.model,
          confidence: 1.0,
          latencyMs: l0LatencyMs,
        },
        cachedResponse: cacheResult.response,
      };
    }
    return {
      decision: {
        matched: true,
        layer: "L1_RULE",
        targetModel: model,
        confidence: 1.0,
        latencyMs: 0,
      },
      cachedResponse: null,
    };
  }

  // auto 模式：model 未知，跳过 L0（无法构造缓存 key）
  // ISSUE-V4-08（R-10）：显式 model 先跑 L0；model:auto 在解析 target 前不做 L0。
  // 命中差异请以 RequestLog.routingLayer + latencyMs 分桶对比，勿仅看单次全链耗时。

  // L0.5 语义缓存（不依赖 model，超时见 getSemanticCacheCheckMs）
  // 注：L1 命中后在本函数末尾用 targetModel 做 L0 精确缓存检查（同步 L1 + 异步 L0 await，不阻塞 L1）
  const semanticCache = await checkSemanticCacheLayer(messages);
  if (semanticCache) {
    return {
      decision: { ...semanticCache.decision, latencyMs: performance.now() - chainStart },
      cachedResponse: semanticCache.cachedResponse,
    };
  }

  // L1 → L2 → L3 → Fallback（解析目标模型）
  let resolvedDecision: RouteDecisionResult | null = null;

  // L1 规则引擎（同步，不含 await）
  const l1 = evaluateRules(messages, estimatedTokens);
  if (l1.matched) {
    resolvedDecision = l1;
  }

  // L2 语义路由（可关闭，见 system_config routing_enable_l2 / env ROUTING_ENABLE_L2，ISSUE-V5-09）
  if (!resolvedDecision && getRoutingEnableL2()) {
    const l2 = await callL2Semantic(messages, estimatedTokens);
    if (l2.matched) resolvedDecision = l2;
  }

  // L3 Arch-Router（可关闭，见 routing_enable_l3 / env ROUTING_ENABLE_L3，ISSUE-V5-09）
  if (!resolvedDecision && getRoutingEnableL3()) {
    const l3 = await callL3ArchRouter(messages, estimatedTokens);
    if (l3.matched) resolvedDecision = l3;
  }

  // Fallback：取默认模型
  if (!resolvedDecision) {
    const fallback = await getDefaultModel();
    resolvedDecision = {
      matched: fallback !== null,
      layer: "L3_FALLBACK",
      targetModel: fallback,
      confidence: 0,
      latencyMs: performance.now() - chainStart,
    };

    // 递增 Fallback 计数器
    setImmediate(() => {
      incrementFallbackCounter().catch((e) =>
        logger.error("Fallback 计数器递增失败", { error: e }),
      );
    });
  }

  // 模型已解析，用解析后的模型检查 L0 精确缓存
  if (resolvedDecision.targetModel) {
    const l0Start = performance.now();
    const cacheResult = await checkExactCacheLayer(resolvedDecision.targetModel, messages);
    const l0LatencyMs = performance.now() - l0Start;
    if (cacheResult.hit) {
      return {
        decision: {
          matched: true,
          layer: "L0_EXACT_CACHE",
          targetModel: cacheResult.response.model,
          confidence: 1.0,
          latencyMs: l0LatencyMs,
        },
        cachedResponse: cacheResult.response,
      };
    }
  }

  return {
    decision: { ...resolvedDecision, latencyMs: performance.now() - chainStart },
    cachedResponse: null,
  };
}

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

function miss(
  layer: "L2_SEMANTIC" | "L3_ARCH_ROUTER",
  start: number,
): RouteDecisionResult {
  return {
    matched: false,
    layer,
    targetModel: null,
    confidence: 0,
    latencyMs: performance.now() - start,
  };
}

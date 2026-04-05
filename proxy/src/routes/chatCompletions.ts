// POST /v1/chat/completions — OpenAI 兼容请求入口
import { Router } from "express";
import type { Request, Response as ExpressResponse } from "express";
import { z } from "zod";
import type { ChatCompletionResponse } from "../types/index.js";
import { AppError } from "../middleware/errorHandler.js";
import { validate } from "../middleware/validate.js";
import { logger } from "../utils/logger.js";
import { estimateMessagesTokens } from "../utils/tokenEstimator.js";
import { detectModalities } from "../utils/multimodal.js";
import { makeRouteDecision } from "../routing/routeDecision.js";
import { resolveProvider } from "../providers/registry.js";
import { logRequest } from "../cache/requestLogger.js";
import { config } from "../config.js";
import {
  executeWithCircuitBreaker,
} from "../circuit/circuitBreaker.js";
import type { ResolvedProvider } from "../providers/registry.js";
import { getFallbackOnInvalidL1Target } from "../runtimeConfig.js";
import { writeExactCache } from "../cache/exactCache.js";
import { getDbPool } from "../cache/db.js";
import { incrementFallbackCounter } from "../cache/redis.js";
import { UpstreamCallError } from "../types/errors.js";
import { scheduleRuleHitUpdate } from "../routing/ruleHit.js";
import { estimateCostUsd } from "../utils/costEstimate.js";

// --- 多模态 content 校验 (ISSUE-V5-16) ---
const textContentPartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});
const imageUrlContentPartSchema = z.object({
  type: z.literal("image_url"),
  image_url: z.object({
    url: z.string(),
    detail: z.enum(["auto", "low", "high"]).optional(),
  }),
});
const inputAudioContentPartSchema = z.object({
  type: z.literal("input_audio"),
  input_audio: z.object({
    data: z.string(),
    format: z.enum(["wav", "mp3"]),
  }),
});
const contentPartSchema = z.discriminatedUnion("type", [
  textContentPartSchema,
  imageUrlContentPartSchema,
  inputAudioContentPartSchema,
]);
const messageContentSchema = z.union([
  z.string(),
  z.array(contentPartSchema).min(1),
]);

export const chatCompletionSchema = z.object({
  model: z.string().default("auto"),
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant", "tool"]),
        content: messageContentSchema,
        name: z.string().optional(),
      }),
    )
    .min(1),
  stream: z.boolean().optional().default(false),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional(),
  top_p: z.number().min(0).max(1).optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
  presence_penalty: z.number().min(-2).max(2).optional(),
  stop: z.union([z.string(), z.array(z.string()), z.null()]).optional(),
  user: z.string().optional(),
  thinking: z.object({
    enabled: z.boolean(),
    budget_tokens: z.number().int().positive().optional(),
  }).optional(),
});

type ChatBody = z.infer<typeof chatCompletionSchema>;

const router = Router();

router.post("/", validate(chatCompletionSchema), async (req: Request, res: ExpressResponse) => {
  const startTime = performance.now();
  const body = req.body as ChatBody;
  const estimatedTokens = estimateMessagesTokens(body.messages);
  const detectedModalities = detectModalities(body.messages);
  const apiToken = (res.locals as Record<string, unknown>).apiToken as { id: string | null; name: string | null } | undefined;

  const output = await makeRouteDecision(body.model, body.messages, estimatedTokens);

  if (output.decision.layer === "L1_RULE" && output.decision.ruleId) {
    scheduleRuleHitUpdate(output.decision.ruleId);
  }

  if (output.cachedResponse) {
    res.json(output.cachedResponse);
    emitLog(
      output.decision.layer,
      output.decision.ruleId ?? null,
      output.cachedResponse.model,
      output.decision.confidence,
      startTime,
      output.decision.latencyMs,
      {
        inputTokens: estimatedTokens,
        outputTokens: 0,
        estimatedCostUsd: 0,
        statusCode: 200,
      },
      body.stream,
      true,
      body.thinking?.enabled ?? false,
      detectedModalities,
      apiToken?.id ?? null,
      apiToken?.name ?? null,
    );
    return;
  }

  const targetModel = output.decision.targetModel;
  if (!targetModel) {
    throw new AppError(502, "server_error", "all_providers_failed", "无法确定目标模型，请先配置至少一个 Provider 和模型");
  }

  const fallbackTargets = await getFallbackTargets(
    targetModel,
    output.decision.fallbackChain,
  );

  interface ProviderCallResult {
    response: globalThis.Response;
    resolvedTarget: string;
    modelId: string;
    effectiveThinkingEnabled: boolean;
  }

  const retryInvalidL1 =
    getFallbackOnInvalidL1Target() && output.decision.layer === "L1_RULE";

  let providerCallResult: ProviderCallResult | undefined;
  let lastChainError: Error | null = null;

  try {
    for (const chainTarget of fallbackTargets) {
      let resolved: ResolvedProvider;
      try {
        resolved = await resolveProvider(chainTarget);
      } catch (err) {
        if (
          retryInvalidL1 &&
          err instanceof AppError &&
          err.code === "model_not_found" &&
          (err.statusCode === 400 || err.statusCode === 404)
        ) {
          lastChainError = err as Error;
          setImmediate(() => {
            incrementFallbackCounter().catch((e) =>
              logger.error("Fallback 计数器递增失败", { error: e }),
            );
          });
          logger.warn("L1 目标无法解析，已跳过并尝试 fallback", {
            target: chainTarget,
          });
          continue;
        }
        if (err instanceof AppError && err.statusCode === 404) {
          throw new UpstreamCallError(`模型不可用: ${chainTarget}`, 503);
        }
        throw err;
      }

      // 能力软门控 (ISSUE-V5-16)：多模态请求优先路由到具备对应能力的模型
      const modelFeatures = resolved.modelConfig?.features ?? [];
      if (
        detectedModalities.includes("vision") &&
        !modelFeatures.includes("vision") &&
        fallbackTargets.length > 1
      ) {
        logger.warn("模型不支持视觉能力，尝试 fallback", { target: chainTarget });
        lastChainError = new Error(`模型 ${chainTarget} 不支持视觉内容`);
        continue;
      }
      if (
        detectedModalities.includes("audio") &&
        !modelFeatures.includes("audio") &&
        fallbackTargets.length > 1
      ) {
        logger.warn("模型不支持音频能力，尝试 fallback", { target: chainTarget });
        lastChainError = new Error(`模型 ${chainTarget} 不支持音频内容`);
        continue;
      }

      try {
        providerCallResult = await executeWithCircuitBreaker(
          chainTarget,
          async () => {
            const providerBody = buildRequestBody(body, resolved.modelId, resolved.modelConfig, output.decision.thinkingStrategy);
            const thinkingField = providerBody.thinking as { enabled?: boolean } | undefined;
            const effectiveThinking = !!(thinkingField?.enabled);
            const controller = new AbortController();
            const timeoutHandle = setTimeout(() => controller.abort(), config.timeouts.providerApi);

            let resp: globalThis.Response;
            try {
              resp = await resolved.adapter.sendRequest({
                baseUrl: resolved.baseUrl,
                apiKey: resolved.apiKey,
                body: providerBody,
                stream: body.stream,
                signal: controller.signal,
              });
            } catch (err) {
              clearTimeout(timeoutHandle);
              if ((err as Error).name === "AbortError") {
                throw new UpstreamCallError("Provider 响应超时", 0);
              }
              throw new UpstreamCallError("Provider 请求失败", 500);
            }

            if (!resp.ok) {
              clearTimeout(timeoutHandle);
              throw new UpstreamCallError(`Provider 返回 HTTP ${resp.status}`, resp.status);
            }

            clearTimeout(timeoutHandle);
            return {
              response: resp,
              resolvedTarget: chainTarget,
              modelId: resolved.modelId,
              effectiveThinkingEnabled: effectiveThinking,
            };
          },
        );
        break;
      } catch (err) {
        if (err instanceof AppError) throw err;
        const statusCode = (err as { statusCode?: number }).statusCode ?? 0;
        if (statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
          throw err;
        }
        lastChainError = err as Error;
        logger.warn(`Fallback 目标 ${chainTarget} 失败，尝试下一个`, {
          error: (err as Error).message,
          statusCode,
        });
        setImmediate(() => {
          incrementFallbackCounter().catch((e) =>
            logger.error("Fallback 计数器递增失败", { error: e }),
          );
        });
      }
    }

    if (!providerCallResult) {
      throw lastChainError ?? new Error("所有 Provider 及 fallback 目标均失败");
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    const sc = (err as UpstreamCallError).statusCode ?? 500;
    if (sc === 0) throw new AppError(504, "upstream_error", "upstream_timeout", "Provider 响应超时");
    if (sc === 401 || sc === 403) throw new AppError(502, "upstream_error", "all_providers_failed", "Provider 认证失败");
    if (sc === 429) throw new AppError(429, "rate_limit_error", "rate_limited", "Provider 速率限制");
    throw new AppError(502, "upstream_error", "all_providers_failed", "所有 Provider 均失败");
  }

  if (providerCallResult === undefined) {
    throw new AppError(502, "server_error", "all_providers_failed", "所有 Provider 均失败");
  }

  const upstreamResponse = providerCallResult.response;
  const actualTarget = providerCallResult.resolvedTarget;

  if (actualTarget !== targetModel) {
    setImmediate(() => {
      incrementFallbackCounter().catch((e) => logger.error("Fallback 计数器递增失败", { error: e }));
    });
  }

  let statusCode = 200;

  if (body.stream) {
    const responseBody = upstreamResponse.body;
    if (!responseBody) {
      throw new AppError(502, "upstream_error", "upstream_disconnected", "Provider 返回空响应体");
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const cancelUpstream = (): void => {
      void responseBody.cancel().catch(() => undefined);
    };
    res.once("close", cancelUpstream);

    const decoder = new TextDecoder();
    let streamChars = 0;

    try {
      for await (const chunk of responseBody) {
        if (res.destroyed) break;
        streamChars += decoder.decode(chunk, { stream: true }).length;
        res.write(chunk);
      }
      streamChars += decoder.decode().length;
    } catch (err) {
      logger.error("SSE 流传输中断", { error: (err as Error).message });
      statusCode = 502;
    } finally {
      res.off("close", cancelUpstream);
      if (res.destroyed) cancelUpstream();
      if (!res.destroyed) res.end();
    }

    const outputTokens = Math.ceil(streamChars / 4);
    const inputTokens = estimatedTokens;
    const cost = estimateCostUsd(actualTarget, inputTokens, outputTokens);
    emitLog(
      output.decision.layer,
      output.decision.ruleId ?? null,
      actualTarget,
      output.decision.confidence,
      startTime,
      output.decision.latencyMs,
      {
        inputTokens,
        outputTokens,
        estimatedCostUsd: cost,
        statusCode,
      },
      true,
      output.decision.layer === "L0_EXACT_CACHE" || output.decision.layer === "L0.5_SEMANTIC_CACHE",
      providerCallResult.effectiveThinkingEnabled,
      detectedModalities,
      apiToken?.id ?? null,
      apiToken?.name ?? null,
    );
  } else {
    try {
      const data = (await upstreamResponse.json()) as ChatCompletionResponse;
      data.model = actualTarget;
      res.json(data);

      const usage = data.usage;
      const inputTokens = usage?.prompt_tokens ?? estimatedTokens;
      const outputTokens = usage?.completion_tokens ?? 0;
      const cost = estimateCostUsd(actualTarget, inputTokens, outputTokens);

      setImmediate(() => {
        writeExactCache(actualTarget, body.messages, data, config.cache.defaultExactTtl)
          .catch((err) => logger.error("精确缓存写入失败", { error: err }));
      });

      emitLog(
        output.decision.layer,
        output.decision.ruleId ?? null,
        actualTarget,
        output.decision.confidence,
        startTime,
        output.decision.latencyMs,
        {
          inputTokens,
          outputTokens,
          estimatedCostUsd: cost,
          statusCode: 200,
        },
        false,
        output.decision.layer === "L0_EXACT_CACHE" || output.decision.layer === "L0.5_SEMANTIC_CACHE",
        providerCallResult.effectiveThinkingEnabled,
        detectedModalities,
        apiToken?.id ?? null,
        apiToken?.name ?? null,
      );
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(502, "upstream_error", "upstream_disconnected", "Provider 响应解析失败");
    }
  }
});

export default router;

async function getFallbackTargets(
  primaryModel: string,
  ruleChain?: string[],
): Promise<string[]> {
  const seen = new Set<string>();
  const ordered: string[] = [];
  function push(m: string): void {
    if (!seen.has(m)) {
      seen.add(m);
      ordered.push(m);
    }
  }
  push(primaryModel);
  for (const m of ruleChain ?? []) {
    if (m && m !== primaryModel) push(m);
  }
  try {
    const pool = getDbPool();
    const result = await pool.query<{ name: string; modelId: string }>(
      `SELECT p.name, m."modelId"
       FROM models m
       JOIN providers p ON p.id = m."providerId"
       WHERE m.enabled = true AND p.enabled = true
       ORDER BY p.name, m."modelId"
       LIMIT 20`,
    );
    for (const r of result.rows) {
      const id = `${r.name}/${r.modelId}`;
      if (id !== primaryModel) push(id);
    }
  } catch {
    /* ignore */
  }
  return ordered;
}

function buildRequestBody(
  body: ChatBody,
  modelId: string,
  modelConfig?: { supportsThinking: boolean; defaultThinking: Record<string, unknown> },
  ruleThinkingStrategy?: "auto" | "enabled" | "disabled",
): Record<string, unknown> {
  const result: Record<string, unknown> = {
    model: modelId,
    messages: body.messages,
  };
  if (body.temperature !== undefined) result.temperature = body.temperature;
  if (body.max_tokens !== undefined) result.max_tokens = body.max_tokens;
  if (body.top_p !== undefined) result.top_p = body.top_p;
  if (body.frequency_penalty !== undefined) result.frequency_penalty = body.frequency_penalty;
  if (body.presence_penalty !== undefined) result.presence_penalty = body.presence_penalty;
  if (body.stop !== undefined) result.stop = body.stop;
  if (body.user !== undefined) result.user = body.user;

  // thinking / reasoning 优先级：规则强制 > 请求显式传入 > 模型 DB 默认
  if (ruleThinkingStrategy === "disabled") {
    // 规则强制关闭——不传 thinking
  } else if (ruleThinkingStrategy === "enabled") {
    // 规则强制开启——使用请求参数或 DB 默认
    if (body.thinking !== undefined) {
      result.thinking = body.thinking;
    } else if (
      modelConfig?.defaultThinking &&
      typeof modelConfig.defaultThinking === "object" &&
      Object.keys(modelConfig.defaultThinking).length > 0
    ) {
      result.thinking = { ...modelConfig.defaultThinking, enabled: true };
    } else {
      result.thinking = { enabled: true, budget_tokens: 4096 };
    }
  } else {
    // auto（默认）——请求显式传入优先；否则且模型支持则使用 DB 默认
    if (body.thinking !== undefined) {
      result.thinking = body.thinking;
    } else if (
      modelConfig?.supportsThinking &&
      modelConfig.defaultThinking &&
      typeof modelConfig.defaultThinking === "object" &&
      (modelConfig.defaultThinking as Record<string, unknown>).enabled === true
    ) {
      result.thinking = modelConfig.defaultThinking;
    }
  }
  return result;
}

function emitLog(
  layer: string,
  ruleId: string | null,
  targetModel: string,
  confidence: number,
  startTime: number,
  routingLatencyMs: number,
  usage: {
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
    statusCode: number;
  },
  streaming: boolean,
  cacheHit: boolean,
  thinkingEnabled: boolean,
  modalities: string[],
  apiTokenId: string | null,
  apiTokenName: string | null,
): void {
  const totalLatency = performance.now() - startTime;
  logRequest({
    routingLayer: layer,
    ruleId,
    targetModel,
    confidence,
    latencyMs: Math.round(totalLatency),
    routingLatencyMs: Math.round(routingLatencyMs),
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    estimatedCostUsd: usage.estimatedCostUsd,
    statusCode: usage.statusCode,
    streaming,
    cacheHit,
    thinkingEnabled,
    modalities,
    apiTokenId,
    apiTokenName,
  });
}

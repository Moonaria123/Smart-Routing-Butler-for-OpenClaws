// L1 规则引擎——启动时全量加载规则到内存，matchRule 必须同步执行（SLO: P99 < 2ms）
import type {
  Rule,
  RuleConditions,
  RuleConditionItem,
  ChatMessage,
  RouteDecisionResult,
} from "../types/index.js";
import { getDbPool } from "../cache/db.js";
import { estimateMessagesTokens } from "../utils/tokenEstimator.js";
import { extractText, detectModalities } from "../utils/multimodal.js";
import { logger } from "../utils/logger.js";
import {
  detectTaskType,
  normalizeTaskTypeLabel,
} from "./taskTypeHeuristics.js";

// ---- 内存缓存（同步访问，禁止 await） ----

let cachedRules: Rule[] = [];

interface ModelLookupInfo {
  inputCost: number;
  outputCost: number;
  features: string[];
}

const cachedModels = new Map<string, ModelLookupInfo>();

export interface ProviderHealthInfo {
  status: "green" | "yellow" | "red";
  p95LatencyMs: number;
}

const cachedProviderHealth = new Map<string, ProviderHealthInfo>();

// ---- 任务类型启发式检测 ----

// ---- 条件求值（全部同步） ----

function getLastUserMessage(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role === "user") return extractText(msg.content);
  }
  return "";
}

function evaluateItem(
  item: RuleConditionItem,
  lastUserMessage: string,
  estimatedTokens: number,
  detectedTaskType: string,
  targetModel: string,
  requestModalities: string[],
): boolean {
  switch (item.type) {
    case "keywords": {
      if (!item.keywords?.length) return false;
      const lower = lastUserMessage.toLowerCase();
      return item.keywords.some((kw) => lower.includes(kw.toLowerCase()));
    }

    case "tokenCount": {
      const min = item.minTokens ?? 0;
      const max = item.maxTokens ?? Infinity;
      return estimatedTokens >= min && estimatedTokens <= max;
    }

    case "taskType": {
      if (!item.taskTypes?.length) return false;
      const normalized = item.taskTypes.map((t) => normalizeTaskTypeLabel(t));
      return (
        normalized.includes(detectedTaskType) ||
        item.taskTypes.includes(detectedTaskType)
      );
    }

    case "maxCost": {
      if (item.maxCostPerMillion == null) return true;
      const model = cachedModels.get(targetModel);
      if (!model) return true;
      return model.inputCost <= item.maxCostPerMillion;
    }

    case "maxLatency": {
      if (item.maxLatencyMs == null) return true;
      const providerName = targetModel.split("/")[0];
      if (!providerName) return true;
      const health = cachedProviderHealth.get(providerName);
      if (!health) return true;
      return health.p95LatencyMs <= item.maxLatencyMs;
    }

    case "providerHealth": {
      if (!item.providerName || !item.healthStatus) return false;
      const health = cachedProviderHealth.get(item.providerName);
      if (!health) return false;
      return health.status === item.healthStatus;
    }

    case "hasModality": {
      if (!item.modalities?.length) return false;
      return item.modalities.some((m) => requestModalities.includes(m));
    }

    default:
      return false;
  }
}

function evaluateConditions(
  conditions: RuleConditions,
  lastUserMessage: string,
  estimatedTokens: number,
  detectedTaskType: string,
  targetModel: string,
  requestModalities: string[],
): boolean {
  const { combinator, items } = conditions;
  if (!items.length) return false;

  if (combinator === "AND") {
    return items.every((item) =>
      evaluateItem(
        item,
        lastUserMessage,
        estimatedTokens,
        detectedTaskType,
        targetModel,
        requestModalities,
      ),
    );
  }

  // OR
  return items.some((item) =>
    evaluateItem(
      item,
      lastUserMessage,
      estimatedTokens,
      detectedTaskType,
      targetModel,
      requestModalities,
    ),
  );
}

// ---- 公开 API ----

/**
 * 同步规则匹配——禁止 await，第一个命中的规则立即返回。
 * estimatedTokens 可选，省略时自动估算。
 */
export function matchRule(
  messages: ChatMessage[],
  estimatedTokens?: number,
): RouteDecisionResult | null {
  const start = performance.now();
  const tokens = estimatedTokens ?? estimateMessagesTokens(messages);
  const lastUserMessage = getLastUserMessage(messages);
  const detectedTaskType = detectTaskType(lastUserMessage);
  const requestModalities = detectModalities(messages);

  for (const rule of cachedRules) {
    if (!rule.enabled) continue;

    if (
      evaluateConditions(
        rule.conditions,
        lastUserMessage,
        tokens,
        detectedTaskType,
        rule.targetModel,
        requestModalities,
      )
    ) {
      return {
        matched: true,
        layer: "L1_RULE",
        targetModel: rule.targetModel,
        confidence: 1.0,
        ruleId: rule.id,
        fallbackChain: rule.fallbackChain ?? [],
        thinkingStrategy: rule.thinkingStrategy ?? "auto",
        latencyMs: performance.now() - start,
      };
    }
  }

  return null;
}

/** 从 PostgreSQL 全量加载规则到内存，按 priority 降序排列 */
export async function loadRules(): Promise<void> {
  const pool = getDbPool();

  const { rows } = await pool.query<{
    id: string;
    name: string;
    priority: number;
    enabled: boolean;
    conditions: RuleConditions;
    targetModel: string;
    fallbackChain: string[];
    thinkingStrategy: string;
    description: string | null;
    hitCount: number;
    lastHitAt: Date | null;
  }>(
    `SELECT id, name, priority, enabled, conditions,
            "targetModel", "fallbackChain", "thinkingStrategy",
            description, "hitCount", "lastHitAt"
     FROM rules
     ORDER BY priority DESC`,
  );

  cachedRules = rows.map((r) => ({
    id: r.id,
    name: r.name,
    priority: r.priority,
    enabled: r.enabled,
    conditions:
      typeof r.conditions === "string"
        ? (JSON.parse(r.conditions) as RuleConditions)
        : r.conditions,
    targetModel: r.targetModel,
    fallbackChain: r.fallbackChain ?? [],
    thinkingStrategy: (r.thinkingStrategy as Rule["thinkingStrategy"]) ?? "auto",
    description: r.description,
    hitCount: r.hitCount,
    lastHitAt: r.lastHitAt,
  }));

  logger.info(`规则引擎已加载 ${cachedRules.length} 条规则`);
}

/** 从 PostgreSQL 加载模型费用信息到内存（供 maxCost 条件使用） */
export async function loadModels(): Promise<void> {
  const pool = getDbPool();

  const { rows } = await pool.query<{
    modelId: string;
    inputCost: number;
    outputCost: number;
    providerName: string;
    features: string[];
  }>(
    `SELECT m."modelId", m."inputCost", m."outputCost", p.name AS "providerName", m.features
     FROM models m
     JOIN providers p ON m."providerId" = p.id
     WHERE m.enabled = true AND p.enabled = true`,
  );

  cachedModels.clear();
  for (const row of rows) {
    cachedModels.set(`${row.providerName}/${row.modelId}`, {
      inputCost: row.inputCost,
      outputCost: row.outputCost,
      features: row.features ?? [],
    });
  }

  logger.info(`规则引擎已加载 ${cachedModels.size} 个模型配置`);
}

/** 更新 Provider 健康状态缓存（供 providerHealth / maxLatency 条件使用） */
export function updateProviderHealth(
  providerName: string,
  health: ProviderHealthInfo,
): void {
  cachedProviderHealth.set(providerName, health);
}

/** 返回当前内存中的规则列表（供管理 API 使用） */
export function getRules(): Rule[] {
  return cachedRules;
}

/** 按 provider/modelId 查询 USD/1M tokens 单价（供成本估算，同步读取内存缓存） */
export function getModelPricePerMillion(
  modelKey: string,
): { inputCost: number; outputCost: number } | null {
  const m = cachedModels.get(modelKey);
  if (!m) return null;
  return { inputCost: m.inputCost, outputCost: m.outputCost };
}

// 路由规则 Zod Schema — 客户端与服务端共享验证
import { z } from "zod";

export const conditionItemSchema = z.object({
  type: z.enum([
    "keywords",
    "tokenCount",
    "taskType",
    "maxCost",
    "maxLatency",
    "providerHealth",
    "hasModality",
  ]),
  keywords: z.array(z.string()).optional(),
  minTokens: z.number().optional(),
  maxTokens: z.number().optional(),
  taskTypes: z.array(z.string()).optional(),
  maxCostPerMillion: z.number().optional(),
  maxLatencyMs: z.number().optional(),
  providerName: z.string().optional(),
  healthStatus: z.enum(["green", "yellow", "red"]).optional(),
  modalities: z.array(z.string()).optional(),
});

export const conditionsSchema = z.object({
  combinator: z.enum(["AND", "OR"]),
  items: z.array(conditionItemSchema).min(1),
});

export const ruleSchema = z.object({
  name: z.string().min(1, "规则名称不能为空"),
  nameEn: z.string().optional(),
  priority: z.number().int().min(0).max(1000).default(500),
  enabled: z.boolean().default(true),
  conditions: conditionsSchema,
  targetModel: z.string().min(1, "目标模型不能为空"),
  fallbackChain: z.array(z.string()).max(3).default([]),
  thinkingStrategy: z.enum(["auto", "enabled", "disabled"]).default("auto"),
  description: z.string().optional(),
  descriptionEn: z.string().optional(),
});

export type ConditionItem = z.infer<typeof conditionItemSchema>;
export type Conditions = z.infer<typeof conditionsSchema>;
export type RuleFormData = z.infer<typeof ruleSchema>;

export const CONDITION_TYPE_LABELS: Record<ConditionItem["type"], string> = {
  keywords: "关键词匹配",
  tokenCount: "Token 数量范围",
  taskType: "任务类型",
  maxCost: "最大成本",
  maxLatency: "最大延迟",
  providerHealth: "Provider 健康状态",
  hasModality: "多模态内容类型",
};

export const TASK_TYPE_OPTIONS = [
  "chat",
  "coding",
  "translation",
  "summarization",
  "analysis",
  "creative",
  "math",
] as const;

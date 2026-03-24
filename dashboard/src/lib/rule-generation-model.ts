// 规则生成（NL/问卷向导）目标模型 — 读 system_config，无效时回退 cheapest 模型
import { db } from "@/lib/db";
import { findCheapestModel } from "@/lib/llm";

/** system_config.key，值为 `{ targetModel: string | null }` */
export const RULE_GENERATION_TARGET_MODEL_KEY = "rule_generation_target_model";

/** system_config.key，值为 `{ temperature: number }`（ISSUE-V3-17） */
export const RULE_GENERATION_TEMPERATURE_KEY = "rule_generation_temperature";

/** 未配置时的默认采样温度（与 UI 推荐文案一致） */
export const DEFAULT_RULE_GENERATION_TEMPERATURE = 0.2;

type StoredShape = { targetModel?: string | null };
type TempStoredShape = { temperature?: number };

export function parseRuleGenerationStored(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (
    typeof value === "object" &&
    !Array.isArray(value) &&
    "targetModel" in (value as object)
  ) {
    const tm = (value as StoredShape).targetModel;
    if (typeof tm === "string" && tm.trim().length > 0) return tm.trim();
  }
  return null;
}

export function parseRuleGenerationTemperature(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (
    typeof value === "object" &&
    !Array.isArray(value) &&
    "temperature" in (value as object)
  ) {
    const t = (value as TempStoredShape).temperature;
    if (typeof t === "number" && Number.isFinite(t)) return t;
  }
  return null;
}

/** 读取 NL/问卷 LLM 使用的 temperature，非法或未配置时返回默认值 */
export async function getRuleGenerationTemperature(): Promise<number> {
  const row = await db.systemConfig.findUnique({
    where: { key: RULE_GENERATION_TEMPERATURE_KEY },
  });
  const t = parseRuleGenerationTemperature(row?.value);
  if (t === null) return DEFAULT_RULE_GENERATION_TEMPERATURE;
  if (t < 0 || t > 2) return DEFAULT_RULE_GENERATION_TEMPERATURE;
  return t;
}

/** 校验 `ProviderName/modelId` 是否对应已启用 Provider + 模型 */
export async function validateProxyModelId(id: string): Promise<boolean> {
  const i = id.indexOf("/");
  if (i <= 0 || i === id.length - 1) return false;
  const providerName = id.slice(0, i);
  const modelId = id.slice(i + 1);
  const row = await db.model.findFirst({
    where: {
      modelId,
      enabled: true,
      provider: { name: providerName, enabled: true },
    },
    select: { id: true },
  });
  return Boolean(row);
}

/** NL/向导共用的解析后模型 ID（与 Proxy `model` 字段一致） */
export async function getResolvedRuleGenerationModel(): Promise<string | null> {
  const row = await db.systemConfig.findUnique({
    where: { key: RULE_GENERATION_TARGET_MODEL_KEY },
  });
  const configured = parseRuleGenerationStored(row?.value);
  if (!configured) return findCheapestModel();
  const ok = await validateProxyModelId(configured);
  if (!ok) return findCheapestModel();
  return configured;
}

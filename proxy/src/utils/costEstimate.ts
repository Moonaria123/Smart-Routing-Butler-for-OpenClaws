// 请求成本估算——基于 USD/1M tokens 与 token 计数（与 BRD US-001 公式一致，禁止 tiktoken）
import { getModelPricePerMillion } from "../routing/ruleEngine.js";

/** 估算单次请求成本（美元） */
export function estimateCostUsd(
  targetModel: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const p = getModelPricePerMillion(targetModel);
  if (!p) return 0;
  return (inputTokens / 1_000_000) * p.inputCost + (outputTokens / 1_000_000) * p.outputCost;
}

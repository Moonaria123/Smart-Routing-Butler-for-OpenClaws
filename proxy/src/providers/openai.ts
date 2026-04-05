// OpenAI 适配器——透明转发至 OpenAI 兼容端点，thinking → reasoning_effort 映射
import type { ProviderAdapter, ProviderRequestParams, ProviderImageRequestParams } from "./base.js";
import { buildChatCompletionsUrl, buildImageGenerationsUrl } from "../utils/chatCompletionsUrl.js";

/**
 * 将统一 thinking 参数映射为 OpenAI reasoning_effort。
 * budget_tokens ≤ 1024 → low，≤ 4096 → medium，其余 → high。
 */
function mapThinkingToReasoningEffort(
  thinking: { enabled?: boolean; budget_tokens?: number } | undefined,
): string | undefined {
  if (!thinking?.enabled) return undefined;
  const budget = thinking.budget_tokens ?? 4096;
  if (budget <= 1024) return "low";
  if (budget <= 4096) return "medium";
  return "high";
}

export class OpenAIAdapter implements ProviderAdapter {
  async sendRequest(params: ProviderRequestParams): Promise<Response> {
    const { baseUrl, apiKey, body, stream, signal } = params;

    const url = buildChatCompletionsUrl(baseUrl);

    const outBody: Record<string, unknown> = { ...body, stream };
    const thinking = outBody.thinking as { enabled?: boolean; budget_tokens?: number } | undefined;
    const effort = mapThinkingToReasoningEffort(thinking);
    if (effort) {
      outBody.reasoning_effort = effort;
    }
    // OpenAI 不识别 thinking 字段，移除以免 400
    delete outBody.thinking;

    return fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(outBody),
      signal,
    });
  }

  async sendImageRequest(params: ProviderImageRequestParams): Promise<Response> {
    const { baseUrl, apiKey, body, signal } = params;
    const url = buildImageGenerationsUrl(baseUrl);
    return fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });
  }
}

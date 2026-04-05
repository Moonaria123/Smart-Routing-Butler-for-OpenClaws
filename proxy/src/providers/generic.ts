// 通用 OpenAI 兼容适配器——baseUrl 作为完整前缀直接使用，透传 thinking（兼容 DeepSeek 等）
import type { ProviderAdapter, ProviderRequestParams, ProviderImageRequestParams } from "./base.js";
import { buildChatCompletionsUrl, buildImageGenerationsUrl } from "../utils/chatCompletionsUrl.js";

export class GenericAdapter implements ProviderAdapter {
  async sendRequest(params: ProviderRequestParams): Promise<Response> {
    const { baseUrl, apiKey, body, stream, signal } = params;

    const url = buildChatCompletionsUrl(baseUrl);

    // 通用适配器保留 thinking 字段——DeepSeek 等兼容上游直接接受
    return fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...body, stream }),
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

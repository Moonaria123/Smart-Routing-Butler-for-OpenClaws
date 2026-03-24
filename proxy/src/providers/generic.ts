// 通用 OpenAI 兼容适配器——baseUrl 作为完整前缀直接使用
import type { ProviderAdapter, ProviderRequestParams } from "./base.js";
import { buildChatCompletionsUrl } from "../utils/chatCompletionsUrl.js";

export class GenericAdapter implements ProviderAdapter {
  async sendRequest(params: ProviderRequestParams): Promise<Response> {
    const { baseUrl, apiKey, body, stream, signal } = params;

    const url = buildChatCompletionsUrl(baseUrl);

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
}

// OpenAI 适配器——透明转发至 OpenAI 兼容端点
import type { ProviderAdapter, ProviderRequestParams } from "./base.js";
import { buildChatCompletionsUrl } from "../utils/chatCompletionsUrl.js";

export class OpenAIAdapter implements ProviderAdapter {
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

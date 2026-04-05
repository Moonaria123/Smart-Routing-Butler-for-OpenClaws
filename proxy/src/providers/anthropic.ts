// Anthropic 适配器——OpenAI 格式 ↔ Anthropic Messages API 格式双向转换
import type { ProviderAdapter, ProviderRequestParams } from "./base.js";
import type { ChatCompletionResponse, MessageContent } from "../types/index.js";
import { extractText } from "../utils/multimodal.js";

const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 4096;

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

interface AnthropicResponseBody {
  id: string;
  type: string;
  role: string;
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: string | null;
  usage: { input_tokens: number; output_tokens: number };
}

interface AnthropicStreamEvent {
  type: string;
  message?: { id: string; model: string };
  delta?: { type?: string; text?: string; stop_reason?: string | null };
}

function mapStopReason(reason: string | null | undefined): "stop" | "length" | null {
  if (!reason) return null;
  if (reason === "max_tokens") return "length";
  return "stop";
}

function buildOpenAIChunk(
  id: string,
  model: string,
  created: number,
  delta: Record<string, unknown>,
  finishReason: "stop" | "length" | null,
): Record<string, unknown> {
  return {
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
}

/**
 * 将 Anthropic SSE 流转换为 OpenAI SSE 格式的 ReadableStream。
 * 内部维护行缓冲区以处理跨 chunk 的 SSE 事件拆分。
 */
function transformAnthropicSSE(
  source: ReadableStream<Uint8Array>,
  model: string,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let messageId = `chatcmpl-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  const reader = source.getReader();

  function processEvent(raw: string, ctrl: ReadableStreamDefaultController<Uint8Array>): void {
    const dataLine = raw.split("\n").find((l) => l.startsWith("data: "));
    if (!dataLine) return;
    const jsonStr = dataLine.slice(6).trim();
    if (!jsonStr) return;

    try {
      const evt = JSON.parse(jsonStr) as AnthropicStreamEvent;
      emitChunk(evt, ctrl);
    } catch {
      /* 跳过无法解析的事件 */
    }
  }

  function emitChunk(evt: AnthropicStreamEvent, ctrl: ReadableStreamDefaultController<Uint8Array>): void {
    switch (evt.type) {
      case "message_start": {
        if (evt.message?.id) messageId = evt.message.id;
        const chunk = buildOpenAIChunk(messageId, model, created, { role: "assistant" }, null);
        ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
        break;
      }
      case "content_block_delta": {
        if (evt.delta?.type === "text_delta" && evt.delta.text !== undefined) {
          const chunk = buildOpenAIChunk(messageId, model, created, { content: evt.delta.text }, null);
          ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
        }
        break;
      }
      case "message_delta": {
        const reason = mapStopReason(evt.delta?.stop_reason);
        const chunk = buildOpenAIChunk(messageId, model, created, {}, reason);
        ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
        break;
      }
      case "message_stop": {
        ctrl.enqueue(encoder.encode("data: [DONE]\n\n"));
        break;
      }
    }
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();

      if (value) {
        buffer += decoder.decode(value, { stream: true });
      }

      if (done) {
        if (buffer.trim()) {
          for (const part of buffer.split("\n\n")) {
            processEvent(part, controller);
          }
        }
        controller.close();
        return;
      }

      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        processEvent(part, controller);
      }
    },
    cancel() {
      reader.releaseLock();
    },
  });
}

/**
 * Convert OpenAI-style multimodal content to Anthropic content format.
 * - string → string (unchanged)
 * - array of content parts → mapped to Anthropic content blocks
 * - fallback → String(content)
 */
function convertContentForAnthropic(content: unknown): unknown {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part: Record<string, unknown>) => {
      if (part.type === "text") {
        return { type: "text", text: part.text };
      }
      if (part.type === "image_url") {
        const imageUrl = part.image_url as { url: string } | undefined;
        const url = imageUrl?.url ?? "";
        const dataUriMatch = url.match(/^data:(image\/[^;]+);base64,(.+)$/s);
        if (dataUriMatch) {
          return {
            type: "image",
            source: { type: "base64", media_type: dataUriMatch[1], data: dataUriMatch[2] },
          };
        }
        return { type: "image", source: { type: "url", url } };
      }
      if (part.type === "input_audio") {
        return { type: "text", text: "[audio content]" };
      }
      return { type: "text", text: String(part.text ?? "") };
    });
  }
  return String(content);
}

export class AnthropicAdapter implements ProviderAdapter {
  async sendRequest(params: ProviderRequestParams): Promise<Response> {
    const { baseUrl, apiKey, body, stream, signal } = params;

    const messages = body.messages as Array<{ role: string; content: unknown }>;
    let systemPrompt: string | undefined;
    const filteredMessages: Array<{ role: string; content: unknown }> = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        const text = extractText(msg.content as MessageContent);
        systemPrompt = systemPrompt ? `${systemPrompt}\n${text}` : text;
      } else {
        filteredMessages.push({ role: msg.role, content: convertContentForAnthropic(msg.content) });
      }
    }

    const anthropicBody: Record<string, unknown> = {
      model: body.model as string,
      messages: filteredMessages,
      max_tokens: (body.max_tokens as number | undefined) ?? DEFAULT_MAX_TOKENS,
      stream,
    };

    if (systemPrompt) anthropicBody.system = systemPrompt;
    if (body.temperature !== undefined) anthropicBody.temperature = body.temperature;
    if (body.top_p !== undefined) anthropicBody.top_p = body.top_p;
    const thinking = body.thinking as { enabled?: boolean; budget_tokens?: number } | undefined;
    if (thinking?.enabled) {
      anthropicBody.thinking = {
        type: "enabled",
        budget_tokens: thinking.budget_tokens ?? 4096,
      };
    }
    if (body.stop !== undefined) {
      const stop = body.stop;
      anthropicBody.stop_sequences = Array.isArray(stop) ? stop : (typeof stop === "string" ? [stop] : undefined);
    }

    const base = baseUrl.replace(/\/+$/, "");
    const url = `${base}/v1/messages`;

    const upstreamResponse = await fetch(url, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify(anthropicBody),
      signal,
    });

    if (!upstreamResponse.ok) return upstreamResponse;

    const modelStr = body.model as string;

    if (stream) {
      if (!upstreamResponse.body) return upstreamResponse;
      const transformed = transformAnthropicSSE(upstreamResponse.body, modelStr);
      return new Response(transformed, {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
        },
      });
    }

    const data = (await upstreamResponse.json()) as AnthropicResponseBody;
    const textContent = data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");

    const openaiResponse: ChatCompletionResponse = {
      id: data.id,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: modelStr,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: textContent },
          finish_reason: mapStopReason(data.stop_reason),
        },
      ],
      usage: {
        prompt_tokens: data.usage.input_tokens,
        completion_tokens: data.usage.output_tokens,
        total_tokens: data.usage.input_tokens + data.usage.output_tokens,
      },
    };

    return new Response(JSON.stringify(openaiResponse), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
}

// Token 估算——禁止引入 tiktoken，使用字符数 / 4 的简单公式
import type { MessageContent } from "../types/index.js";
import { contentCharLength } from "./multimodal.js";

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateMessagesTokens(
  messages: { role: string; content: MessageContent }[]
): number {
  const totalChars = messages.reduce(
    (sum, m) => sum + m.role.length + contentCharLength(m.content) + 4,
    0
  );
  return Math.ceil(totalChars / 4);
}

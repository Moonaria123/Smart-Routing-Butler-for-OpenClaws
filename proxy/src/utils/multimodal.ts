// 多模态内容处理工具——同步、零分配路径，适用于 L1 规则引擎 SLO (ISSUE-V5-16)
import type { MessageContent, ChatMessage } from "../types/index.js";

/** 从 MessageContent 中提取所有纯文本（string 原样返回，content-parts 拼接所有 text 块） */
export function extractText(content: MessageContent): string {
  if (typeof content === "string") return content;
  const parts: string[] = [];
  for (const p of content) {
    if (p.type === "text") parts.push(p.text);
  }
  return parts.join("\n");
}

/** 检测请求消息中包含的模态类型（始终含 "text"） */
export function detectModalities(messages: ChatMessage[]): string[] {
  const modalities = new Set<string>(["text"]);
  for (const msg of messages) {
    if (typeof msg.content === "string") continue;
    if (!Array.isArray(msg.content)) continue;
    for (const part of msg.content) {
      if (part.type === "image_url") modalities.add("vision");
      if (part.type === "input_audio") modalities.add("audio");
    }
  }
  return [...modalities].sort();
}

/** 计算内容的等效字符数（供 token 估算使用） */
export function contentCharLength(content: MessageContent): number {
  if (typeof content === "string") return content.length;
  let len = 0;
  for (const part of content) {
    if (part.type === "text") {
      len += part.text.length;
    } else if (part.type === "image_url") {
      // 图片按 ~85 token 占位（低质量 ~765 tokens，此处取保守近似值）
      len += 340;
    } else if (part.type === "input_audio") {
      len += 200;
    }
  }
  return len;
}

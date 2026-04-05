// 将 Chat 消息转为 Router `MessageItem` 子集 — tool 等角色映射为 user，避免 L2/L3/语义缓存 422（AUDIT-010）
import type { ChatMessage } from "../types/index.js";
import { extractText } from "./multimodal.js";

export type RouterMessageItem = {
  role: "system" | "user" | "assistant";
  content: string;
};

/** 映射为 Router Pydantic `MessageItem`（仅 system | user | assistant），多模态内容提取纯文本 */
export function toRouterMessageItems(messages: ChatMessage[]): RouterMessageItem[] {
  return messages.map((m) => {
    const textContent = extractText(m.content);
    if (m.role === "system" || m.role === "user" || m.role === "assistant") {
      return { role: m.role, content: textContent };
    }
    if (m.role === "tool") {
      const name = m.name ? `(${m.name})` : "";
      return {
        role: "user",
        content: `[tool]${name}: ${textContent}`,
      };
    }
    return { role: "user", content: textContent };
  });
}

// 将 Chat 消息转为 Router `MessageItem` 子集 — tool 等角色映射为 user，避免 L2/L3/语义缓存 422（AUDIT-010）
import type { ChatMessage } from "../types/index.js";

export type RouterMessageItem = {
  role: "system" | "user" | "assistant";
  content: string;
};

/** 映射为 Router Pydantic `MessageItem`（仅 system | user | assistant） */
export function toRouterMessageItems(messages: ChatMessage[]): RouterMessageItem[] {
  return messages.map((m) => {
    if (m.role === "system" || m.role === "user" || m.role === "assistant") {
      return { role: m.role, content: m.content };
    }
    if (m.role === "tool") {
      const name = m.name ? `(${m.name})` : "";
      return {
        role: "user",
        content: `[tool]${name}: ${m.content}`,
      };
    }
    return { role: "user", content: m.content };
  });
}

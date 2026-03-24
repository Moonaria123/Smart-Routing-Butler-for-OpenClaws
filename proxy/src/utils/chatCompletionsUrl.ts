// OpenAI 兼容 chat/completions URL 拼接——避免误匹配路径中的「v1」子串

/** 将 baseUrl 规范为 chat/completions 完整 URL（与 GenericAdapter 规则一致） */
export function buildChatCompletionsUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  try {
    const u = new URL(base);
    const path = u.pathname.replace(/\/+$/, "") || "";
    if (path === "/v1" || path.endsWith("/v1")) {
      return `${base}/chat/completions`;
    }
    return `${base}/v1/chat/completions`;
  } catch {
    if (base.endsWith("/v1")) {
      return `${base}/chat/completions`;
    }
    return `${base}/v1/chat/completions`;
  }
}

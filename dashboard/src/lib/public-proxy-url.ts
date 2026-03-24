// 推导供 Agent / OpenAI 客户端填写的 Proxy API Base URL（含 /v1，与 OpenAI SDK baseURL 一致）

/** 将 origin 规范为 OpenAI 兼容 API 根路径：…/v1（chat 路径为 …/v1/chat/completions） */
function toOpenAiApiBase(originOrUrl: string): string {
  const trimmed = originOrUrl.trim().replace(/\/+$/, "");
  if (/\/v1$/i.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}/v1`;
}

/**
 * 供 Agent 填写的 OpenAI 兼容 Base URL（含 `/v1`）。
 * 生产/本地建议在 .env 中设置 `NEXT_PUBLIC_PROXY_URL`（如 `http://宿主机IP:8080`，会自动补 `/v1`）。
 */
export function getPublicProxyBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_PROXY_URL?.trim();
  if (explicit) {
    return toOpenAiApiBase(explicit);
  }
  if (typeof window === "undefined") {
    return "";
  }
  const host = window.location.hostname;
  const port = process.env.NEXT_PUBLIC_PROXY_PORT?.trim() || "8080";
  const protocol = window.location.protocol;
  return toOpenAiApiBase(`${protocol}//${host}:${port}`);
}

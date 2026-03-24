// URL 安全校验 — Provider 外连用 `isUrlSafe`；Ollama 本机探测用 `isOllamaProbeUrlAllowed`
// 防止 SSRF：对外部供应商 API 禁止内网；对 Ollama 允许宿主机/局域网并禁止云元数据主机名
export function isOllamaProbeUrlAllowed(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const hostname = url.hostname.toLowerCase();
    const blocked = [/^metadata\.google\.internal$/i, /^169\.254\.169\.254$/];
    return !blocked.some((p) => p.test(hostname));
  } catch {
    return false;
  }
}

export function isUrlSafe(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    const hostname = url.hostname.toLowerCase();

    const blockedPatterns = [
      /^localhost$/i,
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2\d|3[01])\./,
      /^192\.168\./,
      /^169\.254\./,
      /^0\./,
      /^\[::1\]$/,
      /^\[fc/i,
      /^\[fd/i,
      /^\[fe80/i,
      /^host\.docker\.internal$/i,
      /^metadata\.google\.internal$/i,
    ];

    return !blockedPatterns.some((pattern) => pattern.test(hostname));
  } catch {
    return false;
  }
}

// OpenAI 兼容上游「模型列表」URL 构造 — 与 proxy GenericAdapter 的 /v1 规则一致
/** @param baseUrl Provider.baseUrl（可含或不含尾部 /v1） */
export function buildOpenAiCompatibleModelsListUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  if (base.endsWith("/v1")) {
    return `${base}/models`;
  }
  return `${base}/v1/models`;
}

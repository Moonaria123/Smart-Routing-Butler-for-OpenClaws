// 阿里云百炼 Coding Plan OpenAI 兼容域名识别 — 部分网关不提供 GET /v1/models，与 chat 可达性解耦

/** 是否为 Coding Plan 类 dashscope 域名（OpenAI 兼容 Base 常为 .../v1） */
export function isLikelyDashScopeCodingOpenAiBase(baseUrl: string): boolean {
  try {
    const u = new URL(baseUrl);
    return /(^|\.)coding(-intl)?\.dashscope\.aliyuncs\.com$/i.test(u.hostname);
  } catch {
    return false;
  }
}

/** 供 UI/API 返回的说明文案（不暴露内部路径细节以外的敏感信息） */
export const DASHSCOPE_CODING_NO_MODELS_LIST_HINT =
  "该上游（常见于阿里云 Coding Plan）可能不提供 GET /v1/models；官方 OpenAI 兼容 Base 为 https://coding.dashscope.aliyuncs.com/v1（海外可为 coding-intl 域名），密钥为 sk-sp- 开头。聊天仍使用 POST …/v1/chat/completions；请在模型管理中手填套餐支持的 modelId。";

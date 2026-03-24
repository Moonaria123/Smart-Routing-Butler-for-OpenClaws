// LLM 调用辅助 — 通过自身 Proxy 发送请求实现 dogfooding（Token 自动签发，无需配置 INTERNAL_API_TOKEN）
import { db } from "@/lib/db";
import { getOrCreateInternalProxyToken } from "@/lib/internal-proxy-token";

const PROXY_URL = process.env.PROXY_URL || "http://proxy:8080";

function dashboardLlmTimeoutMs(): number {
  const raw = process.env.DASHBOARD_LLM_TIMEOUT_MS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(n) && n >= 10_000) return n;
  return 120_000;
}

/** 返回 Proxy 可解析的 `Provider名称/modelId`（与 rules、GET /v1/models 的 id 一致） */
export async function findCheapestModel(): Promise<string | null> {
  const row = await db.model.findFirst({
    where: { enabled: true, provider: { enabled: true } },
    orderBy: { inputCost: "asc" },
    select: { modelId: true, provider: { select: { name: true } } },
  });
  if (!row) return null;
  return `${row.provider.name}/${row.modelId}`;
}

interface LLMCallOptions {
  messages: Array<{ role: string; content: string }>;
  model?: string;
  jsonMode?: boolean;
  maxTokens?: number;
  temperature?: number;
}

interface LLMCallResult {
  content: string;
  error?: string;
}

export async function callLLM(
  opts: LLMCallOptions,
  requestUserId?: string
): Promise<LLMCallResult> {
  try {
    let bearer: string;
    if (process.env.INTERNAL_API_TOKEN?.trim()) {
      bearer = process.env.INTERNAL_API_TOKEN.trim();
    } else if (requestUserId) {
      bearer = await getOrCreateInternalProxyToken(requestUserId);
    } else {
      return {
        content: "",
        error: "LLM 调用失败：缺少用户上下文，无法自动签发内部 API Token",
      };
    }

    const res = await fetch(`${PROXY_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearer}`,
      },
      body: JSON.stringify({
        model: opts.model ?? "auto",
        messages: opts.messages,
        max_tokens: opts.maxTokens ?? 2000,
        temperature: opts.temperature ?? 0.3,
        ...(opts.jsonMode
          ? { response_format: { type: "json_object" } }
          : {}),
      }),
      signal: AbortSignal.timeout(dashboardLlmTimeoutMs()),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        content: "",
        error: `LLM 调用失败: HTTP ${res.status} — ${text.slice(0, 200)}`,
      };
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    return { content };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { content: "", error: `LLM 调用异常: ${msg}` };
  }
}

// GET /api/providers/:id/upstream-models — 请求上游 GET /v1/models 返回可用 modelId 列表
// OpenAI/兼容使用 Bearer；Anthropic 使用 x-api-key + anthropic-version
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { requireSession } from "@/lib/auth-guard";
import { isUrlSafe } from "@/lib/url-validator";
import { buildOpenAiCompatibleModelsListUrl } from "@/lib/openai-compatible-url";
import {
  DASHSCOPE_CODING_NO_MODELS_LIST_HINT,
  isLikelyDashScopeCodingOpenAiBase,
} from "@/lib/dashscope-coding";

type RouteCtx = { params: Promise<{ id: string }> };

const FETCH_TIMEOUT_MS = 15_000;

type OpenAiModelsJson = {
  data?: unknown;
};

function parseModelIds(body: unknown): string[] {
  if (typeof body !== "object" || body === null) return [];
  const data = (body as OpenAiModelsJson).data;
  if (!Array.isArray(data)) return [];
  const ids: string[] = [];
  for (const item of data) {
    if (
      typeof item === "object" &&
      item !== null &&
      "id" in item &&
      typeof (item as { id: unknown }).id === "string"
    ) {
      const id = (item as { id: string }).id.trim();
      if (id.length > 0) ids.push(id);
    }
  }
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

export async function GET(_request: NextRequest, ctx: RouteCtx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id: providerId } = await ctx.params;

  const provider = await db.provider.findUnique({
    where: { id: providerId },
    select: { baseUrl: true, apiKey: true, apiType: true },
  });

  if (!provider) {
    return NextResponse.json({ error: "Provider 不存在" }, { status: 404 });
  }

  if (!isUrlSafe(provider.baseUrl)) {
    return NextResponse.json(
      { error: "该 baseUrl 不允许访问（安全策略）" },
      { status: 400 }
    );
  }

  let apiKey: string;
  try {
    apiKey = decrypt(provider.apiKey);
  } catch {
    return NextResponse.json({ error: "密钥解密失败" }, { status: 500 });
  }

  const modelsUrl = buildOpenAiCompatibleModelsListUrl(provider.baseUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (provider.apiType === "anthropic") {
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
    } else {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const res = await fetch(modelsUrl, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const text = await res.text();

    if (!res.ok) {
      if (
        isLikelyDashScopeCodingOpenAiBase(provider.baseUrl) &&
        (res.status === 404 || res.status === 405)
      ) {
        return NextResponse.json({
          models: [] as string[],
          hint: DASHSCOPE_CODING_NO_MODELS_LIST_HINT,
        });
      }
      const hint =
        res.status === 401 || res.status === 403
          ? "上游拒绝访问，请检查 API Key 与权限"
          : `上游返回 ${res.status}`;
      return NextResponse.json({ error: hint }, { status: 502 });
    }

    let json: unknown;
    try {
      json = text.length > 0 ? JSON.parse(text) : {};
    } catch {
      return NextResponse.json(
        {
          error: "上游返回非 JSON，无法解析模型列表",
        },
        { status: 502 }
      );
    }

    const models = parseModelIds(json);
    return NextResponse.json({ models });
  } catch (e) {
    clearTimeout(timeout);
    const isAbort = e instanceof Error && e.name === "AbortError";
    return NextResponse.json(
      {
        error: isAbort
          ? `拉取超时（${FETCH_TIMEOUT_MS / 1000}s）`
          : "无法连接上游服务",
      },
      { status: 502 }
    );
  }
}

// Provider 连接测试 API — 按 apiType 发送轻量请求验证 API Key 和 URL 可达性
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { requireSession } from "@/lib/auth-guard";
import { isUrlSafe } from "@/lib/url-validator";
import { buildOpenAiCompatibleModelsListUrl } from "@/lib/openai-compatible-url";
import {
  DASHSCOPE_CODING_NO_MODELS_LIST_HINT,
  isLikelyDashScopeCodingOpenAiBase,
} from "@/lib/dashscope-coding";
import { logServerError } from "@/lib/server-logger";

type RouteCtx = { params: Promise<{ id: string }> };

/** 与 upstream-models、Proxy chat URL 规则一致，避免 base 已含 /v1 时重复拼接 */
function buildModelsProbeUrl(baseUrl: string, apiType: string): string {
  const base = baseUrl.replace(/\/$/, "");
  if (apiType === "anthropic") {
    if (base.endsWith("/v1")) {
      return `${base}/models`;
    }
    return `${base}/v1/models`;
  }
  return buildOpenAiCompatibleModelsListUrl(baseUrl);
}

function buildProbeHeaders(apiKey: string, apiType: string): Record<string, string> {
  if (apiType === "anthropic") {
    return {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    };
  }
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

export async function POST(_request: Request, ctx: RouteCtx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await ctx.params;

  try {
    const provider = await db.provider.findUnique({
      where: { id },
      select: { baseUrl: true, apiKey: true, apiType: true },
    });

    if (!provider) {
      return NextResponse.json({ error: "Provider 不存在" }, { status: 404 });
    }

    if (!isUrlSafe(provider.baseUrl)) {
      return NextResponse.json(
        { success: false, message: "不允许访问内网地址" },
        { status: 400 }
      );
    }

    const apiKey = decrypt(provider.apiKey);
    const modelsUrl = buildModelsProbeUrl(provider.baseUrl, provider.apiType);
    const headers = buildProbeHeaders(apiKey, provider.apiType);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch(modelsUrl, {
        method: "GET",
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (res.ok) {
        return NextResponse.json({ success: true, status: res.status });
      }
      // 阿里云 Coding Plan 等：官方 Base 为 .../v1，但部分环境不提供 GET /v1/models，不代表 chat 不可用
      if (
        isLikelyDashScopeCodingOpenAiBase(provider.baseUrl) &&
        (res.status === 404 || res.status === 405)
      ) {
        return NextResponse.json({
          success: true,
          status: res.status,
          message: DASHSCOPE_CODING_NO_MODELS_LIST_HINT,
        });
      }
      return NextResponse.json(
        { success: false, status: res.status, message: "API 返回异常状态码" },
        { status: 200 }
      );
    } catch (fetchErr) {
      clearTimeout(timeout);
      const isAbort =
        fetchErr instanceof DOMException && fetchErr.name === "AbortError";
      return NextResponse.json(
        {
          success: false,
          message: isAbort ? "连接超时（5s）" : "无法连接到目标服务",
        },
        { status: 200 }
      );
    }
  } catch (e) {
    logServerError("providers/[id]/test", e);
    return NextResponse.json({ error: "测试失败" }, { status: 500 });
  }
}

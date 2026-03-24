// POST /api/settings/local-router-model/test — 不落库，仅 GET Ollama /api/tags 探测
// 检测视角为 Dashboard 容器；Router 容器网络可能不同，保存后以 Router /health 为准
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth-guard";
import { isOllamaProbeUrlAllowed } from "@/lib/url-validator";
import { isArchModelPresentInTags } from "@/lib/ollama-probe";

const bodySchema = z.object({
  ollamaUrl: z.string().min(1, "ollamaUrl 必填"),
  archRouterModel: z.string().min(1, "archRouterModel 必填"),
});

const PROBE_TIMEOUT_MS = 8_000;

export interface LocalRouterTestResult {
  ok: boolean;
  perspective: "dashboard";
  ollama_available: boolean;
  arch_router_model_available: boolean;
  message?: string;
  error?: string;
}

export async function POST(request: Request) {
  const { error } = await requireSession();
  if (error) return error;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体解析失败" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "参数无效" },
      { status: 400 }
    );
  }

  const ollamaUrl = parsed.data.ollamaUrl.trim();
  const archRouterModel = parsed.data.archRouterModel.trim();

  try {
    new URL(ollamaUrl);
  } catch {
    return NextResponse.json({ error: "ollamaUrl 格式无效" }, { status: 400 });
  }

  if (!isOllamaProbeUrlAllowed(ollamaUrl)) {
    return NextResponse.json(
      { error: "该 URL 不允许用于探测（安全策略）" },
      { status: 400 }
    );
  }

  const base = ollamaUrl.replace(/\/+$/, "");
  const tagsUrl = `${base}/api/tags`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const res = await fetch(tagsUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(t);

    if (!res.ok) {
      const body: LocalRouterTestResult = {
        ok: false,
        perspective: "dashboard",
        ollama_available: false,
        arch_router_model_available: false,
        error: `Ollama 返回 ${res.status}（请确认地址与端口）`,
      };
      return NextResponse.json(body, { status: 200 });
    }

    let data: unknown;
    try {
      data = await res.json();
    } catch {
      const body: LocalRouterTestResult = {
        ok: false,
        perspective: "dashboard",
        ollama_available: false,
        arch_router_model_available: false,
        error: "无法解析 /api/tags 响应",
      };
      return NextResponse.json(body, { status: 200 });
    }

    const ollama_available = true;
    const arch_router_model_available = isArchModelPresentInTags(
      data,
      archRouterModel
    );

    const body: LocalRouterTestResult = {
      ok: true,
      perspective: "dashboard",
      ollama_available,
      arch_router_model_available,
      message: arch_router_model_available
        ? "可从当前 Dashboard 环境访问 Ollama，且模型已在本地列表中。保存后 Router 将使用相同 Redis 配置。"
        : "Ollama 可达，但未在本地模型列表中找到该名称；请在宿主机执行 ollama pull 后再试。",
    };
    return NextResponse.json(body);
  } catch (e) {
    clearTimeout(t);
    const aborted = e instanceof Error && e.name === "AbortError";
    const body: LocalRouterTestResult = {
      ok: false,
      perspective: "dashboard",
      ollama_available: false,
      arch_router_model_available: false,
      error: aborted
        ? `探测超时（${PROBE_TIMEOUT_MS / 1000}s），请确认 Ollama 已启动且地址可达`
        : "无法连接 Ollama（网络或防火墙）",
    };
    return NextResponse.json(body, { status: 200 });
  }
}

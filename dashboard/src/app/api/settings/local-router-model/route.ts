// 本地路由模型（L3）— 表单项来自 DB，状态来自 Router；PUT 写 DB + Redis，Router 从 Redis 读取
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { getRedis } from "@/lib/redis";

const ROUTER_URL = process.env.ROUTER_URL ?? "";
const DEFAULT_OLLAMA_URL = "http://host.docker.internal:11434";
const DEFAULT_ARCH_ROUTER_MODEL = "fauxpaslife/arch-router:1.5b";

const REDIS_KEY_OLLAMA_URL = "config:ollama_url";
const REDIS_KEY_ARCH_ROUTER_MODEL = "config:arch_router_model";

export interface LocalRouterModelStatus {
  configured: boolean;
  message?: string;
  messageKey?: string;
  messageParams?: Record<string, string>;
  ollama_url?: string;
  arch_router_model?: string;
  ollama_available?: boolean;
  arch_router_model_available?: boolean;
}

function getStringFromJson(value: unknown): string {
  if (typeof value === "string") return value;
  if (value != null && typeof value === "object" && "url" in value && typeof (value as { url: string }).url === "string")
    return (value as { url: string }).url;
  if (value != null && typeof value === "object" && "model" in value && typeof (value as { model: string }).model === "string")
    return (value as { model: string }).model;
  return "";
}

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const configs = await db.systemConfig.findMany({
    where: { key: { in: ["ollama_url", "arch_router_model"] } },
  });
  let storedOllamaUrl = "";
  let storedArchRouterModel = "";
  for (const c of configs) {
    const v = getStringFromJson(c.value);
    if (c.key === "ollama_url" && v) storedOllamaUrl = v;
    if (c.key === "arch_router_model" && v) storedArchRouterModel = v;
  }

  const ollama_url = storedOllamaUrl || DEFAULT_OLLAMA_URL;
  const arch_router_model = storedArchRouterModel || DEFAULT_ARCH_ROUTER_MODEL;

  if (!ROUTER_URL.trim()) {
    return NextResponse.json({
      configured: false,
      messageKey: "settings.l3.noRouterUrl",
      ollama_url,
      arch_router_model,
      ollama_available: undefined,
      arch_router_model_available: undefined,
    } satisfies LocalRouterModelStatus);
  }

  const base = ROUTER_URL.replace(/\/$/, "");
  const url = `${base}/health`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return NextResponse.json({
        configured: true,
        messageKey: "settings.l3.routerStatus",
        messageParams: { status: String(res.status) },
        ollama_url,
        arch_router_model,
        ollama_available: false,
        arch_router_model_available: false,
      } satisfies LocalRouterModelStatus);
    }
    const data = (await res.json()) as {
      ollama_url?: string;
      arch_router_model?: string;
      ollama_available?: boolean;
      arch_router_model_available?: boolean;
    };
    return NextResponse.json({
      configured: true,
      ollama_url: (storedOllamaUrl || data.ollama_url) ?? ollama_url,
      arch_router_model: (storedArchRouterModel || data.arch_router_model) ?? arch_router_model,
      ollama_available: data.ollama_available ?? false,
      arch_router_model_available: data.arch_router_model_available ?? false,
    } satisfies LocalRouterModelStatus);
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : undefined;
    return NextResponse.json({
      configured: true,
      message: errMsg,
      messageKey: errMsg ? undefined : "settings.l3.routerFail",
      ollama_url,
      arch_router_model,
      ollama_available: false,
      arch_router_model_available: false,
    } satisfies LocalRouterModelStatus);
  }
}

export async function PUT(request: Request) {
  const { error } = await requireSession();
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体解析失败" }, { status: 400 });
  }

  const raw = body as { ollamaUrl?: string; archRouterModel?: string };
  const ollamaUrl = typeof raw.ollamaUrl === "string" ? raw.ollamaUrl.trim() : "";
  const archRouterModel = typeof raw.archRouterModel === "string" ? raw.archRouterModel.trim() : "";

  if (!ollamaUrl || !archRouterModel) {
    return NextResponse.json(
      { error: "ollamaUrl 与 archRouterModel 均为必填" },
      { status: 400 }
    );
  }

  try {
    new URL(ollamaUrl);
  } catch {
    return NextResponse.json({ error: "ollamaUrl 格式无效" }, { status: 400 });
  }

  await db.systemConfig.upsert({
    where: { key: "ollama_url" },
    create: { key: "ollama_url", value: ollamaUrl },
    update: { value: ollamaUrl },
  });
  await db.systemConfig.upsert({
    where: { key: "arch_router_model" },
    create: { key: "arch_router_model", value: archRouterModel },
    update: { value: archRouterModel },
  });

  const redis = getRedis();
  await redis.set(REDIS_KEY_OLLAMA_URL, ollamaUrl);
  await redis.set(REDIS_KEY_ARCH_ROUTER_MODEL, archRouterModel);

  return NextResponse.json({ ok: true });
}

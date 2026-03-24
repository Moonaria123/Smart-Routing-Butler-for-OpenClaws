// 根据样本文本调用 Router L2，映射为 L1 taskType 建议（ISSUE-V4-05 阶段 2，非阻塞）
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-guard";
import { z } from "zod";

const ROUTER_URL = process.env.ROUTER_URL ?? "";

const ROUTE_TO_TASK_TYPE: Record<string, string> = {
  code_tasks: "code",
  data_analysis: "analysis",
  content_creation: "writing",
  daily_chat: "general",
  translation: "translation",
  math_reasoning: "math",
  long_document: "writing",
  other: "general",
};

const postSchema = z.object({
  sampleText: z.string().min(1).max(8000),
});

export async function POST(request: Request) {
  const { error } = await requireSession();
  if (error) return error;

  if (!ROUTER_URL.trim()) {
    return NextResponse.json(
      { error: "ROUTER_URL 未配置", hint: "router" },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体解析失败" }, { status: 400 });
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "参数验证失败", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const base = ROUTER_URL.replace(/\/$/, "");
  const url = `${base}/route/semantic`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: parsed.data.sampleText }],
        estimated_tokens: Math.ceil(parsed.data.sampleText.length / 4),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Router 返回 ${res.status}` },
        { status: 502 }
      );
    }

    const data = (await res.json()) as {
      matched?: boolean;
      route_name?: string | null;
      confidence?: number;
    };

    const routeName = data.route_name ?? "";
    const taskType =
      routeName && ROUTE_TO_TASK_TYPE[routeName]
        ? ROUTE_TO_TASK_TYPE[routeName]
        : null;

    return NextResponse.json({
      taskType,
      routeName: routeName || null,
      confidence: data.confidence ?? 0,
      matched: data.matched === true,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

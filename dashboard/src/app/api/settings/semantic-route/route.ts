// L2 语义路由相似度阈值 — system_config + Redis 通知 Router（ISSUE-V4-06）
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { publishRouterConfigUpdate } from "@/lib/redis";
import { z } from "zod";

const putSchema = z.object({
  semanticRouteThreshold: z.number().min(0.5).max(0.99),
});

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const row = await db.systemConfig.findUnique({
    where: { key: "semantic_route_threshold" },
  });

  let semanticRouteThreshold = 0.85;
  if (row?.value != null && typeof row.value === "object" && "value" in row.value) {
    const v = (row.value as { value: unknown }).value;
    if (typeof v === "number") semanticRouteThreshold = v;
  }

  return NextResponse.json({ semanticRouteThreshold });
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

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "参数验证失败", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  await db.systemConfig.upsert({
    where: { key: "semantic_route_threshold" },
    create: {
      key: "semantic_route_threshold",
      value: { value: parsed.data.semanticRouteThreshold },
    },
    update: { value: { value: parsed.data.semanticRouteThreshold } },
  });

  await publishRouterConfigUpdate();

  return NextResponse.json({ ok: true });
}

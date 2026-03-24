// 路由规则 API — 批量重排优先级
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { publishRuleUpdate } from "@/lib/redis";

const reorderSchema = z.array(
  z.object({
    id: z.string(),
    priority: z.number().int().min(0).max(1000),
  })
);

export async function PUT(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const body: unknown = await request.json();
  const parsed = reorderSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "验证失败", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  await db.$transaction(
    parsed.data.map((item) =>
      db.rule.update({
        where: { id: item.id },
        data: { priority: item.priority },
      })
    )
  );

  await publishRuleUpdate("reordered");

  return NextResponse.json({ success: true });
}

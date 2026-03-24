// 路由规则 API — 单条更新 + 删除
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ruleSchema } from "@/lib/schemas/rule";
import { publishRuleUpdate } from "@/lib/redis";
import { requireSession } from "@/lib/auth-guard";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(request: Request, { params }: RouteParams) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体格式错误" }, { status: 400 });
  }

  const parsed = ruleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "验证失败", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const existing = await db.rule.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "规则不存在" }, { status: 404 });
  }

  const rule = await db.rule.update({
    where: { id },
    data: {
      name: parsed.data.name,
      nameEn: parsed.data.nameEn?.trim() || null,
      priority: parsed.data.priority,
      enabled: parsed.data.enabled,
      conditions: parsed.data.conditions,
      targetModel: parsed.data.targetModel,
      fallbackChain: parsed.data.fallbackChain,
      description: parsed.data.description,
      descriptionEn: parsed.data.descriptionEn?.trim() || null,
    },
  });

  await publishRuleUpdate("updated", rule.id);

  return NextResponse.json(rule);
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await params;

  const existing = await db.rule.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "规则不存在" }, { status: 404 });
  }

  await db.rule.delete({ where: { id } });
  await publishRuleUpdate("deleted", id);

  return NextResponse.json({ success: true });
}

// 路由规则 API — 列表查询 + 创建
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ruleSchema } from "@/lib/schemas/rule";
import { publishRuleUpdate } from "@/lib/redis";
import { requireSession } from "@/lib/auth-guard";

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const rules = await db.rule.findMany({
    orderBy: { priority: "desc" },
  });

  return NextResponse.json(rules);
}

export async function POST(request: Request) {
  const { error } = await requireSession();
  if (error) return error;

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

  const rule = await db.rule.create({
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

  await publishRuleUpdate("created", rule.id);

  return NextResponse.json(rule, { status: 201 });
}

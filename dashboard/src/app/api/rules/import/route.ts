// 路由规则 API — 从 JSON 导入规则
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ruleSchema } from "@/lib/schemas/rule";
import { publishRuleUpdate } from "@/lib/redis";
import { requireSession } from "@/lib/auth-guard";

const importSchema = z.object({
  version: z.string(),
  rules: z.array(ruleSchema).min(1, "至少包含一条规则"),
});

export async function POST(request: Request) {
  const { error } = await requireSession();
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体格式错误" }, { status: 400 });
  }

  const parsed = importSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "验证失败", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const created = await db.$transaction(
    parsed.data.rules.map((rule) =>
      db.rule.create({
        data: {
          name: rule.name,
          nameEn: rule.nameEn?.trim() || null,
          priority: rule.priority,
          enabled: rule.enabled,
          conditions: rule.conditions,
          targetModel: rule.targetModel,
          fallbackChain: rule.fallbackChain,
          thinkingStrategy: rule.thinkingStrategy,
          description: rule.description,
          descriptionEn: rule.descriptionEn?.trim() || null,
        },
      })
    )
  );

  await publishRuleUpdate("imported");

  return NextResponse.json(
    { success: true, count: created.length },
    { status: 201 }
  );
}

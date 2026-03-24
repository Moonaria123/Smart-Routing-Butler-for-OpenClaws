// 路由规则批量操作 API — 一键启用/禁用/删除全部规则（ISSUE-V5-02 / V5-04）
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { publishRuleUpdate } from "@/lib/redis";
import { requireSession } from "@/lib/auth-guard";
import { z } from "zod";

const bulkSchema = z.object({
  action: z.enum(["enable_all", "disable_all", "delete_all"]),
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

  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "参数验证失败", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { action } = parsed.data;

  if (action === "enable_all") {
    const result = await db.rule.updateMany({
      data: { enabled: true },
    });
    await publishRuleUpdate("bulk_enabled");
    return NextResponse.json({ affected: result.count });
  }

  if (action === "disable_all") {
    const result = await db.rule.updateMany({
      data: { enabled: false },
    });
    await publishRuleUpdate("bulk_disabled");
    return NextResponse.json({ affected: result.count });
  }

  if (action === "delete_all") {
    const result = await db.rule.deleteMany({});
    await publishRuleUpdate("bulk_deleted");
    return NextResponse.json({ affected: result.count });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

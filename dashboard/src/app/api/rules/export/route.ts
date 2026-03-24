// 路由规则 API — 导出所有规则为 JSON
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const rules = await db.rule.findMany({
    orderBy: { priority: "desc" },
    select: {
      name: true,
      nameEn: true,
      priority: true,
      enabled: true,
      conditions: true,
      targetModel: true,
      fallbackChain: true,
      description: true,
      descriptionEn: true,
    },
  });

  const payload = JSON.stringify({ version: "1.1", rules }, null, 2);

  return new NextResponse(payload, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="smart-router-rules-${Date.now()}.json"`,
    },
  });
}

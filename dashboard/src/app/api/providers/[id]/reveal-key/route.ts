// Provider API Key 解密展示 — 仅授权用户可访问
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { requireSession } from "@/lib/auth-guard";
import { logServerError } from "@/lib/server-logger";

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: RouteCtx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await ctx.params;

  try {
    const provider = await db.provider.findUnique({
      where: { id },
      select: { apiKey: true },
    });

    if (!provider) {
      return NextResponse.json({ error: "Provider 不存在" }, { status: 404 });
    }

    const apiKey = decrypt(provider.apiKey);
    return NextResponse.json({ apiKey });
  } catch (e) {
    logServerError("providers/[id]/reveal-key", e);
    return NextResponse.json(
      { error: "无法获取 API Key" },
      { status: 500 }
    );
  }
}

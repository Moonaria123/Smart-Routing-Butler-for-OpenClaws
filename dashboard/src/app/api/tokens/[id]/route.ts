// API Token 撤销（软删除） — 设置 revokedAt，仅允许本人操作
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth-guard";
import { publishApiTokenInvalidated } from "@/lib/redis";
import { logServerError } from "@/lib/server-logger";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireSession();
  if (error) return error;

  const { id } = await params;

  try {
    const token = await db.apiToken.findUnique({
      where: { id },
      select: {
        userId: true,
        revokedAt: true,
        tokenHash: true,
        systemManaged: true,
      },
    });

    if (!token) {
      return NextResponse.json({ error: "Token 不存在" }, { status: 404 });
    }

    if (token.userId !== session!.user.id) {
      return NextResponse.json({ error: "无权操作此 Token" }, { status: 403 });
    }

    if (token.revokedAt) {
      return NextResponse.json({ error: "Token 已撤销" }, { status: 400 });
    }

    if (token.systemManaged) {
      return NextResponse.json(
        { error: "Built-in token cannot be revoked" },
        { status: 403 },
      );
    }

    await db.apiToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });

    await publishApiTokenInvalidated(token.tokenHash);

    return NextResponse.json({ success: true });
  } catch (e) {
    logServerError("tokens/[id] DELETE", e);
    return NextResponse.json(
      { error: "Token 撤销失败，请稍后重试" },
      { status: 500 },
    );
  }
}

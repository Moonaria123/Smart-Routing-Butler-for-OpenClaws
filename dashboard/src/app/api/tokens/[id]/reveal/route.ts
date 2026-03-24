// 对已启用「加密保存」的 Token 解密并返回明文（会话内、本人、未撤销）
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth-guard";
import { decrypt } from "@/lib/crypto";
import { logServerError } from "@/lib/server-logger";

export async function POST(
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
        tokenCipher: true,
      },
    });

    if (!token) {
      return NextResponse.json({ error: "Token 不存在" }, { status: 404 });
    }

    if (token.userId !== session!.user.id) {
      return NextResponse.json({ error: "无权操作" }, { status: 403 });
    }

    if (token.revokedAt) {
      return NextResponse.json({ error: "Token 已撤销" }, { status: 400 });
    }

    if (!token.tokenCipher) {
      return NextResponse.json(
        {
          error:
            "未保存可解密密文：请先在系统设置中开启「允许再次复制」并重新创建 Token",
        },
        { status: 400 },
      );
    }

    const fullToken = decrypt(token.tokenCipher);
    return NextResponse.json({ fullToken });
  } catch (e) {
    logServerError("tokens/[id]/reveal", e);
    return NextResponse.json(
      { error: "无法显示 Token，请确认 ENCRYPTION_KEY 未变更" },
      { status: 500 },
    );
  }
}

// API Token 管理 — 列表查询 + 创建（SHA-256 哈希；可选 AES 密文供再次复制）
import { randomBytes, createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth-guard";
import { encrypt } from "@/lib/crypto";
import { getTokenRevealAllowed } from "@/lib/token-reveal-pref";
import { z } from "zod";
import { logServerError } from "@/lib/server-logger";

const createSchema = z.object({
  name: z.string().min(1, "名称不能为空").max(100, "名称最长 100 字符"),
});

export async function GET() {
  const { session, error } = await requireSession();
  if (error) return error;

  try {
    const tokens = await db.apiToken.findMany({
      where: { userId: session!.user.id, revokedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        tokenSuffix: true,
        createdAt: true,
        tokenCipher: true,
        systemManaged: true,
      },
    });

    const safe = tokens.map(({ tokenCipher, ...rest }) => ({
      ...rest,
      canReveal: Boolean(tokenCipher),
    }));

    return NextResponse.json({ tokens: safe });
  } catch (e) {
    logServerError("tokens/GET", e);
    return NextResponse.json(
      { error: "Token 列表加载失败，请稍后重试" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体格式错误" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "参数校验失败" },
      { status: 400 },
    );
  }

  try {
    const rawToken = `sr_${randomBytes(48).toString("hex")}`;
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const tokenSuffix = rawToken.slice(-4);

    const allowCipher = await getTokenRevealAllowed(session!.user.id);
    let tokenCipher: string | undefined;
    if (allowCipher) {
      try {
        tokenCipher = encrypt(rawToken);
      } catch (e) {
        logServerError("tokens/POST/encrypt", e);
        return NextResponse.json(
          { error: "ENCRYPTION_KEY 未配置或无效，无法启用「再次复制」存储" },
          { status: 500 },
        );
      }
    }

    const token = await db.apiToken.create({
      data: {
        name: parsed.data.name,
        tokenHash,
        tokenSuffix,
        userId: session!.user.id,
        ...(tokenCipher ? { tokenCipher } : {}),
      },
      select: {
        id: true,
        name: true,
        tokenSuffix: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      { ...token, fullToken: rawToken, storedForReveal: Boolean(tokenCipher) },
      { status: 201 },
    );
  } catch (e) {
    logServerError("tokens/POST", e);
    return NextResponse.json(
      { error: "Token 创建失败，请稍后重试" },
      { status: 500 },
    );
  }
}

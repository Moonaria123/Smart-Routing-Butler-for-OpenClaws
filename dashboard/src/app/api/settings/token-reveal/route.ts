// 用户偏好：是否允许为新创建的 API Token 保存加密副本以供日后再次复制（ISSUE-V3-05）
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth-guard";
import {
  getTokenRevealAllowed,
  setTokenRevealAllowed,
} from "@/lib/token-reveal-pref";
import { logServerError } from "@/lib/server-logger";

const putSchema = z.object({
  allow: z.boolean(),
});

export async function GET() {
  const { session, error } = await requireSession();
  if (error) return error;

  const allow = await getTokenRevealAllowed(session!.user.id);
  return NextResponse.json({ allowApiTokenReveal: allow });
}

export async function PUT(request: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体格式错误" }, { status: 400 });
  }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "参数校验失败" },
      { status: 400 },
    );
  }

  try {
    await setTokenRevealAllowed(session!.user.id, parsed.data.allow);
    return NextResponse.json({ allowApiTokenReveal: parsed.data.allow });
  } catch (e) {
    logServerError("settings/token-reveal PUT", e);
    return NextResponse.json(
      { error: "保存失败，请稍后重试" },
      { status: 500 },
    );
  }
}

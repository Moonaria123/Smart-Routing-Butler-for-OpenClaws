// 登录结果记录 — 成功时清除失败计数，失败时累加
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { recordLoginFailure, clearLoginFailures } from "@/lib/rate-limiter";

function extractIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(request: NextRequest) {
  let body: { success?: boolean };
  try {
    body = (await request.json()) as { success?: boolean };
  } catch {
    return NextResponse.json({ error: "请求体格式错误" }, { status: 400 });
  }

  const ip = extractIp(request);

  if (body.success) {
    await clearLoginFailures(ip);
  } else {
    await recordLoginFailure(ip);
  }

  return NextResponse.json({ ok: true });
}

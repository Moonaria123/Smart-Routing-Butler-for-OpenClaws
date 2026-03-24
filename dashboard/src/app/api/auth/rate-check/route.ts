// 登录频率检查 — 供 middleware（Edge Runtime）调用
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkLoginRateLimit } from "@/lib/rate-limiter";

export async function GET(request: NextRequest) {
  const ip = request.nextUrl.searchParams.get("ip") || "unknown";
  const result = await checkLoginRateLimit(ip);
  return NextResponse.json(result);
}

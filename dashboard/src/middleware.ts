// 全局中间件 — 拦截登录请求进行频率限制
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // 仅拦截登录请求
  if (
    request.method === "POST" &&
    request.nextUrl.pathname === "/api/auth/sign-in/email"
  ) {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    // Edge Runtime 无法直接使用 ioredis，通过内部 API 检查
    const checkUrl = new URL("/api/auth/rate-check", request.url);
    checkUrl.searchParams.set("ip", ip);

    try {
      const checkResp = await fetch(checkUrl.toString());
      const result = (await checkResp.json()) as { blocked: boolean };
      if (result.blocked) {
        return NextResponse.json(
          { error: "登录失败次数过多，请 15 分钟后重试" },
          { status: 429 }
        );
      }
    } catch {
      // 速率限制检查失败时放行（降级策略）
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/auth/sign-in/:path*"],
};

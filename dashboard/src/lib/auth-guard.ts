// API 路由鉴权守卫 — 校验 Session 并返回用户信息
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function requireSession() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session) {
    return { session: null, error: NextResponse.json({ error: "未登录" }, { status: 401 }) };
  }
  return { session, error: null };
}

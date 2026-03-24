// Better Auth 客户端 — 供客户端组件调用登录/注册等操作
// 浏览器内使用当前页面 origin，避免端口与 build 时不一致导致请求发错地址
import { createAuthClient } from "better-auth/react";

function getBaseURL(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_BETTER_AUTH_URL ?? "http://localhost:3000";
}

export const authClient = createAuthClient({
  baseURL: getBaseURL(),
});

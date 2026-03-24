// 根页面 — 重定向到 Dashboard 总览
import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/dashboard");
}

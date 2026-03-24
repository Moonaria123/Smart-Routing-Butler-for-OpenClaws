// 登录/注册布局 — 右上角语言与主题（ISSUE-V3-06/07）
import { ShellToolbar } from "@/components/dashboard/shell-toolbar";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen">
      <div className="absolute right-3 top-3 z-20 md:right-6 md:top-4">
        <ShellToolbar />
      </div>
      {children}
    </div>
  );
}

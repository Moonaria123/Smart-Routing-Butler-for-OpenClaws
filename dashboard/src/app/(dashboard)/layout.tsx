// Dashboard 布局 — 服务端 Session + 侧栏；主区顶栏 sticky、主内容区独立滚动（ISSUE-V5-12）
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { NavLinks } from "@/components/dashboard/NavLinks";
import { DashboardSidebarBrand } from "@/components/dashboard/dashboard-sidebar-brand";
import { DashboardShellHeader } from "@/components/dashboard/dashboard-shell-header";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="flex h-dvh min-h-0 overflow-hidden">
      <aside className="flex h-full min-h-0 w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="flex min-h-14 shrink-0 items-center border-b border-sidebar-border px-3 py-2">
          <DashboardSidebarBrand />
        </div>
        <nav
          className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-4"
          aria-label="Main navigation"
        >
          <NavLinks />
        </nav>
        <div className="shrink-0 border-t border-sidebar-border px-4 py-3">
          <p className="truncate text-sm text-muted-foreground">
            {session.user.email}
          </p>
        </div>
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <DashboardShellHeader />
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

// 侧栏导航链接 — Client；文案走 i18n（ISSUE-V3-06）
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n/context";

const navItems = [
  { href: "/dashboard", key: "nav.overview" as const },
  { href: "/dashboard/providers", key: "nav.providers" as const },
  { href: "/dashboard/rules", key: "nav.rules" as const },
  { href: "/dashboard/logs", key: "nav.logs" as const },
  { href: "/dashboard/tokens", key: "nav.tokens" as const },
  { href: "/dashboard/settings", key: "nav.settings" as const },
] as const;

export function NavLinks() {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <>
      {navItems.map((item) => {
        const isActive =
          item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            aria-current={isActive ? "page" : undefined}
          >
            {t(item.key)}
          </Link>
        );
      })}
    </>
  );
}

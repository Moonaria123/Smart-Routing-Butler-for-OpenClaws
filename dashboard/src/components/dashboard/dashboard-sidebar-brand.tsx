// 侧栏品牌区 — Logo + 中英名称（ISSUE-V5-11）
"use client";

import Link from "next/link";
import { AppLogo } from "@/components/dashboard/app-logo";
import { useI18n } from "@/lib/i18n/context";

export function DashboardSidebarBrand() {
  const { t } = useI18n();
  return (
    <Link
      href="/dashboard"
      className="group flex min-w-0 items-center gap-2.5"
      aria-label={t("nav.brandAria")}
    >
      <AppLogo
        className="h-9 w-9 text-sidebar-foreground"
        title={t("nav.brandAria")}
      />
      <div className="min-w-0 leading-tight">
        <span className="block truncate text-base font-bold tracking-tight text-sidebar-foreground group-hover:underline">
          {t("nav.brandPrimary")}
        </span>
        <span className="block truncate text-[11px] font-medium text-muted-foreground">
          {t("nav.brandSecondary")}
        </span>
      </div>
    </Link>
  );
}

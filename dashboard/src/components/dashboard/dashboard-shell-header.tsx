// Dashboard 主区顶栏 — 左侧 slogan + 右侧 ShellToolbar；sticky 贴顶（ISSUE-V5-11 / V5-12）
"use client";

import { ShellToolbar } from "@/components/dashboard/shell-toolbar";
import { useI18n } from "@/lib/i18n/context";

export function DashboardShellHeader() {
  const { t, locale } = useI18n();
  return (
    <header
      className="sticky top-0 z-40 flex h-auto min-h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-2 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-background/85 md:px-6"
      role="banner"
    >
      <p
        lang={locale === "en" ? "en" : "zh-CN"}
        className="max-w-full text-pretty text-xs leading-snug text-muted-foreground sm:max-w-[min(100%,42rem)] sm:text-sm"
      >
        {t("shell.slogan")}
      </p>
      <div className="ml-auto shrink-0">
        <ShellToolbar />
      </div>
    </header>
  );
}

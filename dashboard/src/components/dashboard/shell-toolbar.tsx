// 右上角语言 + 主题切换（ISSUE-V3-06 / V3-07），含可访问名称
"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import type { Locale } from "@/lib/i18n/messages";
import { BookOpen, Globe, Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { InitializationGuideDialog } from "@/components/dashboard/initialization-guide-dialog";

export function ShellToolbar({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        className={cn("flex h-9 items-center gap-2", className)}
        aria-hidden
      >
        <div className="h-9 w-24 animate-pulse rounded-md bg-muted" />
        <div className="h-9 w-40 animate-pulse rounded-md bg-muted" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-end gap-2",
        className,
      )}
    >
      <InitializationGuideDialog
        open={onboardingOpen}
        onClose={() => setOnboardingOpen(false)}
      />
      <button
        type="button"
        onClick={() => setOnboardingOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background/80 px-2.5 py-1 text-xs font-medium text-foreground shadow-sm backdrop-blur hover:bg-muted"
        title={t("shell.onboarding.open")}
        aria-label={t("shell.onboarding.open")}
      >
        <BookOpen className="h-4 w-4 shrink-0" aria-hidden />
        <span className="hidden sm:inline">{t("shell.onboarding.open")}</span>
      </button>
      <div className="flex items-center gap-1.5 rounded-md border border-border bg-background/80 px-2 py-1 shadow-sm backdrop-blur">
        <Globe className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <label htmlFor="dashboard-locale" className="sr-only">
          {t("shell.language")}
        </label>
        <select
          id="dashboard-locale"
          value={locale}
          onChange={(e) => setLocale(e.target.value as Locale)}
          className="h-7 max-w-[140px] cursor-pointer rounded border-0 bg-transparent text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="zh">{t("shell.localeZh")}</option>
          <option value="en">{t("shell.localeEn")}</option>
        </select>
      </div>

      <div
        className="flex items-center gap-0.5 rounded-md border border-border bg-background/80 p-0.5 shadow-sm backdrop-blur"
        role="group"
        aria-label={t("shell.theme")}
      >
        <ThemeBtn
          active={theme === "light"}
          onClick={() => setTheme("light")}
          label={t("shell.themeLight")}
        >
          <Sun className="h-4 w-4" />
        </ThemeBtn>
        <ThemeBtn
          active={theme === "dark"}
          onClick={() => setTheme("dark")}
          label={t("shell.themeDark")}
        >
          <Moon className="h-4 w-4" />
        </ThemeBtn>
        <ThemeBtn
          active={theme === "system"}
          onClick={() => setTheme("system")}
          label={t("shell.themeSystem")}
        >
          <Monitor className="h-4 w-4" />
        </ThemeBtn>
      </div>
    </div>
  );
}

function ThemeBtn({
  children,
  active,
  onClick,
  label,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        active && "bg-muted text-foreground",
      )}
    >
      {children}
    </button>
  );
}

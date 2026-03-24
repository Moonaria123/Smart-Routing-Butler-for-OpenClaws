// next-themes 包装 — 与 Tailwind `class` 暗黑变体配合（ISSUE-V3-07）
"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="dashboard-theme"
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}

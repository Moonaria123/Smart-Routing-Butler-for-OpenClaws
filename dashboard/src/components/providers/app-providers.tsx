// 根级客户端 Provider：主题 + 语言
"use client";

import { ThemeProvider } from "@/components/providers/theme-provider";
import { I18nProvider } from "@/lib/i18n/context";
import { Toaster } from "sonner";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <I18nProvider>
        {children}
        <Toaster position="top-center" richColors closeButton />
      </I18nProvider>
    </ThemeProvider>
  );
}

// 登录页 — 邮箱密码登录表单（ISSUE-V3-06）
"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { AppLogo } from "@/components/dashboard/app-logo";
import { useI18n } from "@/lib/i18n/context";

type LoginForm = {
  email: string;
  password: string;
};

export default function LoginPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loginSchema = useMemo(
    () =>
      z.object({
        email: z.string().email(t("auth.validation.email")),
        password: z.string().min(8, t("auth.validation.passwordMin")),
      }),
    [t],
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  async function recordRateLimit(success: boolean) {
    try {
      await fetch("/api/auth/rate-record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success }),
      });
    } catch {
      // 记录失败不影响登录流程
    }
  }

  async function onSubmit(data: LoginForm) {
    setError(null);
    setLoading(true);
    try {
      const result = await authClient.signIn.email({
        email: data.email,
        password: data.password,
      });
      if (result.error) {
        await recordRateLimit(false);
        setError(result.error.message ?? t("auth.error.loginFailed"));
      } else {
        await recordRateLimit(true);
        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      await recordRateLimit(false);
      setError(t("auth.error.loginRetry"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 pt-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="flex justify-center">
            <AppLogo className="h-14 w-14 text-primary" title={t("nav.brandAria")} />
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight">
            {t("nav.brandPrimary")}
          </h1>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            {t("nav.brandSecondary")}
          </p>
          <p
            lang={locale === "en" ? "en" : "zh-CN"}
            className="mt-3 text-sm font-medium leading-relaxed text-foreground"
          >
            {t("auth.loginWelcome")}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("auth.loginSubtitle")}
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {error && (
            <div
              role="alert"
              className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">
              {t("auth.email")}
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder={t("auth.placeholder.email")}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              {...register("email")}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">
              {t("auth.password")}
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder={t("auth.placeholder.password")}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              {...register("password")}
            />
            {errors.password && (
              <p className="text-xs text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          >
            {loading ? t("auth.loggingIn") : t("auth.login")}
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          {t("auth.noAccount")}{" "}
          <Link
            href="/register"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {t("auth.register")}
          </Link>
        </p>
      </div>
    </div>
  );
}

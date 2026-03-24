// 初始化设置引导 — 分步弹窗（ISSUE-V5-10），与顶栏工具区并列
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/context";
import { getPublicProxyBaseUrl } from "@/lib/public-proxy-url";
import { toast } from "sonner";
import { BookOpen, ChevronLeft, ChevronRight, X } from "lucide-react";

const DEFAULT_ARCH = "fauxpaslife/arch-router:1.5b";
const STEPS = 4 as const;

export function InitializationGuideDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [step, setStep] = useState(1);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [proxyBase, setProxyBase] = useState("");

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      el.showModal();
      setStep(1);
    } else {
      el.close();
    }
  }, [open]);

  useEffect(() => {
    if (open) setProxyBase(getPublicProxyBaseUrl());
  }, [open]);

  const handleClose = () => {
    onClose();
  };

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      onClose={handleClose}
      className="fixed left-1/2 top-1/2 z-50 w-[min(100vw-2rem,32rem)] max-h-[min(90vh,36rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-border bg-background p-0 shadow-xl backdrop:bg-black/50"
      aria-labelledby="init-guide-title"
    >
      <div className="flex max-h-[min(90vh,36rem)] flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 shrink-0 text-primary" aria-hidden />
            <h2 id="init-guide-title" className="text-lg font-semibold">
              {t("shell.onboarding.title")}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
            aria-label={t("shell.onboarding.close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="px-4 pt-2 text-xs text-muted-foreground" role="status">
          {t("shell.onboarding.progress", { current: step, total: STEPS })}
        </p>

        <div className="flex-1 overflow-y-auto px-4 py-3 text-sm leading-relaxed">
          {step === 1 && (
            <section aria-labelledby="onb-s1">
              <h3 id="onb-s1" className="font-medium text-foreground">
                {t("shell.onboarding.s1.title")}
              </h3>
              <p className="mt-2 text-muted-foreground">{t("shell.onboarding.s1.body")}</p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">
                <li>
                  <a
                    href="https://ollama.com/download"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-2"
                  >
                    Ollama
                  </a>
                  {t("shell.onboarding.s1.downloadSuffix")}
                </li>
              </ul>
              <p className="mt-2 font-mono text-xs text-foreground">
                ollama pull {DEFAULT_ARCH}
              </p>
              <p className="mt-2 text-muted-foreground">{t("shell.onboarding.s1.hint")}</p>
              <Link
                href="/dashboard/settings#onboarding-local-llm"
                className="mt-3 inline-flex rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                onClick={handleClose}
              >
                {t("shell.onboarding.s1.cta")}
              </Link>
            </section>
          )}

          {step === 2 && (
            <section aria-labelledby="onb-s2">
              <h3 id="onb-s2" className="font-medium text-foreground">
                {t("shell.onboarding.s2.title")}
              </h3>
              <p className="mt-2 text-muted-foreground">{t("shell.onboarding.s2.body")}</p>
              <Link
                href="/dashboard/providers"
                className="mt-3 inline-flex rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                onClick={handleClose}
              >
                {t("shell.onboarding.s2.cta")}
              </Link>
            </section>
          )}

          {step === 3 && (
            <section aria-labelledby="onb-s3">
              <h3 id="onb-s3" className="font-medium text-foreground">
                {t("shell.onboarding.s3.title")}
              </h3>
              <p className="mt-2 text-muted-foreground">{t("shell.onboarding.s3.body")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href="/dashboard/rules"
                  className="inline-flex rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  onClick={handleClose}
                >
                  {t("shell.onboarding.s3.ctaRules")}
                </Link>
                <Link
                  href="/dashboard/rules/wizard"
                  className="inline-flex rounded-md border border-input px-3 py-2 text-sm font-medium hover:bg-muted"
                  onClick={handleClose}
                >
                  {t("shell.onboarding.s3.ctaWizard")}
                </Link>
              </div>
            </section>
          )}

          {step === 4 && (
            <section aria-labelledby="onb-s4">
              <h3 id="onb-s4" className="font-medium text-foreground">
                {t("shell.onboarding.s4.title")}
              </h3>
              <p className="mt-2 text-muted-foreground">{t("shell.onboarding.s4.body")}</p>
              <div className="mt-3 rounded-lg border bg-muted/40 p-3">
                <p className="text-xs font-medium text-muted-foreground">
                  {t("shell.onboarding.s4.proxyLabel")}
                </p>
                <code className="mt-1 block break-all text-xs text-foreground">
                  {proxyBase || t("tokens.proxyMissing")}
                </code>
                {proxyBase ? (
                  <button
                    type="button"
                    className="mt-2 text-xs font-medium text-primary underline"
                    onClick={() =>
                      void navigator.clipboard.writeText(proxyBase).then(() => {
                        toast.success(t("tokens.copyBaseUrlOk"));
                      })
                    }
                  >
                    {t("tokens.copyBaseUrl")}
                  </button>
                ) : null}
              </div>
              <Link
                href="/dashboard/tokens"
                className="mt-3 inline-flex rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                onClick={handleClose}
              >
                {t("shell.onboarding.s4.cta")}
              </Link>
            </section>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step <= 1}
            className="inline-flex items-center gap-1 rounded-md border border-input px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            {t("shell.onboarding.prev")}
          </button>
          {step < STEPS ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(STEPS, s + 1))}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {t("shell.onboarding.next")}
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleClose}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {t("shell.onboarding.done")}
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}

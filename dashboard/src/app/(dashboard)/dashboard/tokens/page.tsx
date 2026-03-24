// API Token 管理页 — 创建、撤销；展示 Proxy Base URL（ISSUE-V3-03 / V3-06）
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TokenList, type TokenItem } from "@/components/tokens/token-list";
import { CreateTokenDialog } from "@/components/tokens/create-token-dialog";
import { getPublicProxyBaseUrl } from "@/lib/public-proxy-url";
import { useI18n } from "@/lib/i18n/context";

export default function TokensPage() {
  const { t } = useI18n();
  const [tokens, setTokens] = useState<TokenItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [allowReveal, setAllowReveal] = useState(false);

  const proxyBaseUrl = useMemo(() => getPublicProxyBaseUrl(), []);

  const fetchTokenRevealPref = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/token-reveal");
      if (res.ok) {
        const data = (await res.json()) as { allowApiTokenReveal?: boolean };
        setAllowReveal(data.allowApiTokenReveal === true);
      }
    } catch {
      /* 忽略，默认 false */
    }
  }, []);

  const fetchTokens = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/tokens");
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data: { tokens: TokenItem[] } = await res.json();
      setTokens(data.tokens);
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : t("tokens.loadListFail"),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void fetchTokens();
    void fetchTokenRevealPref();
  }, [fetchTokens, fetchTokenRevealPref]);

  const handleRevoke = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/tokens/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? t("tokens.revokeFail"));
      }
      await fetchTokens();
    },
    [fetchTokens, t],
  );

  const handleRevealCopy = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/tokens/${id}/reveal`, { method: "POST" });
      const data = (await res.json()) as { fullToken?: string; error?: string };
      if (!res.ok) {
        window.alert(data.error ?? t("tokens.reveal.fail"));
        return;
      }
      if (data.fullToken) {
        try {
          await navigator.clipboard.writeText(data.fullToken);
          window.alert(t("tokens.reveal.ok"));
        } catch {
          window.prompt(t("tokens.reveal.manualPrompt"), data.fullToken);
        }
      }
    },
    [t],
  );

  const handleCreated = useCallback(() => {
    void fetchTokens();
    void fetchTokenRevealPref();
  }, [fetchTokens, fetchTokenRevealPref]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("tokens.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("tokens.subtitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {t("tokens.create")}
        </button>
      </div>

      <section
        className="rounded-lg border border-border bg-muted/30 p-4 text-sm"
        aria-labelledby="proxy-base-url-heading"
      >
        <h2
          id="proxy-base-url-heading"
          className="font-medium text-foreground"
        >
          {t("tokens.proxyHeading")}
        </h2>
        <p className="mt-2 text-muted-foreground">{t("tokens.proxyHint")}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="break-all rounded-md border border-border bg-background px-3 py-2 font-mono text-xs">
            {proxyBaseUrl || t("tokens.proxyMissing")}
          </code>
          {proxyBaseUrl ? (
            <button
              type="button"
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
              onClick={() => {
                void navigator.clipboard.writeText(proxyBaseUrl).then(
                  () => window.alert(t("tokens.copyBaseUrlOk")),
                  () => window.alert(t("tokens.copyBaseUrlFail")),
                );
              }}
            >
              {t("tokens.copyBaseUrl")}
            </button>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {t("tokens.proxyEnvHint")}
        </p>
      </section>

      {loadError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-foreground"
        >
          <span className="font-medium text-destructive">
            {t("tokens.loadFailPrefix")}
          </span>
          {loadError}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <p className="text-muted-foreground">{t("tokens.loading")}</p>
        </div>
      ) : (
        <TokenList
          tokens={tokens}
          onRevoke={handleRevoke}
          onRevealCopy={handleRevealCopy}
        />
      )}

      <CreateTokenDialog
        open={dialogOpen}
        allowReveal={allowReveal}
        onClose={() => setDialogOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}

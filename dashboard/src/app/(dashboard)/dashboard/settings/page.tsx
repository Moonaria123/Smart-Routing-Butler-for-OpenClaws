// 系统设置页 — 缓存配置 + 成本可视化 + 熔断器状态（ISSUE-V3-06）
"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n/context";
import { RuleGenerationSettings } from "@/components/settings/rule-generation-settings";

interface CacheSettings {
  exactCacheTtl: number;
  semanticCacheTtl: number;
}

interface CostData {
  todayActualCost: number;
  todayHypotheticalCost: number;
  todaySaved: number;
  dailyCostTrend: Array<{
    date: string;
    actual: number;
    hypothetical: number;
  }>;
  budgetUsed: number | null;
  monthlyBudget: number | null;
}

interface BreakerInfo {
  model: string;
  state: string;
  triggeredBy: string;
  openedAt: string;
  until: string;
}

interface LocalRouterModelStatus {
  configured: boolean;
  message?: string;
  messageKey?: string;
  messageParams?: Record<string, string>;
  ollama_url?: string;
  arch_router_model?: string;
  ollama_available?: boolean;
  arch_router_model_available?: boolean;
}

interface LocalRouterTestResult {
  ok: boolean;
  perspective?: string;
  ollama_available?: boolean;
  arch_router_model_available?: boolean;
  message?: string;
  error?: string;
}

const DEFAULT_ARCH_ROUTER_MODEL = "fauxpaslife/arch-router:1.5b";

export default function SettingsPage() {
  const { t, locale } = useI18n();
  const dateLocale = locale === "en" ? "en-US" : "zh-CN";
  const [cache, setCache] = useState<CacheSettings>({
    exactCacheTtl: 86400,
    semanticCacheTtl: 86400,
  });
  const [cacheLoading, setCacheLoading] = useState(true);
  const [cacheSaving, setCacheSaving] = useState(false);
  const [cacheClearing, setCacheClearing] = useState(false);
  const [clearResult, setClearResult] = useState<string | null>(null);

  const [cost, setCost] = useState<CostData | null>(null);
  const [costDays, setCostDays] = useState(7);
  const [costLoading, setCostLoading] = useState(true);

  const [breakers, setBreakers] = useState<BreakerInfo[]>([]);
  const [breakerLoading, setBreakerLoading] = useState(true);

  const [localRouter, setLocalRouter] = useState<LocalRouterModelStatus | null>(null);
  const [localRouterLoading, setLocalRouterLoading] = useState(true);
  const [localRouterSaving, setLocalRouterSaving] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [ollamaUrlInput, setOllamaUrlInput] = useState("");
  const [archRouterModelInput, setArchRouterModelInput] = useState("");
  const [l3TestLoading, setL3TestLoading] = useState(false);
  const [l3TestBanner, setL3TestBanner] = useState<{
    variant: "success" | "warning" | "error";
    text: string;
  } | null>(null);

  const [routing, setRouting] = useState({
    semanticCacheCheckTimeoutMs: 55,
    fallbackOnInvalidL1Target: false,
    semanticRouteThreshold: 0.85,
    routingEnableL2: true,
    routingEnableL3: true,
  });
  const [routingLoading, setRoutingLoading] = useState(true);
  const [routingSaving, setRoutingSaving] = useState(false);

  const [tokenRevealAllow, setTokenRevealAllow] = useState(false);
  const [tokenRevealLoading, setTokenRevealLoading] = useState(true);
  const [tokenRevealSaving, setTokenRevealSaving] = useState(false);

  const fetchLocalRouterModel = useCallback(async () => {
    setLocalRouterLoading(true);
    try {
      const res = await fetch("/api/settings/local-router-model");
      if (res.ok) {
        const data = (await res.json()) as LocalRouterModelStatus;
        setLocalRouter(data);
        setOllamaUrlInput(data.ollama_url ?? "");
        setArchRouterModelInput(data.arch_router_model ?? DEFAULT_ARCH_ROUTER_MODEL);
      } else {
        setLocalRouter({ configured: false, message: t("settings.error.request") });
      }
    } catch {
      setLocalRouter({ configured: false, message: t("settings.error.exception") });
    } finally {
      setLocalRouterLoading(false);
    }
  }, [t]);

  const fetchCache = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/cache");
      if (res.ok) {
        const data = (await res.json()) as CacheSettings;
        setCache(data);
      }
    } finally {
      setCacheLoading(false);
    }
  }, []);

  const fetchCost = useCallback(async (days: number) => {
    setCostLoading(true);
    try {
      const res = await fetch(`/api/stats/cost?days=${days}`);
      if (res.ok) {
        const data = (await res.json()) as CostData;
        setCost(data);
      }
    } finally {
      setCostLoading(false);
    }
  }, []);

  const fetchBreakers = useCallback(async () => {
    try {
      const res = await fetch("/api/stats/circuit-breakers");
      if (res.ok) {
        const data = (await res.json()) as BreakerInfo[];
        setBreakers(data);
      }
    } finally {
      setBreakerLoading(false);
    }
  }, []);

  async function handleTestLocalRouterModel() {
    const url = ollamaUrlInput.trim();
    const model = archRouterModelInput.trim();
    if (!url || !model) return;
    setL3TestLoading(true);
    setL3TestBanner(null);
    try {
      const res = await fetch("/api/settings/local-router-model/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ollamaUrl: url, archRouterModel: model }),
      });
      const data = (await res.json()) as LocalRouterTestResult & { error?: string };
      if (!res.ok) {
        setL3TestBanner({
          variant: "error",
          text: data.error ?? t("settings.error.request"),
        });
        return;
      }
      if (data.ok) {
        setL3TestBanner({
          variant: data.arch_router_model_available ? "success" : "warning",
          text:
            data.message ??
            (data.arch_router_model_available
              ? t("settings.l3.banner.testOk")
              : t("settings.l3.banner.ollamaReach")),
        });
      } else {
        setL3TestBanner({
          variant: "error",
          text: data.error ?? t("settings.error.testFail"),
        });
      }
    } catch {
      setL3TestBanner({ variant: "error", text: t("settings.error.exception") });
    } finally {
      setL3TestLoading(false);
    }
  }

  async function handleSaveLocalRouterModel() {
    const url = ollamaUrlInput.trim();
    const model = archRouterModelInput.trim();
    if (!url || !model) return;
    setLocalRouterSaving(true);
    try {
      const res = await fetch("/api/settings/local-router-model", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ollamaUrl: url, archRouterModel: model }),
      });
      if (res.ok) {
        toast.success(t("common.saveSuccess"));
        void fetchLocalRouterModel();
      } else {
        const err = (await res.json()) as { error?: string };
        toast.error(err.error ?? t("common.saveFail"));
        setLocalRouter((prev) => ({ ...prev, message: err.error ?? t("settings.error.save") } as LocalRouterModelStatus));
      }
    } finally {
      setLocalRouterSaving(false);
    }
  }

  const fetchRoutingSettings = useCallback(async () => {
    setRoutingLoading(true);
    try {
      const [a, b] = await Promise.all([
        fetch("/api/settings/proxy-runtime"),
        fetch("/api/settings/semantic-route"),
      ]);
      if (a.ok) {
        const d = (await a.json()) as {
          semanticCacheCheckTimeoutMs: number;
          fallbackOnInvalidL1Target: boolean;
          routingEnableL2?: boolean;
          routingEnableL3?: boolean;
        };
        setRouting((prev) => ({
          ...prev,
          semanticCacheCheckTimeoutMs: d.semanticCacheCheckTimeoutMs,
          fallbackOnInvalidL1Target: d.fallbackOnInvalidL1Target,
          routingEnableL2: d.routingEnableL2 ?? true,
          routingEnableL3: d.routingEnableL3 ?? true,
        }));
      }
      if (b.ok) {
        const d = (await b.json()) as { semanticRouteThreshold: number };
        setRouting((prev) => ({
          ...prev,
          semanticRouteThreshold: d.semanticRouteThreshold,
        }));
      }
    } finally {
      setRoutingLoading(false);
    }
  }, []);

  const fetchTokenRevealPref = useCallback(async () => {
    setTokenRevealLoading(true);
    try {
      const res = await fetch("/api/settings/token-reveal");
      if (res.ok) {
        const data = (await res.json()) as { allowApiTokenReveal?: boolean };
        setTokenRevealAllow(data.allowApiTokenReveal === true);
      }
    } finally {
      setTokenRevealLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCache();
    void fetchCost(costDays);
    void fetchBreakers();
    void fetchLocalRouterModel();
    void fetchTokenRevealPref();
    void fetchRoutingSettings();
  }, [
    fetchCache,
    fetchCost,
    fetchBreakers,
    fetchLocalRouterModel,
    fetchTokenRevealPref,
    fetchRoutingSettings,
    costDays,
  ]);

  async function handleSaveRouting() {
    setRoutingSaving(true);
    try {
      const [pr, sr] = await Promise.all([
        fetch("/api/settings/proxy-runtime", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            semanticCacheCheckTimeoutMs: routing.semanticCacheCheckTimeoutMs,
            fallbackOnInvalidL1Target: routing.fallbackOnInvalidL1Target,
            routingEnableL2: routing.routingEnableL2,
            routingEnableL3: routing.routingEnableL3,
          }),
        }),
        fetch("/api/settings/semantic-route", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            semanticRouteThreshold: routing.semanticRouteThreshold,
          }),
        }),
      ]);
      if (!pr.ok || !sr.ok) {
        toast.error(t("common.saveFail"));
        return;
      }
      await fetchRoutingSettings();
      toast.success(t("common.saveSuccess"));
    } finally {
      setRoutingSaving(false);
    }
  }

  async function handleSaveCache() {
    setCacheSaving(true);
    try {
      const res = await fetch("/api/settings/cache", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cache),
      });
      if (res.ok) toast.success(t("common.saveSuccess"));
      else toast.error(t("common.saveFail"));
    } finally {
      setCacheSaving(false);
    }
  }

  async function handleSaveTokenRevealPref(next: boolean) {
    setTokenRevealSaving(true);
    try {
      const res = await fetch("/api/settings/token-reveal", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allow: next }),
      });
      if (res.ok) {
        const data = (await res.json()) as { allowApiTokenReveal?: boolean };
        setTokenRevealAllow(data.allowApiTokenReveal === true);
        toast.success(t("common.saveSuccess"));
      } else {
        toast.error(t("common.saveFail"));
      }
    } finally {
      setTokenRevealSaving(false);
    }
  }

  async function handleClearCache() {
    if (!confirm(t("settings.cache.confirmClear"))) return;
    setCacheClearing(true);
    setClearResult(null);
    try {
      const res = await fetch("/api/settings/cache/clear", {
        method: "POST",
      });
      if (res.ok) {
        const data = (await res.json()) as { deleted: number };
        setClearResult(t("settings.cache.cleared", { n: data.deleted }));
        toast.success(t("settings.cache.cleared", { n: data.deleted }));
      } else {
        toast.error(t("common.saveFail"));
      }
    } finally {
      setCacheClearing(false);
    }
  }

  function formatTtl(seconds: number): string {
    if (seconds >= 86400)
      return `${Math.floor(seconds / 86400)}${t("ttl.day")}`;
    if (seconds >= 3600)
      return `${Math.floor(seconds / 3600)}${t("ttl.hour")}`;
    return `${seconds}${t("ttl.second")}`;
  }

  const maxCostVal =
    cost?.dailyCostTrend
      ? Math.max(...cost.dailyCostTrend.map((d) => Math.max(d.actual, d.hypothetical)), 0.001)
      : 1;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {t("settings.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("settings.subtitle")}
        </p>
      </div>

      {/* API Token：是否保存加密副本以供再次复制（ISSUE-V3-05） */}
      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold">
          {t("settings.tokenSecurity.title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("settings.tokenSecurity.desc")}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input"
              checked={tokenRevealAllow}
              disabled={tokenRevealLoading || tokenRevealSaving}
              onChange={(e) => void handleSaveTokenRevealPref(e.target.checked)}
            />
            <span>{t("settings.tokenSecurity.checkbox")}</span>
          </label>
          {tokenRevealSaving ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : null}
        </div>
      </section>

      <RuleGenerationSettings />

      {/* 本地路由模型（L3）— 在 Dashboard 内直接配置，无需改 env */}
      <section
        id="onboarding-local-llm"
        className="rounded-xl border bg-card p-6 shadow-sm"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t("settings.l3.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("settings.l3.desc")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void fetchLocalRouterModel()}
            disabled={localRouterLoading}
            className="rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            {localRouterLoading ? t("settings.l3.loading") : t("settings.l3.refresh")}
          </button>
        </div>

        {localRouterLoading ? (
          <div className="mt-4 h-24 animate-pulse rounded-lg bg-muted" />
        ) : (
          <div className="mt-4 space-y-4">
            {(localRouter?.messageKey || localRouter?.message) && (
              <p className="text-sm text-amber-600">
                {localRouter?.messageKey
                  ? t(localRouter.messageKey, localRouter.messageParams)
                  : localRouter?.message}
              </p>
            )}
            {localRouter?.configured && (
              <div className="flex flex-wrap gap-3">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    localRouter.ollama_available
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  Ollama{" "}
                  {localRouter.ollama_available
                    ? t("settings.l3.ollamaOk")
                    : t("settings.l3.ollamaBad")}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    localRouter.arch_router_model_available
                      ? "bg-green-100 text-green-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {t("settings.l3.modelStatusLine", {
                    state: localRouter.arch_router_model_available
                      ? t("settings.l3.modelPulled")
                      : t("settings.l3.modelNotPulled"),
                  })}
                </span>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="ollama-url" className="block text-sm font-medium text-muted-foreground">
                  {t("settings.l3.ollamaUrl")}
                </label>
                <input
                  id="ollama-url"
                  type="url"
                  value={ollamaUrlInput}
                  onChange={(e) => setOllamaUrlInput(e.target.value)}
                  placeholder="http://host.docker.internal:11434"
                  className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="arch-router-model" className="block text-sm font-medium text-muted-foreground">
                  {t("settings.l3.archModel")}
                </label>
                <input
                  id="arch-router-model"
                  type="text"
                  value={archRouterModelInput}
                  onChange={(e) => setArchRouterModelInput(e.target.value)}
                  placeholder={DEFAULT_ARCH_ROUTER_MODEL}
                  className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t("settings.l3.hint")}</p>
            {l3TestBanner && (
              <p
                role="status"
                className={`rounded-lg border px-3 py-2 text-sm ${
                  l3TestBanner.variant === "success"
                    ? "border-green-200 bg-green-50 text-green-800 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-400"
                    : l3TestBanner.variant === "warning"
                      ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
                      : "border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
                }`}
              >
                {l3TestBanner.text}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void handleTestLocalRouterModel()}
                disabled={
                  l3TestLoading ||
                  !ollamaUrlInput.trim() ||
                  !archRouterModelInput.trim()
                }
                className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                {l3TestLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {l3TestLoading ? t("settings.l3.testing") : t("settings.l3.test")}
              </button>
              <button
                type="button"
                onClick={() => void handleSaveLocalRouterModel()}
                disabled={localRouterSaving || !ollamaUrlInput.trim() || !archRouterModelInput.trim()}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {localRouterSaving ? t("settings.l3.saving") : t("settings.l3.save")}
              </button>
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{t("settings.l3.pullCmd")}</span>
                <code className="rounded bg-muted px-2 py-1 font-mono text-xs">
                  ollama pull {archRouterModelInput || DEFAULT_ARCH_ROUTER_MODEL}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    const cmd = `ollama pull ${archRouterModelInput || DEFAULT_ARCH_ROUTER_MODEL}`;
                    void navigator.clipboard.writeText(cmd).then(() => {
                      setCopyFeedback(true);
                      setTimeout(() => setCopyFeedback(false), 2000);
                    });
                  }}
                  className="rounded-md border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
                >
                  {copyFeedback ? t("settings.l3.copied") : t("settings.l3.copy")}
                </button>
              </span>
            </div>
          </div>
        )}
      </section>

      {/* 缓存设置 */}
      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold">{t("settings.cache.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("settings.cache.desc")}
        </p>

        {cacheLoading ? (
          <div className="mt-4 h-20 animate-pulse rounded-lg bg-muted" />
        ) : (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">
                  {t("settings.cache.exactTtl")}
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="number"
                    value={cache.exactCacheTtl}
                    onChange={(e) =>
                      setCache((prev) => ({
                        ...prev,
                        exactCacheTtl: Number(e.target.value),
                      }))
                    }
                    min={0}
                    max={604800}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <span className="whitespace-nowrap text-sm text-muted-foreground">
                    = {formatTtl(cache.exactCacheTtl)}
                  </span>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">
                  {t("settings.cache.semanticTtl")}
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="number"
                    value={cache.semanticCacheTtl}
                    onChange={(e) =>
                      setCache((prev) => ({
                        ...prev,
                        semanticCacheTtl: Number(e.target.value),
                      }))
                    }
                    min={0}
                    max={604800}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <span className="whitespace-nowrap text-sm text-muted-foreground">
                    = {formatTtl(cache.semanticCacheTtl)}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => void handleSaveCache()}
                disabled={cacheSaving}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {cacheSaving ? t("settings.cache.saving") : t("settings.cache.save")}
              </button>
              <button
                onClick={() => void handleClearCache()}
                disabled={cacheClearing}
                className="rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                {cacheClearing ? t("settings.cache.clearing") : t("settings.cache.clear")}
              </button>
              {clearResult && (
                <span className="text-sm text-green-600">{clearResult}</span>
              )}
            </div>
          </div>
        )}
      </section>

      {/* 路由与缓存策略（ISSUE-V4-03 / V4-04 / V4-06） */}
      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold">{t("settings.routing.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("settings.routing.subtitle")}
        </p>
        {routingLoading ? (
          <div className="mt-4 h-24 animate-pulse rounded-lg bg-muted" />
        ) : (
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="l05-timeout"
                  className="block text-sm font-medium text-muted-foreground"
                >
                  {t("settings.routing.l05Timeout")}
                </label>
                <input
                  id="l05-timeout"
                  type="number"
                  min={10}
                  max={200}
                  value={routing.semanticCacheCheckTimeoutMs}
                  onChange={(e) =>
                    setRouting((p) => ({
                      ...p,
                      semanticCacheCheckTimeoutMs: Number(e.target.value),
                    }))
                  }
                  className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("settings.routing.l05Hint")}
                </p>
              </div>
              <div>
                <label
                  htmlFor="l2-threshold"
                  className="block text-sm font-medium text-muted-foreground"
                >
                  {t("settings.routing.l2Threshold")}
                </label>
                <input
                  id="l2-threshold"
                  type="number"
                  min={0.5}
                  max={0.99}
                  step={0.01}
                  value={routing.semanticRouteThreshold}
                  onChange={(e) =>
                    setRouting((p) => ({
                      ...p,
                      semanticRouteThreshold: Number(e.target.value),
                    }))
                  }
                  className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("settings.routing.l2Hint")}
                </p>
              </div>
            </div>
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-input"
                checked={routing.fallbackOnInvalidL1Target}
                onChange={(e) =>
                  setRouting((p) => ({
                    ...p,
                    fallbackOnInvalidL1Target: e.target.checked,
                  }))
                }
              />
              <span>
                <span className="font-medium">{t("settings.routing.fallbackInvalid")}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {t("settings.routing.fallbackInvalidHint")}
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-input"
                checked={routing.routingEnableL2}
                onChange={(e) =>
                  setRouting((p) => ({
                    ...p,
                    routingEnableL2: e.target.checked,
                  }))
                }
              />
              <span>
                <span className="font-medium">{t("settings.routing.enableL2")}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {t("settings.routing.enableL2Hint")}
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-input"
                checked={routing.routingEnableL3}
                onChange={(e) =>
                  setRouting((p) => ({
                    ...p,
                    routingEnableL3: e.target.checked,
                  }))
                }
              />
              <span>
                <span className="font-medium">{t("settings.routing.enableL3")}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {t("settings.routing.enableL3Hint")}
                </span>
              </span>
            </label>
            <button
              type="button"
              onClick={() => void handleSaveRouting()}
              disabled={routingSaving}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {routingSaving ? t("settings.routing.saving") : t("settings.routing.save")}
            </button>
          </div>
        )}
      </section>

      {/* 成本概览 */}
      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t("settings.cost.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("settings.cost.subtitle")}
            </p>
          </div>
          <div className="flex gap-1 rounded-lg border p-0.5">
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                onClick={() => setCostDays(d)}
                className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                  costDays === d
                    ? "bg-blue-600 text-white"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {t("settings.cost.days", { n: d })}
              </button>
            ))}
          </div>
        </div>

        {costLoading ? (
          <div className="mt-4 grid grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-lg bg-muted"
              />
            ))}
          </div>
        ) : cost ? (
          <div className="mt-4 space-y-6">
            {/* KPI 卡片 */}
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg border bg-green-50 p-4">
                <p className="text-sm font-medium text-green-700">
                  {t("settings.cost.savedToday")}
                </p>
                <p className="mt-1 text-3xl font-bold text-green-600">
                  ${cost.todaySaved.toFixed(4)}
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm font-medium text-muted-foreground">
                  {t("settings.cost.actualToday")}
                </p>
                <p className="mt-1 text-2xl font-bold">
                  ${cost.todayActualCost.toFixed(4)}
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm font-medium text-muted-foreground">
                  {t("settings.cost.hypo")}
                </p>
                <p className="mt-1 text-2xl font-bold text-gray-400">
                  ${cost.todayHypotheticalCost.toFixed(4)}
                </p>
              </div>
            </div>

            {/* 预算进度 */}
            {cost.monthlyBudget !== null && cost.budgetUsed !== null && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{t("settings.cost.budget")}</span>
                  <span className="text-muted-foreground">
                    ${cost.budgetUsed.toFixed(2)} / ${cost.monthlyBudget.toFixed(2)}
                  </span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all ${
                      cost.budgetUsed / cost.monthlyBudget > 0.9
                        ? "bg-red-500"
                        : cost.budgetUsed / cost.monthlyBudget > 0.7
                          ? "bg-amber-500"
                          : "bg-green-500"
                    }`}
                    style={{
                      width: `${Math.min((cost.budgetUsed / cost.monthlyBudget) * 100, 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* 每日趋势图 */}
            {cost.dailyCostTrend.length > 0 && (
              <div>
                <h3 className="mb-3 text-sm font-medium">{t("settings.cost.trend")}</h3>
                <div className="space-y-2">
                  {/* 图例 */}
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-500" />
                      {t("settings.cost.legendActual")}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-2.5 w-2.5 rounded-sm bg-gray-300" />
                      {t("settings.cost.legendHypo")}
                    </span>
                  </div>
                  {/* 条形图 */}
                  <div className="space-y-1.5">
                    {cost.dailyCostTrend.map((day) => (
                      <div key={day.date} className="flex items-center gap-3">
                        <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
                          {day.date.slice(5)}
                        </span>
                        <div className="relative flex-1">
                          <div
                            className="absolute h-4 rounded-sm bg-gray-200"
                            style={{
                              width: `${(day.hypothetical / maxCostVal) * 100}%`,
                            }}
                          />
                          <div
                            className="relative z-10 h-4 rounded-sm bg-blue-500"
                            style={{
                              width: `${(day.actual / maxCostVal) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="w-20 shrink-0 text-xs text-muted-foreground">
                          ${day.actual.toFixed(4)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">{t("settings.cost.noData")}</p>
        )}
      </section>

      {/* 熔断器状态 */}
      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t("settings.breaker.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("settings.breaker.subtitle")}
            </p>
          </div>
          <button
            onClick={() => {
              setBreakerLoading(true);
              void fetchBreakers();
            }}
            className="rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
          >
            {t("settings.breaker.refresh")}
          </button>
        </div>

        {breakerLoading ? (
          <div className="mt-4 h-16 animate-pulse rounded-lg bg-muted" />
        ) : breakers.length === 0 ? (
          <div className="mt-4 rounded-lg border-2 border-dashed p-8 text-center text-muted-foreground">
            <p className="text-green-600 font-medium">{t("settings.breaker.allOk")}</p>
            <p className="mt-1 text-sm">{t("settings.breaker.none")}</p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">{t("settings.breaker.col.model")}</th>
                  <th className="px-4 py-3 text-center font-medium">{t("settings.breaker.col.state")}</th>
                  <th className="px-4 py-3 text-left font-medium">{t("settings.breaker.col.reason")}</th>
                  <th className="px-4 py-3 text-left font-medium">{t("settings.breaker.col.opened")}</th>
                  <th className="px-4 py-3 text-left font-medium">{t("settings.breaker.col.until")}</th>
                </tr>
              </thead>
              <tbody>
                {breakers.map((b, i) => (
                  <tr key={i} className="border-b">
                    <td className="px-4 py-3 font-mono text-sm">
                      {b.model}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          b.state === "open"
                            ? "bg-red-100 text-red-700"
                            : b.state === "half-open"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-green-100 text-green-700"
                        }`}
                      >
                        {b.state}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {b.triggeredBy}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {b.openedAt
                        ? new Date(b.openedAt).toLocaleString(dateLocale)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {b.until
                        ? new Date(b.until).toLocaleString(dateLocale)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

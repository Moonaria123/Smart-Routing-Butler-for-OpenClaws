// 规则命中分析 — 表格展示规则命中统计；规则名称按控制台语言展示中英文
"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { pickRuleName } from "@/lib/rule-display";
import type { Locale } from "@/lib/i18n/messages";

interface RuleHitData {
  id: string;
  name: string;
  nameEn?: string | null;
  hitCount: number;
  lastHitAt: string | null;
  avgLatencyMs: number;
  percentage: number;
  enabled: boolean;
  unused: boolean;
}

function formatLastHit(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleString(locale === "en" ? "en-US" : "zh-CN");
}

export function RuleHitStats() {
  const { t, locale } = useI18n();
  const [data, setData] = useState<RuleHitData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tokenFilter, setTokenFilter] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (tokenFilter) params.set("apiTokenId", tokenFilter);
      const qs = params.toString();
      const res = await fetch(`/api/stats/rules-hit${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error("load fail");
      const json = (await res.json()) as RuleHitData[];
      setData(json);
      setError(null);
    } catch {
      setError(t("rules.hit.loadFail"));
    } finally {
      setLoading(false);
    }
  }, [t, tokenFilter]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        {t("rules.hit.loading")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        {error}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-lg border-2 border-dashed text-muted-foreground">
        <p className="text-lg">{t("rules.hit.emptyTitle")}</p>
        <p className="mt-1 text-sm">{t("rules.hit.emptyHint")}</p>
      </div>
    );
  }

  const maxHits = Math.max(...data.map((d) => d.hitCount), 1);

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">
            {t("rules.hit.filterByToken")}
          </label>
          <input
            type="text"
            placeholder={t("rules.hit.filterTokenPh")}
            value={tokenFilter}
            onChange={(e) => setTokenFilter(e.target.value)}
            className="h-9 w-48 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void fetchData();
          }}
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {t("logs.filter.apply")}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t("rules.hit.cardTotalHits")}</p>
          <p className="mt-1 text-2xl font-bold">
            {data.reduce((s, d) => s + d.hitCount, 0).toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t("rules.hit.cardActiveRules")}</p>
          <p className="mt-1 text-2xl font-bold">
            {data.filter((d) => d.hitCount > 0).length} / {data.length}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t("rules.hit.cardUnusedRules")}</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">
            {data.filter((d) => d.unused).length}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium">{t("rules.hit.col.name")}</th>
              <th className="px-4 py-3 text-right font-medium">{t("rules.hit.col.hits")}</th>
              <th className="px-4 py-3 text-left font-medium">{t("rules.hit.col.share")}</th>
              <th className="px-4 py-3 text-right font-medium">{t("rules.hit.col.avgLatency")}</th>
              <th className="px-4 py-3 text-left font-medium">{t("rules.hit.col.lastHit")}</th>
              <th className="px-4 py-3 text-center font-medium">{t("rules.hit.col.status")}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((rule) => (
              <tr
                key={rule.id}
                className="border-b transition-colors hover:bg-muted/30"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {pickRuleName(
                        { name: rule.name, nameEn: rule.nameEn },
                        locale,
                      )}
                    </span>
                    {rule.unused && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        ⚠️ {t("rules.hit.badge.neverUsed")}
                      </span>
                    )}
                    {!rule.enabled && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                        {t("rules.hit.badge.disabled")}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {rule.hitCount.toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all"
                        style={{
                          width: `${(rule.hitCount / maxHits) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {rule.percentage}%
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {rule.avgLatencyMs > 0 ? `${rule.avgLatencyMs}ms` : "—"}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {rule.lastHitAt
                    ? formatLastHit(rule.lastHitAt, locale)
                    : t("rules.hit.neverHit")}
                </td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      rule.hitCount > 0 && rule.enabled
                        ? "bg-green-500"
                        : rule.enabled
                          ? "bg-yellow-500"
                          : "bg-gray-400"
                    }`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void fetchData();
          }}
          className="rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
        >
          {t("rules.hit.refresh")}
        </button>
      </div>
    </div>
  );
}

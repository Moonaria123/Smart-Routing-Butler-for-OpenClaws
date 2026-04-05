"use client";
// Dashboard 总览客户端组件 — 30s 轮询刷新 KPI 与图表数据
import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  DollarSign,
  PiggyBank,
  Database,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";

interface OverviewData {
  todayRequests: number;
  todaySpent: number;
  todaySaved: number;
  cacheHitRate: number;
  hourlyData: { hour: number; requests: number }[];
  providerDistribution: { model: string; count: number }[];
  tokenDistribution?: { name: string | null; count: number }[];
  imageGenRequests?: number;
}

interface LatencyPercentileRow {
  routingLayer: string;
  sampleCount: number;
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
}

const POLL_INTERVAL = 30_000;

export function DashboardOverviewClient() {
  const { t } = useI18n();
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [latencyRows, setLatencyRows] = useState<LatencyPercentileRow[] | null>(
    null,
  );

  const fetchData = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    try {
      const res = await fetch("/api/stats/overview");
      if (!res.ok) {
        let msg = t("overview.loadFailHttp", { status: res.status });
        try {
          const errBody = (await res.json()) as { error?: string };
          if (errBody.error) {
            msg = errBody.error;
          }
        } catch {
          /* 忽略非 JSON */
        }
        throw new Error(msg);
      }
      const json = (await res.json()) as OverviewData;
      setData(json);
      setError(null);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t("overview.loadFailGeneric"),
      );
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void fetchData(true);
    const timer = setInterval(() => void fetchData(), POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [fetchData]);

  const fetchLatency = useCallback(async () => {
    try {
      const res = await fetch("/api/stats/latency-percentiles?hours=24");
      if (!res.ok) return;
      const json = (await res.json()) as { layers: LatencyPercentileRow[] };
      setLatencyRows(json.layers ?? []);
    } catch {
      setLatencyRows([]);
    }
  }, []);

  useEffect(() => {
    void fetchLatency();
    const timer = setInterval(() => void fetchLatency(), POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [fetchLatency]);

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-xl border border-border bg-card"
          />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-destructive/50 bg-destructive/10 p-6 text-center text-sm text-foreground"
      >
        <span className="font-medium text-destructive">
          {t("overview.loadFailPrefix")}
        </span>
        {error ?? t("overview.noData")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title={t("overview.kpi.requests")}
          value={data.todayRequests.toLocaleString()}
          icon={<Activity className="h-5 w-5" />}
          accent="text-blue-600"
          accentBg="bg-blue-50 dark:bg-blue-950"
        />
        <KpiCard
          title={t("overview.kpi.spent")}
          value={`$${data.todaySpent.toFixed(4)}`}
          icon={<DollarSign className="h-5 w-5" />}
          accent="text-amber-600"
          accentBg="bg-amber-50 dark:bg-amber-950"
        />
        <KpiCard
          title={t("overview.kpi.saved")}
          value={`$${data.todaySaved.toFixed(4)}`}
          icon={<PiggyBank className="h-5 w-5" />}
          accent="text-green-600"
          accentBg="bg-green-50 dark:bg-green-950"
        />
        <KpiCard
          title={t("overview.kpi.cache")}
          value={`${data.cacheHitRate}%`}
          icon={<Database className="h-5 w-5" />}
          accent="text-violet-600"
          accentBg="bg-violet-50 dark:bg-violet-950"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t("overview.chart24h")}</h2>
            <button
              onClick={() => void fetchData()}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title={t("overview.refresh")}
              type="button"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
          <HourlyChart data={data.hourlyData} />
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold">
            {t("overview.providerDist")}
          </h2>
          <ProviderDistribution
            data={data.providerDistribution}
            emptyLabel={t("overview.noTraffic")}
          />
        </div>
      </div>

      {/* Token 使用分布 */}
      {data.tokenDistribution && data.tokenDistribution.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold">
            {t("overview.tokenDistribution")}
          </h2>
          <TokenDistribution
            data={data.tokenDistribution}
            emptyLabel={t("overview.tokenDistEmpty")}
          />
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{t("overview.latency.title")}</h2>
          <a
            href="/api/stats/latency-percentiles?hours=24&format=csv"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {t("overview.latency.exportCsv")}
          </a>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          {t("overview.latency.hint")}
        </p>
        {latencyRows === null ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : latencyRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("overview.latency.empty")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="py-2 pr-2 font-medium">
                    {t("overview.latency.layer")}
                  </th>
                  <th className="py-2 pr-2 font-medium">{t("overview.latency.n")}</th>
                  <th className="py-2 pr-2 font-medium">P50</th>
                  <th className="py-2 pr-2 font-medium">P95</th>
                  <th className="py-2 font-medium">P99</th>
                </tr>
              </thead>
              <tbody>
                {latencyRows.map((row) => (
                  <tr key={row.routingLayer} className="border-b border-border/60">
                    <td className="py-2 pr-2 font-mono text-xs">{row.routingLayer}</td>
                    <td className="py-2 pr-2">{row.sampleCount}</td>
                    <td className="py-2 pr-2">{fmtMs(row.p50Ms)}</td>
                    <td className="py-2 pr-2">{fmtMs(row.p95Ms)}</td>
                    <td className="py-2">{fmtMs(row.p99Ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function fmtMs(v: number | null): string {
  if (v === null || Number.isNaN(v)) return "—";
  return `${v} ms`;
}

function KpiCard({
  title,
  value,
  icon,
  accent,
  accentBg,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  accent: string;
  accentBg: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <div className={cn("rounded-lg p-2", accentBg, accent)}>{icon}</div>
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight">{value}</p>
    </div>
  );
}

function HourlyChart({ data }: { data: { hour: number; requests: number }[] }) {
  const max = Math.max(...data.map((d) => d.requests), 1);

  return (
    <div className="flex h-48 items-end gap-1">
      {data.map((d) => {
        const heightPct = (d.requests / max) * 100;
        return (
          <div
            key={d.hour}
            className="group relative flex flex-1 flex-col items-center"
          >
            <div className="absolute -top-7 hidden rounded bg-popover px-2 py-1 text-xs shadow group-hover:block">
              {d.hour}:00 — {d.requests}
            </div>
            <div
              className="w-full rounded-t bg-blue-500/80 transition-all group-hover:bg-blue-600"
              style={{ height: `${Math.max(heightPct, 2)}%` }}
            />
            {d.hour % 4 === 0 && (
              <span className="mt-1 text-[10px] text-muted-foreground">
                {d.hour}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ProviderDistribution({
  data,
  emptyLabel,
}: {
  data: { model: string; count: number }[];
  emptyLabel: string;
}) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </p>
    );
  }

  const total = data.reduce((s, d) => s + d.count, 0);
  const colors = [
    "bg-blue-500",
    "bg-green-500",
    "bg-amber-500",
    "bg-violet-500",
    "bg-rose-500",
    "bg-cyan-500",
    "bg-orange-500",
    "bg-teal-500",
    "bg-pink-500",
    "bg-indigo-500",
  ];

  return (
    <div className="space-y-3">
      {data.map((d, i) => {
        const pct = Math.round((d.count / total) * 100);
        return (
          <div key={d.model}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="truncate font-medium" title={d.model}>
                {d.model}
              </span>
              <span className="ml-2 text-muted-foreground">
                {d.count} ({pct}%)
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full transition-all", colors[i % colors.length])}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TokenDistribution({
  data,
  emptyLabel,
}: {
  data: { name: string | null; count: number }[];
  emptyLabel: string;
}) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </p>
    );
  }

  const total = data.reduce((s, d) => s + d.count, 0);
  const colors = [
    "bg-teal-500",
    "bg-indigo-500",
    "bg-rose-500",
    "bg-amber-500",
    "bg-cyan-500",
    "bg-violet-500",
    "bg-green-500",
    "bg-blue-500",
    "bg-orange-500",
    "bg-pink-500",
  ];

  return (
    <div className="space-y-3">
      {data.map((d, i) => {
        const pct = Math.round((d.count / total) * 100);
        const label = d.name ?? "Unknown";
        return (
          <div key={label}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="truncate font-medium" title={label}>
                {label}
              </span>
              <span className="ml-2 text-muted-foreground">
                {d.count} ({pct}%)
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full transition-all", colors[i % colors.length])}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

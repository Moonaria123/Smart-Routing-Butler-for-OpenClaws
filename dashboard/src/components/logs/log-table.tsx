// 日志数据表格 — 支持行展开、分页、移动端横向滚动；表头与说明随语言切换
"use client";

import { useCallback, useState } from "react";
import type { Locale } from "@/lib/i18n/messages";
import { useI18n } from "@/lib/i18n/context";

export interface LogEntry {
  id: string;
  timestamp: string;
  routingLayer: string;
  ruleId: string | null;
  targetModel: string;
  confidence: number | null;
  latencyMs: number;
  routingLatencyMs: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  statusCode: number;
  streaming: boolean;
  cacheHit: boolean;
  thinkingEnabled: boolean;
  modalities: string[];
  apiTokenId: string | null;
  apiTokenName: string | null;
}

interface PaginationInfo {
  page: number;
  totalPages: number;
  total: number;
}

interface LogTableProps {
  logs: LogEntry[];
  pagination: PaginationInfo;
  onPageChange: (page: number) => void;
}

const LAYER_STYLES: Record<string, string> = {
  L0_EXACT_CACHE: "bg-blue-100 text-blue-800",
  "L0.5_SEMANTIC_CACHE": "bg-sky-100 text-sky-800",
  L1_RULE: "bg-green-100 text-green-800",
  L2_SEMANTIC: "bg-purple-100 text-purple-800",
  L3_ARCH_ROUTER: "bg-orange-100 text-orange-800",
  L3_FALLBACK: "bg-amber-100 text-amber-800",
  DIRECT: "bg-pink-100 text-pink-800",
};

function layerBadge(layer: string) {
  const style = LAYER_STYLES[layer] ?? "bg-gray-100 text-gray-800";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>
      {layer}
    </span>
  );
}

function formatTime(iso: string, locale: Locale): string {
  const d = new Date(iso);
  return d.toLocaleString(locale === "en" ? "en-US" : "zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function buildExplanation(
  log: LogEntry,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  const model = log.targetModel;
  const conf = log.confidence?.toFixed(2) ?? "N/A";
  switch (log.routingLayer) {
    case "L0_EXACT_CACHE":
      return t("logs.explain.l0Exact", { model });
    case "L0.5_SEMANTIC_CACHE":
      return t("logs.explain.l0_5Semantic", { conf, model });
    case "L1_RULE":
      return t("logs.explain.l1Rule", {
        ruleId: log.ruleId ?? "—",
        model,
      });
    case "L2_SEMANTIC":
      return t("logs.explain.l2Semantic", { conf, model });
    case "L3_ARCH_ROUTER":
      return t("logs.explain.l3Arch", { conf, model });
    case "L3_FALLBACK":
      return t("logs.explain.l3Fallback", { model });
    case "DIRECT":
      return t("logs.explain.direct", { model });
    default:
      return t("logs.explain.default", {
        layer: log.routingLayer,
        model,
      });
  }
}

export function LogTable({ logs, pagination, onPageChange }: LogTableProps) {
  const { t, locale } = useI18n();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const { page, totalPages, total } = pagination;

  const pageNumbers: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);
  for (let i = start; i <= end; i++) {
    pageNumbers.push(i);
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-3 py-2 text-left font-medium">{t("logs.table.time")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("logs.table.layer")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("logs.table.model")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("logs.table.token")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("logs.table.latency")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("logs.table.tokens")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("logs.table.cost")}</th>
              <th className="px-3 py-2 text-center font-medium">{t("logs.table.status")}</th>
              <th className="px-3 py-2 text-center font-medium">{t("logs.table.streaming")}</th>
              <th className="px-3 py-2 text-center font-medium">{t("logs.table.cache")}</th>
              <th className="px-3 py-2 text-center font-medium">{t("logs.table.thinking")}</th>
              <th className="px-3 py-2 text-center font-medium">{t("logs.table.modality")}</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && (
              <tr>
                <td colSpan={12} className="px-3 py-8 text-center text-muted-foreground">
                  {t("logs.empty")}
                </td>
              </tr>
            )}
            {logs.map((log) => (
              <LogRow
                key={log.id}
                log={log}
                expanded={expandedId === log.id}
                onToggle={toggleExpand}
                locale={locale}
                t={t}
              />
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t("logs.pagination", { total, page, totalPages })}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-40"
            >
              {t("logs.prev")}
            </button>
            {pageNumbers.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onPageChange(n)}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  n === page
                    ? "bg-primary text-primary-foreground"
                    : "border border-border hover:bg-muted"
                }`}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-40"
            >
              {t("logs.next")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LogRow({
  log,
  expanded,
  onToggle,
  locale,
  t,
}: {
  log: LogEntry;
  expanded: boolean;
  onToggle: (id: string) => void;
  locale: Locale;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const isError = log.statusCode >= 400;

  return (
    <>
      <tr
        onClick={() => onToggle(log.id)}
        className="cursor-pointer border-b border-border transition-colors hover:bg-muted/30"
      >
        <td className="whitespace-nowrap px-3 py-2 tabular-nums">
          {formatTime(log.timestamp, locale)}
        </td>
        <td className="px-3 py-2">{layerBadge(log.routingLayer)}</td>
        <td className="max-w-[200px] truncate px-3 py-2 font-mono text-xs">
          {log.targetModel}
        </td>
        <td className="max-w-[120px] truncate px-3 py-2 text-xs">
          {log.apiTokenName ?? "—"}
        </td>
        <td className="px-3 py-2 text-right tabular-nums">{log.latencyMs}</td>
        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
          {log.inputTokens}/{log.outputTokens}
        </td>
        <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
          ${log.estimatedCostUsd.toFixed(6)}
        </td>
        <td className="px-3 py-2 text-center">
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
              isError ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"
            }`}
          >
            {log.statusCode}
          </span>
        </td>
        <td className="px-3 py-2 text-center">
          {log.streaming ? (
            <span className="text-green-600">✓</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-3 py-2 text-center">
          {log.cacheHit ? (
            <span className="text-green-600">✓</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-3 py-2 text-center">
          {log.thinkingEnabled ? (
            <span className="text-purple-600">✓</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-3 py-2 text-center">
          {(log.modalities ?? []).filter((m) => m !== "text").length > 0 ? (
            <div className="flex flex-wrap justify-center gap-1">
              {log.modalities.includes("vision") && (
                <span className="inline-block rounded-full bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                  vision
                </span>
              )}
              {log.modalities.includes("audio") && (
                <span className="inline-block rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  audio
                </span>
              )}
              {log.modalities.includes("image-generation") && (
                <span className="inline-block rounded-full bg-pink-100 px-1.5 py-0.5 text-xs font-medium text-pink-700 dark:bg-pink-900/30 dark:text-pink-400">
                  image-gen
                </span>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border bg-muted/20">
          <td colSpan={12} className="px-4 py-3">
            <div className="space-y-1 text-sm">
              <p className="font-medium text-foreground">
                {buildExplanation(log, t)}
              </p>
              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span>
                  {t("logs.detail.routingLatency")}: {log.routingLatencyMs}ms
                </span>
                <span>
                  {t("logs.detail.totalLatency")}: {log.latencyMs}ms
                </span>
                {log.confidence != null && (
                  <span>
                    {t("logs.detail.confidence")}: {log.confidence.toFixed(3)}
                  </span>
                )}
                {log.ruleId && (
                  <span>
                    {t("logs.detail.ruleId")}: {log.ruleId}
                  </span>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

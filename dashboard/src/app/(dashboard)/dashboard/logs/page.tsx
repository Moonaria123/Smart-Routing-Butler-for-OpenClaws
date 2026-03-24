// 请求日志页 — 筛选、分页浏览、CSV 导出（ISSUE-V3-06）
"use client";

import { useCallback, useEffect, useState } from "react";
import { LogFiltersBar, type LogFilters } from "@/components/logs/log-filters";
import { LogTable, type LogEntry } from "@/components/logs/log-table";
import { useI18n } from "@/lib/i18n/context";

interface LogsResponse {
  logs: LogEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const DEFAULT_FILTERS: LogFilters = {
  from: "",
  to: "",
  model: "",
  routingLayer: "ALL",
};

export default function LogsPage() {
  const { t } = useI18n();
  const [filters, setFilters] = useState<LogFilters>(DEFAULT_FILTERS);
  const [data, setData] = useState<LogsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const fetchLogs = useCallback(
    async (targetPage: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("page", String(targetPage));
        params.set("limit", "50");
        if (filters.from) params.set("from", filters.from);
        if (filters.to) params.set("to", filters.to);
        if (filters.model) params.set("model", filters.model);
        if (filters.routingLayer && filters.routingLayer !== "ALL") {
          params.set("routingLayer", filters.routingLayer);
        }

        const res = await fetch(`/api/stats/logs?${params.toString()}`);
        if (!res.ok) throw new Error(t("logs.fetchFail"));
        const json: LogsResponse = await res.json();
        setData(json);
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [filters, t],
  );

  useEffect(() => {
    void fetchLogs(page);
  }, [fetchLogs, page]);

  const handleFilterChange = useCallback((newFilters: LogFilters) => {
    setFilters(newFilters);
    setPage(1);
  }, []);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  const handleExport = useCallback(() => {
    window.open("/api/stats/logs/export", "_blank");
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("logs.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("logs.subtitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          {t("logs.export")}
        </button>
      </div>

      <LogFiltersBar filters={filters} onFilterChange={handleFilterChange} />

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <p className="text-muted-foreground">{t("logs.loading")}</p>
        </div>
      ) : data ? (
        <LogTable
          logs={data.logs}
          pagination={{
            page: data.page,
            totalPages: data.totalPages,
            total: data.total,
          }}
          onPageChange={handlePageChange}
        />
      ) : (
        <div className="flex items-center justify-center py-16">
          <p className="text-destructive">{t("logs.loadFail")}</p>
        </div>
      )}
    </div>
  );
}

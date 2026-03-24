// 日志筛选栏 — 日期范围、模型、路由层筛选（日期用文本 ISO，避免系统区域污染原生 date 控件）
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { LogDateField } from "@/components/logs/log-date-field";

export interface LogFilters {
  from: string;
  to: string;
  model: string;
  routingLayer: string;
}

interface LogFiltersProps {
  filters: LogFilters;
  onFilterChange: (filters: LogFilters) => void;
}

const ROUTING_LAYER_VALUES = [
  "ALL",
  "L0_EXACT_CACHE",
  "L0.5_SEMANTIC_CACHE",
  "L1_RULE",
  "L2_SEMANTIC",
  "L3_ARCH_ROUTER",
  "L3_FALLBACK",
] as const;

function routingLayerMessageKey(
  value: (typeof ROUTING_LAYER_VALUES)[number],
): string {
  if (value === "ALL") return "logs.filter.layerAll";
  if (value === "L0.5_SEMANTIC_CACHE") return "logs.filter.layerL0_5";
  return `logs.filter.${value}`;
}

/** 空串合法；否则须为真实存在的日历日 YYYY-MM-DD */
function isValidIsoDateOptional(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
  const [y, m, d] = t.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

export function LogFiltersBar({ filters, onFilterChange }: LogFiltersProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<LogFilters>(filters);
  const [dateError, setDateError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(filters);
  }, [filters]);

  const routingLayers = useMemo(
    () =>
      ROUTING_LAYER_VALUES.map((value) => ({
        value,
        label: t(routingLayerMessageKey(value)),
      })),
    [t],
  );

  const handleChange = useCallback(
    (field: keyof LogFilters, value: string) => {
      setDateError(null);
      setDraft((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const handleApply = useCallback(() => {
    if (
      !isValidIsoDateOptional(draft.from) ||
      !isValidIsoDateOptional(draft.to)
    ) {
      setDateError(t("logs.filter.dateInvalid"));
      return;
    }
    setDateError(null);
    onFilterChange({
      ...draft,
      from: draft.from.trim(),
      to: draft.to.trim(),
    });
  }, [draft, onFilterChange, t]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <LogDateField
          id="log-filter-from"
          label={t("logs.filter.dateFrom")}
          value={draft.from}
          onChange={(v) => handleChange("from", v)}
          invalid={Boolean(dateError)}
          placeholder={t("logs.filter.datePlaceholder")}
        />

        <LogDateField
          id="log-filter-to"
          label={t("logs.filter.dateTo")}
          value={draft.to}
          onChange={(v) => handleChange("to", v)}
          invalid={Boolean(dateError)}
          placeholder={t("logs.filter.datePlaceholder")}
        />

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">
            {t("logs.filter.model")}
          </label>
          <input
            type="text"
            placeholder={t("logs.filter.modelPh")}
            value={draft.model}
            onChange={(e) => handleChange("model", e.target.value)}
            className="h-9 w-48 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">
            {t("logs.filter.layer")}
          </label>
          <select
            value={draft.routingLayer}
            onChange={(e) => handleChange("routingLayer", e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {routingLayers.map((layer) => (
              <option key={layer.value} value={layer.value}>
                {layer.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={handleApply}
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {t("logs.filter.apply")}
        </button>
      </div>
      {dateError ? (
        <p className="text-xs text-destructive" role="alert">
          {dateError}
        </p>
      ) : null}
    </div>
  );
}

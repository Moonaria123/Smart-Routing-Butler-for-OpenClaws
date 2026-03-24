// 自然语言规则生成器 — 输入自然语言描述，LLM 解析为结构化规则（含中英文名称与描述）
"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { pickRuleDescription, pickRuleName } from "@/lib/rule-display";
import type { RuleBilingualFields } from "@/lib/rule-display";

interface GeneratedRule {
  name: string;
  nameEn: string;
  priority: number;
  enabled: boolean;
  conditions: { combinator: string; items: Array<Record<string, unknown>> };
  targetModel: string;
  fallbackChain: string[];
  description: string;
  descriptionEn: string;
  confidence: number;
  _selected: boolean;
}

function confidenceColor(c: number): string {
  if (c >= 0.85) return "bg-green-100 text-green-800";
  if (c >= 0.7) return "bg-yellow-100 text-yellow-800";
  return "bg-red-100 text-red-800";
}

function confidenceLabel(
  c: number,
  t: (k: string, vars?: Record<string, string | number>) => string,
): string {
  if (c >= 0.85) return t("rules.nl.confidence.high");
  if (c >= 0.7) return t("rules.nl.confidence.mid");
  return t("rules.nl.confidence.low");
}

export function NlRuleGenerator({
  onSave,
}: {
  onSave: (rules: Omit<GeneratedRule, "_selected">[]) => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const [text, setText] = useState("");
  const [rules, setRules] = useState<GeneratedRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [preciseMode, setPreciseMode] = useState(false);

  const exampleKeys = useMemo(
    () =>
      [
        "rules.nl.example1",
        "rules.nl.example2",
        "rules.nl.example3",
        "rules.nl.example4",
        "rules.nl.example5",
      ] as const,
    [],
  );

  async function handleGenerate(modeOverride?: "json" | "structured") {
    if (!text.trim()) return;
    const mode = modeOverride ?? (preciseMode ? "structured" : "json");
    if (modeOverride === "structured") setPreciseMode(true);
    setLoading(true);
    setError(null);
    setWarnings([]);
    setRules([]);

    try {
      const res = await fetch("/api/rules/generate-from-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, locale, mode }),
      });
      const data = (await res.json()) as {
        rules: Array<Record<string, unknown>>;
        error?: string;
        warnings?: string[];
      };

      if (!res.ok) {
        setError(data.error ?? t("rules.nl.errorGeneric"));
        setWarnings(Array.isArray(data.warnings) ? data.warnings : []);
        return;
      }

      if (data.error) {
        setError(data.error);
      }
      setWarnings(Array.isArray(data.warnings) ? data.warnings : []);

      const generated = (data.rules ?? []).map((r) => {
        const rawCond = r.conditions as GeneratedRule["conditions"] | undefined;
        const items = Array.isArray(rawCond?.items) ? rawCond.items : [];
        const combinator =
          typeof rawCond?.combinator === "string" && rawCond.combinator.trim()
            ? rawCond.combinator
            : "AND";
        return {
        name: String(r.name ?? r.nameEn ?? "未命名规则"),
        nameEn: String(r.nameEn ?? r.name ?? ""),
        priority: Number(r.priority ?? 500),
        enabled: true,
        conditions: {
          combinator,
          items,
        },
        targetModel: String(r.targetModel ?? ""),
        fallbackChain: Array.isArray(r.fallbackChain)
          ? (r.fallbackChain as string[])
          : [],
        description: String(r.description ?? ""),
        descriptionEn: String(r.descriptionEn ?? r.description ?? ""),
        confidence: Number(r.confidence ?? 0.5),
        _selected: true,
      };
      });

      setRules(generated);
    } catch {
      setError(t("rules.nl.errorGeneric"));
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    const selected = rules
      .filter((r) => r._selected)
      .map((r) => {
        const { _selected, ...rest } = r;
        void _selected;
        return rest;
      });
    if (selected.length === 0) return;

    setSaving(true);
    try {
      await onSave(selected);
      setRules([]);
      setText("");
    } finally {
      setSaving(false);
    }
  }

  function toggleRule(index: number) {
    setRules((prev) =>
      prev.map((r, i) =>
        i === index ? { ...r, _selected: !r._selected } : r,
      ),
    );
  }

  const selectedCount = rules.filter((r) => r._selected).length;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("rules.nl.placeholder")}
          rows={4}
          className="w-full rounded-lg border bg-background px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              role="switch"
              checked={preciseMode}
              onChange={(e) => setPreciseMode(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <span title={t("rules.nl.preciseModeHint")}>
              {t("rules.nl.preciseMode")}
            </span>
          </label>
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={!text.trim() || loading}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading && (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            )}
            {t("rules.nl.generate")}
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">
          {t("rules.nl.examples")}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {exampleKeys.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setText(t(key))}
              className="rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
            >
              {t(key)}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <p>{error}</p>
          {!preciseMode && (
            <button
              type="button"
              onClick={() => void handleGenerate("structured")}
              disabled={loading || !text.trim()}
              className="rounded-md border border-amber-400 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
            >
              {t("rules.nl.retryPrecise")}
            </button>
          )}
        </div>
      )}

      {warnings.length > 0 && (
        <div
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100"
          role="status"
        >
          <p className="font-medium">{t("rules.nl.genWarnings")}</p>
          <ul className="mt-1 list-inside list-disc text-xs">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {rules.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">
              {t("rules.nl.generatedCount", { n: rules.length })}
            </h3>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={selectedCount === 0 || saving}
              className="flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {saving && (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              )}
              {t("rules.nl.saveSelected", { n: selectedCount })}
            </button>
          </div>

          {rules.map((rule, i) => {
            const bilingual: RuleBilingualFields = {
              name: rule.name,
              nameEn: rule.nameEn,
              description: rule.description,
              descriptionEn: rule.descriptionEn,
            };
            const title = pickRuleName(bilingual, locale);
            const desc = pickRuleDescription(bilingual, locale);
            return (
              <div
                key={i}
                className={`rounded-lg border p-4 transition-colors ${
                  rule._selected
                    ? "border-blue-200 bg-blue-50/50"
                    : "border-gray-200 bg-gray-50/50 opacity-60"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={rule._selected}
                      onChange={() => toggleRule(i)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{title}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${confidenceColor(rule.confidence)}`}
                        >
                          {confidenceLabel(rule.confidence, t)}{" "}
                          {Math.round(rule.confidence * 100)}%
                        </span>
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                          P{rule.priority}
                        </span>
                      </div>
                      {desc && (
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {desc}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-2 pl-7 text-sm">
                  <span className="rounded bg-blue-100 px-2 py-0.5 text-blue-700">
                    → {rule.targetModel}
                  </span>
                  {rule.fallbackChain.length > 0 && (
                    <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-600">
                      {t("rules.nl.fallback")}: {rule.fallbackChain.join(" → ")}
                    </span>
                  )}
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-500">
                    {rule.conditions.combinator}:{" "}
                    {t("rules.nl.conditionsCount", {
                      n: rule.conditions.items.length,
                    })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

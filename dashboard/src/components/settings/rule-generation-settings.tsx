// 系统设置 — 规则生成（NL/问卷）所用模型与温度（ISSUE-V3-12 / V3-17）
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n/context";

/** 与 `rule-generation-model.ts` 中默认值保持一致（客户端不可直引含 Prisma 的模块） */
const DEFAULT_RULE_GEN_UI_TEMPERATURE = 0.2;

type ProviderOpt = {
  id: string;
  name: string;
  enabled: boolean;
  models: Array<{ id: string; modelId: string; enabled: boolean }>;
};

export function RuleGenerationSettings() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [providers, setProviders] = useState<ProviderOpt[]>([]);
  const [useDefault, setUseDefault] = useState(true);
  const [providerName, setProviderName] = useState("");
  const [modelId, setModelId] = useState("");
  const [temperature, setTemperature] = useState(
    DEFAULT_RULE_GEN_UI_TEMPERATURE,
  );
  const [error, setError] = useState<string | null>(null);

  const enabledProviders = useMemo(
    () =>
      providers.filter(
        (p) => p.enabled && p.models.some((m) => m.enabled),
      ),
    [providers],
  );

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cfgRes, pRes] = await Promise.all([
        fetch("/api/settings/rule-generation-model"),
        fetch("/api/providers?includeModels=1"),
      ]);
      const plist = pRes.ok ? ((await pRes.json()) as ProviderOpt[]) : [];
      setProviders(plist);

      if (cfgRes.ok) {
        const cfg = (await cfgRes.json()) as {
          useDefault: boolean;
          targetModel: string | null;
          temperature?: number;
        };
        if (typeof cfg.temperature === "number" && cfg.temperature >= 0) {
          setTemperature(
            Math.min(2, Math.max(0, cfg.temperature)),
          );
        } else {
          setTemperature(DEFAULT_RULE_GEN_UI_TEMPERATURE);
        }
        if (
          !cfg.useDefault &&
          cfg.targetModel &&
          cfg.targetModel.includes("/")
        ) {
          const slash = cfg.targetModel.indexOf("/");
          const pn = cfg.targetModel.slice(0, slash);
          const mid = cfg.targetModel.slice(slash + 1);
          const prov = plist.find((p) => p.name === pn);
          const modelOk =
            prov?.enabled &&
            prov.models.some((m) => m.modelId === mid && m.enabled);
          if (modelOk) {
            setUseDefault(false);
            setProviderName(pn);
            setModelId(mid);
          } else {
            setUseDefault(true);
            setProviderName("");
            setModelId("");
            setError(t("settings.ruleGen.staleConfig"));
          }
        } else {
          setUseDefault(true);
          setProviderName("");
          setModelId("");
        }
      }
    } catch {
      setError(t("settings.error.exception"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const modelsForProvider = useMemo(() => {
    const p = providers.find((x) => x.name === providerName);
    if (!p) return [];
    return p.models.filter((m) => m.enabled);
  }, [providers, providerName]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const effectiveDefault = useDefault || !providerName || !modelId;
      const body: {
        useDefault: boolean;
        temperature: number;
        targetModel?: string;
      } = {
        useDefault: effectiveDefault,
        temperature,
      };
      if (!effectiveDefault) {
        body.targetModel = `${providerName}/${modelId}`;
      }
      const res = await fetch("/api/settings/rule-generation-model", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        const msg = err.error ?? t("settings.error.save");
        setError(msg);
        toast.error(msg);
        return;
      }
      await fetchAll();
      toast.success(t("common.saveSuccess"));
    } catch {
      setError(t("settings.error.exception"));
      toast.error(t("common.saveFail"));
    } finally {
      setSaving(false);
    }
  }

  function onUseDefaultChange(next: boolean) {
    setUseDefault(next);
    setError(null);
    if (!next && enabledProviders.length > 0) {
      const p = enabledProviders[0];
      setProviderName(p.name);
      const m = p.models.find((x) => x.enabled);
      setModelId(m?.modelId ?? "");
    }
  }

  function onProviderChange(name: string) {
    setProviderName(name);
    const p = providers.find((x) => x.name === name);
    const m = p?.models.find((x) => x.enabled);
    setModelId(m?.modelId ?? "");
  }

  return (
    <section className="rounded-xl border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-semibold">{t("settings.ruleGen.title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("settings.ruleGen.desc")}
      </p>
      <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
        {t("settings.ruleGen.latencyHint")}
      </p>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("settings.l3.loading")}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <fieldset className="space-y-2">
            <legend className="sr-only">{t("settings.ruleGen.title")}</legend>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="rule-gen-mode"
                className="h-4 w-4"
                checked={useDefault}
                onChange={() => onUseDefaultChange(true)}
              />
              <span>{t("settings.ruleGen.useDefault")}</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="rule-gen-mode"
                className="h-4 w-4"
                checked={!useDefault}
                onChange={() => onUseDefaultChange(false)}
                disabled={enabledProviders.length === 0}
              />
              <span>{t("settings.ruleGen.useCustom")}</span>
            </label>
          </fieldset>

          {!useDefault && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="rule-gen-provider"
                  className="block text-sm font-medium text-muted-foreground"
                >
                  {t("settings.ruleGen.provider")}
                </label>
                <select
                  id="rule-gen-provider"
                  value={providerName}
                  onChange={(e) => onProviderChange(e.target.value)}
                  className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
                >
                  {enabledProviders.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="rule-gen-model"
                  className="block text-sm font-medium text-muted-foreground"
                >
                  {t("settings.ruleGen.model")}
                </label>
                <select
                  id="rule-gen-model"
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                  className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
                >
                  {modelsForProvider.map((m) => (
                    <option key={m.id} value={m.modelId}>
                      {m.modelId}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="space-y-2 rounded-lg border border-border bg-muted/30 px-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label
                htmlFor="rule-gen-temperature"
                className="text-sm font-medium text-foreground"
              >
                {t("settings.ruleGen.temperature")}
              </label>
              <span className="font-mono text-sm tabular-nums text-muted-foreground">
                {temperature.toFixed(2)}
              </span>
            </div>
            <input
              id="rule-gen-temperature"
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={temperature}
              onChange={(e) =>
                setTemperature(Number.parseFloat(e.target.value))
              }
              className="w-full accent-primary"
              aria-valuemin={0}
              aria-valuemax={2}
              aria-valuenow={temperature}
            />
            <p className="text-xs text-muted-foreground">
              {t("settings.ruleGen.temperatureHint")}
            </p>
          </div>

          {enabledProviders.length === 0 ? (
            <p className="text-sm text-amber-600">
              {t("settings.ruleGen.noProvider")}
            </p>
          ) : null}

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || (!useDefault && (!providerName || !modelId))}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? t("settings.ruleGen.saving") : t("settings.ruleGen.save")}
          </button>
        </div>
      )}
    </section>
  );
}

// AI 问卷向导 — 5 步引导式创建路由规则
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { WizardStep } from "@/components/rules/wizard-step";
import { useI18n } from "@/lib/i18n/context";
import {
  pickRuleDescription,
  pickRuleName,
  type RuleBilingualFields,
} from "@/lib/rule-display";

interface ProviderData {
  id: string;
  name: string;
  enabled: boolean;
  models: Array<{
    id: string;
    modelId: string;
    alias: string | null;
    enabled: boolean;
  }>;
}

interface WizardAnswers {
  useCases: string[];
  prioritizeCost: boolean;
  prioritizeSpeed: boolean;
  providers: string[];
  preferredModels: string[];
  budget?: number;
}

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
  _selected: boolean;
}

const USE_CASE_VALUES = ["coding", "analysis", "creative", "chat", "translation", "math", "summarization"] as const;

export default function WizardPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [answers, setAnswers] = useState<WizardAnswers>({
    useCases: [],
    prioritizeCost: false,
    prioritizeSpeed: false,
    providers: [],
    preferredModels: [],
  });
  const [budget, setBudget] = useState("");
  const [providers, setProviders] = useState<ProviderData[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [generatedRules, setGeneratedRules] = useState<GeneratedRule[]>([]);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [genWarnings, setGenWarnings] = useState<string[]>([]);
  const [preciseMode, setPreciseMode] = useState(false);

  const { t, locale } = useI18n();

  const useCaseOptions = useMemo(() => USE_CASE_VALUES.map(v => ({
    value: v,
    label: t(`wizard.useCase.${v}`),
  })), [t]);

  const fetchProviders = useCallback(async () => {
    setLoadingProviders(true);
    try {
      const res = await fetch("/api/providers?includeModels=1");
      if (res.ok) {
        const data = (await res.json()) as ProviderData[];
        setProviders(
          data
            .filter((p) => p.enabled)
            .map((p) => ({ ...p, models: p.models ?? [] }))
        );
      }
    } finally {
      setLoadingProviders(false);
    }
  }, []);

  useEffect(() => {
    void fetchProviders();
  }, [fetchProviders]);

  function toggleUseCase(value: string) {
    setAnswers((prev) => ({
      ...prev,
      useCases: prev.useCases.includes(value)
        ? prev.useCases.filter((v) => v !== value)
        : [...prev.useCases, value],
    }));
  }

  function toggleProvider(name: string) {
    setAnswers((prev) => {
      const nextProviders = prev.providers.includes(name)
        ? prev.providers.filter((p) => p !== name)
        : [...prev.providers, name];
      const providerNames = new Set(nextProviders);
      const validModels = prev.preferredModels.filter((m) =>
        providers.some(
          (p) =>
            providerNames.has(p.name) &&
            (p.models ?? []).some((mod) => mod.modelId === m)
        )
      );
      return { ...prev, providers: nextProviders, preferredModels: validModels };
    });
  }

  function toggleModel(modelId: string) {
    setAnswers((prev) => ({
      ...prev,
      preferredModels: prev.preferredModels.includes(modelId)
        ? prev.preferredModels.filter((m) => m !== modelId)
        : [...prev.preferredModels, modelId],
    }));
  }

  async function generateRules(modeOverride?: "json" | "structured") {
    const mode = modeOverride ?? (preciseMode ? "structured" : "json");
    if (modeOverride === "structured") setPreciseMode(true);
    setGenerating(true);
    setError(null);
    setGenWarnings([]);
    const finalAnswers = {
      ...answers,
      budget: budget ? Number(budget) : undefined,
    };

    try {
      const res = await fetch("/api/rules/wizard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: finalAnswers, locale, mode }),
      });
      const data = (await res.json()) as {
        rules: Array<Record<string, unknown>>;
        error?: string;
        warnings?: string[];
      };

      if (!res.ok) {
        setError(data.error ?? t("wizard.error.generate"));
        setGenWarnings(Array.isArray(data.warnings) ? data.warnings : []);
        setGeneratedRules([]);
        return;
      }

      if (data.error) setError(data.error);
      setGenWarnings(Array.isArray(data.warnings) ? data.warnings : []);

      setGeneratedRules(
        (data.rules ?? []).map((r) => {
          const rawCond = r.conditions as GeneratedRule["conditions"] | undefined;
          const items = Array.isArray(rawCond?.items) ? rawCond.items : [];
          const combinator =
            typeof rawCond?.combinator === "string" && rawCond.combinator.trim()
              ? rawCond.combinator
              : "AND";
          return {
          name: String(r.name ?? r.nameEn ?? t("wizard.unnamed")),
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
          _selected: true,
        };
        })
      );
    } catch {
      setError(t("wizard.error.generate"));
    } finally {
      setGenerating(false);
    }
  }

  async function handleConfirm() {
    const selected = generatedRules.filter((r) => r._selected);
    if (selected.length === 0) return;

    setSaving(true);
    try {
      for (const rule of selected) {
        const { _selected, ...ruleData } = rule;
        void _selected;
        await fetch("/api/rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(ruleData),
        });
      }
      router.push("/dashboard/rules");
    } catch {
      setError(t("wizard.error.save"));
    } finally {
      setSaving(false);
    }
  }

  function handleNext() {
    if (step === 4) {
      setStep(5);
      void generateRules();
    } else {
      setStep((s) => Math.min(s + 1, 5));
    }
  }

  const selectedProviders = providers.filter((p) =>
    answers.providers.includes(p.name)
  );
  const availableModels = selectedProviders.flatMap((p) =>
    (p.models ?? [])
      .filter((m) => m.enabled)
      .map((m) => ({ ...m, provider: p.name }))
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("wizard.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("wizard.subtitle")}
          </p>
        </div>
        <Link
          href="/dashboard/rules"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {t("wizard.back")}
        </Link>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        {/* 步骤 1: 使用场景 */}
        {step === 1 && (
          <WizardStep
            title={t("wizard.step1.title")}
            description={t("wizard.step1.desc")}
            stepNumber={1}
            totalSteps={5}
            onNext={handleNext}
            nextDisabled={answers.useCases.length === 0}
          >
            <div className="grid grid-cols-2 gap-3">
              {useCaseOptions.map((option) => {
                const checked = answers.useCases.includes(option.value);
                return (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors ${
                      checked
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleUseCase(option.value)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <span className={`text-sm font-medium ${checked ? "text-blue-700" : ""}`}>
                      {option.label}
                    </span>
                  </label>
                );
              })}
            </div>
          </WizardStep>
        )}

        {/* 步骤 2: 优先级 */}
        {step === 2 && (
          <WizardStep
            title={t("wizard.step2.title")}
            description={t("wizard.step2.desc")}
            stepNumber={2}
            totalSteps={5}
            onPrev={() => setStep(1)}
            onNext={handleNext}
          >
            <div className="space-y-4">
              {[
                {
                  key: "prioritizeCost" as const,
                  label: t("wizard.step2.costLabel"),
                  desc: t("wizard.step2.costDesc"),
                },
                {
                  key: "prioritizeSpeed" as const,
                  label: t("wizard.step2.speedLabel"),
                  desc: t("wizard.step2.speedDesc"),
                },
              ].map(({ key, label, desc }) => (
                <label
                  key={key}
                  className={`flex cursor-pointer items-start gap-4 rounded-lg border p-4 transition-colors ${
                    answers[key]
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={answers[key]}
                    onChange={(e) =>
                      setAnswers((prev) => ({ ...prev, [key]: e.target.checked }))
                    }
                    className="mt-0.5 h-4 w-4 rounded border-gray-300"
                  />
                  <div>
                    <p className="font-medium">{label}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {desc}
                    </p>
                  </div>
                </label>
              ))}
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <p
                  className="text-sm text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: t("wizard.step2.defaultHint") }}
                />
              </div>
            </div>
          </WizardStep>
        )}

        {/* 步骤 3: 选择 Provider 和模型 */}
        {step === 3 && (
          <WizardStep
            title={t("wizard.step3.title")}
            description={t("wizard.step3.desc")}
            stepNumber={3}
            totalSteps={5}
            onPrev={() => setStep(2)}
            onNext={handleNext}
            nextDisabled={answers.providers.length === 0}
          >
            {loadingProviders ? (
              <div className="flex h-32 items-center justify-center text-muted-foreground">
                {t("wizard.step3.loading")}
              </div>
            ) : providers.length === 0 ? (
              <div className="flex h-32 flex-col items-center justify-center rounded-lg border-2 border-dashed text-muted-foreground">
                <p>{t("wizard.step3.empty")}</p>
                <Link
                  href="/dashboard/providers"
                  className="mt-1 text-sm text-blue-600 hover:underline"
                >
                  {t("wizard.step3.goConfig")}
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t("wizard.step3.selectProvider")}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {providers.map((p) => {
                      const checked = answers.providers.includes(p.name);
                      return (
                        <label
                          key={p.id}
                          className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                            checked
                              ? "border-blue-500 bg-blue-50"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleProvider(p.name)}
                            className="h-4 w-4 rounded border-gray-300"
                          />
                          <div>
                            <span className="text-sm font-medium">{p.name}</span>
                            <span className="ml-1 text-xs text-muted-foreground">
                              (
                              {(p.models ?? []).filter((m) => m.enabled).length}{" "}
                              {t("wizard.step3.models")})
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {availableModels.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">
                      {t("wizard.step3.selectModel")}
                      <span className="ml-1 font-normal text-muted-foreground">
                        {t("wizard.step3.modelOptional")}
                      </span>
                    </p>
                    <div className="max-h-48 space-y-1.5 overflow-y-auto">
                      {availableModels.map((m) => {
                        const checked = answers.preferredModels.includes(m.modelId);
                        return (
                          <label
                            key={m.id}
                            className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 transition-colors ${
                              checked
                                ? "border-blue-400 bg-blue-50"
                                : "border-gray-200 hover:bg-gray-50"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleModel(m.modelId)}
                              className="h-3.5 w-3.5 rounded border-gray-300"
                            />
                            <span className="text-sm">
                              {m.alias ?? m.modelId}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {m.provider}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </WizardStep>
        )}

        {/* 步骤 4: 预算 */}
        {step === 4 && (
          <WizardStep
            title={t("wizard.step4.title")}
            description={t("wizard.step4.desc")}
            stepNumber={4}
            totalSteps={5}
            onPrev={() => setStep(3)}
            onNext={handleNext}
            nextLabel={t("wizard.step4.nextLabel")}
          >
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">
                  {t("wizard.step4.budgetLabel")}
                </label>
                <div className="relative mt-1.5">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    $
                  </span>
                  <input
                    type="number"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    placeholder={t("wizard.step4.budgetPh")}
                    min={0}
                    step={1}
                    className="w-full rounded-lg border bg-background py-2.5 pl-7 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {t("wizard.step4.budgetHint")}
                </p>
              </div>

              <div className="rounded-lg border bg-gray-50 p-4">
                <h3 className="text-sm font-medium">{t("wizard.step4.summary")}</h3>
                <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                  <p>
                    {t("wizard.step4.useCases")}{" "}
                    {answers.useCases.length > 0
                      ? answers.useCases.join("、")
                      : t("wizard.step4.none")}
                  </p>
                  <p>
                    {t("wizard.step4.strategy")}{" "}
                    {answers.prioritizeCost
                      ? t("wizard.step4.stratCost")
                      : answers.prioritizeSpeed
                        ? t("wizard.step4.stratSpeed")
                        : t("wizard.step4.stratQuality")}
                  </p>
                  <p>Provider: {answers.providers.join("、")}</p>
                  {answers.preferredModels.length > 0 && (
                    <p>{t("wizard.step4.preferModels")} {answers.preferredModels.join("、")}</p>
                  )}
                </div>
              </div>
            </div>
          </WizardStep>
        )}

        {/* 步骤 5: 预览与确认 */}
        {step === 5 && (
          <WizardStep
            title={t("wizard.step5.title")}
            description={t("wizard.step5.desc")}
            stepNumber={5}
            totalSteps={5}
            onPrev={() => setStep(4)}
            isLoading={generating || saving}
          >
            {generating ? (
              <div className="flex h-48 flex-col items-center justify-center gap-3 text-muted-foreground">
                <span className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
                <p>{t("wizard.step5.generating")}</p>
              </div>
            ) : (
              <div className="space-y-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={preciseMode}
                    onChange={(e) => setPreciseMode(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span title={t("wizard.preciseModeHint")}>
                    {t("wizard.preciseMode")}
                  </span>
                </label>

                {error && (
                  <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                    <p>⚠️ {error}</p>
                    {!preciseMode && (
                      <button
                        type="button"
                        onClick={() => void generateRules("structured")}
                        disabled={generating}
                        className="rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50 dark:bg-amber-950/30 dark:text-amber-100"
                      >
                        {t("wizard.retryPrecise")}
                      </button>
                    )}
                  </div>
                )}

                {genWarnings.length > 0 && (
                  <div
                    className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100"
                    role="status"
                  >
                    <p className="font-medium">{t("wizard.step5.warnings")}</p>
                    <ul className="mt-1 list-inside list-disc text-xs">
                      {genWarnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {generatedRules.length === 0 && !error ? (
                  <div className="flex h-32 flex-col items-center justify-center rounded-lg border-2 border-dashed text-muted-foreground">
                    <p>{t("wizard.step5.empty")}</p>
                    <button
                      onClick={() => void generateRules()}
                      className="mt-2 text-sm text-blue-600 hover:underline"
                    >
                      {t("wizard.step5.regenerate")}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      {generatedRules.map((rule, i) => {
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
                              : "border-gray-200 opacity-60"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={rule._selected}
                              onChange={() =>
                                setGeneratedRules((prev) =>
                                  prev.map((r, j) =>
                                    i === j
                                      ? { ...r, _selected: !r._selected }
                                      : r
                                  )
                                )
                              }
                              className="mt-0.5 h-4 w-4 rounded border-gray-300"
                            />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">
                                  {title}
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
                              <div className="mt-2 flex flex-wrap gap-2 text-sm">
                                <span className="rounded bg-blue-100 px-2 py-0.5 text-blue-700">
                                  → {rule.targetModel}
                                </span>
                                {rule.fallbackChain.length > 0 && (
                                  <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-600">
                                    {t("wizard.step5.fallback")} {rule.fallbackChain.join(" → ")}
                                  </span>
                                )}
                                <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-500">
                                  {rule.conditions.combinator}:{" "}
                                  {t("wizard.step5.conditions", { n: rule.conditions.items.length })}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                      })}
                    </div>

                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => void generateRules()}
                        className="text-sm text-muted-foreground hover:text-foreground"
                      >
                        {t("wizard.step5.regenerate")}
                      </button>
                      <button
                        onClick={() => void handleConfirm()}
                        disabled={
                          saving ||
                          generatedRules.filter((r) => r._selected)
                            .length === 0
                        }
                        className="flex items-center gap-2 rounded-md bg-green-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        {saving && (
                          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        )}
                        {t("wizard.step5.confirm")}{" "}
                        ({generatedRules.filter((r) => r._selected).length})
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </WizardStep>
        )}
      </div>
    </div>
  );
}

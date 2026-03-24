// 规则表单 — 创建/编辑规则的完整表单（react-hook-form + zod）；支持中英文名称与描述
"use client";

import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ruleSchema, type RuleFormData } from "@/lib/schemas/rule";
import { ConditionsBuilder } from "./conditions-builder";
import type { RuleRecord } from "./rule-card";
import { useEffect } from "react";
import { useI18n } from "@/lib/i18n/context";

interface RuleFormProps {
  initialData?: RuleRecord | null;
  onSubmit: (data: RuleFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

function ruleRecordToFormData(rule: RuleRecord): RuleFormData {
  return {
    name: rule.name,
    nameEn: rule.nameEn ?? undefined,
    priority: rule.priority,
    enabled: rule.enabled,
    conditions: rule.conditions,
    targetModel: rule.targetModel,
    fallbackChain: rule.fallbackChain,
    description: rule.description ?? undefined,
    descriptionEn: rule.descriptionEn ?? undefined,
  };
}

const DEFAULT_VALUES: RuleFormData = {
  name: "",
  nameEn: "",
  priority: 500,
  enabled: true,
  conditions: { combinator: "AND", items: [{ type: "keywords", keywords: [] }] },
  targetModel: "",
  fallbackChain: [],
  description: "",
  descriptionEn: "",
};

export function RuleForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: RuleFormProps) {
  const { t } = useI18n();
  const methods = useForm<RuleFormData>({
    resolver: zodResolver(ruleSchema),
    defaultValues: initialData
      ? ruleRecordToFormData(initialData)
      : DEFAULT_VALUES,
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = methods;

  useEffect(() => {
    reset(initialData ? ruleRecordToFormData(initialData) : DEFAULT_VALUES);
  }, [initialData, reset]);

  const fallbackChain = watch("fallbackChain");
  const priority = watch("priority");

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("rule.form.nameZh")}</label>
            <input
              {...register("name")}
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder={t("rule.form.namePh")}
            />
            {errors.name && (
              <p className="text-xs text-red-500">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("rule.form.targetModel")}</label>
            <input
              {...register("targetModel")}
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder={t("rule.form.targetPh")}
            />
            {errors.targetModel && (
              <p className="text-xs text-red-500">
                {errors.targetModel.message}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t("rule.form.nameEn")}</label>
          <p className="text-xs text-muted-foreground">{t("rule.form.nameEnHint")}</p>
          <input
            {...register("nameEn")}
            className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder={t("rule.form.nameEnPh")}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            {t("rule.form.priority", { n: priority })}
          </label>
          <input
            type="range"
            min={0}
            max={1000}
            step={10}
            {...register("priority", { valueAsNumber: true })}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{t("rule.form.priorityLow")}</span>
            <span>{t("rule.form.priorityMid")}</span>
            <span>{t("rule.form.priorityHigh")}</span>
          </div>
        </div>

        <label className="flex items-center gap-2">
          <input type="checkbox" {...register("enabled")} className="h-4 w-4" />
          <span className="text-sm font-medium">{t("rule.form.enabled")}</span>
        </label>

        <div className="space-y-2">
          <h4 className="text-sm font-medium">{t("rule.form.conditions")}</h4>
          <ConditionsBuilder />
          {errors.conditions?.items && (
            <p className="text-xs text-red-500">{t("rule.form.conditionsMin")}</p>
          )}
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-medium">{t("rule.form.fallbackTitle")}</h4>
          {(fallbackChain ?? []).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                {...register(`fallbackChain.${i}`)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder={t("rule.form.fallbackPh", { n: i + 1 })}
              />
              <button
                type="button"
                onClick={() => {
                  const chain = [...(fallbackChain ?? [])];
                  chain.splice(i, 1);
                  setValue("fallbackChain", chain);
                }}
                className="text-sm text-red-500 hover:text-red-700"
              >
                {t("rule.form.remove")}
              </button>
            </div>
          ))}
          {(fallbackChain ?? []).length < 3 && (
            <button
              type="button"
              onClick={() =>
                setValue("fallbackChain", [...(fallbackChain ?? []), ""])
              }
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              {t("rule.form.addFallback")}
            </button>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-1">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("rule.form.descZh")}</label>
            <textarea
              {...register("description")}
              rows={2}
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder={t("rule.form.descZhPh")}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("rule.form.descEn")}</label>
            <textarea
              {...register("descriptionEn")}
              rows={2}
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder={t("rule.form.descEnPh")}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {t("rule.form.cancel")}
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting
              ? t("rule.form.saving")
              : initialData
                ? t("rule.form.update")
                : t("rule.form.create")}
          </button>
        </div>
      </form>
    </FormProvider>
  );
}

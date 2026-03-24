"use client";
// Provider 创建/编辑表单 — react-hook-form + zod 校验；文案随控制台语言切换
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useMemo } from "react";
import { useI18n } from "@/lib/i18n/context";

export type ProviderFormValues = {
  name: string;
  baseUrl: string;
  apiKey?: string;
  apiType: "openai" | "anthropic" | "openai-compatible";
  enabled: boolean;
};

interface ProviderFormProps {
  defaultValues?: Partial<ProviderFormValues>;
  isEdit?: boolean;
  onSubmit: (data: ProviderFormValues) => Promise<void>;
  onCancel: () => void;
  submitting?: boolean;
}

const API_TYPE_OPTIONS = [
  { value: "openai", labelKey: "OpenAI" as const },
  { value: "anthropic", labelKey: "Anthropic" as const },
  { value: "openai-compatible", labelKey: "OpenAI Compatible" as const },
] as const;

export function ProviderForm({
  defaultValues,
  isEdit = false,
  onSubmit,
  onCancel,
  submitting = false,
}: ProviderFormProps) {
  const { t } = useI18n();

  const schema = useMemo(() => {
    const base = z.object({
      name: z
        .string()
        .min(1, t("providers.validation.nameRequired"))
        .max(100, t("providers.validation.nameTooLong")),
      baseUrl: z.string().url(t("providers.validation.url")),
      apiKey: z.string().optional(),
      apiType: z.enum(["openai", "anthropic", "openai-compatible"]),
      enabled: z.boolean(),
    });
    return isEdit
      ? base
      : base.extend({
          apiKey: z.string().min(1, t("providers.validation.apiKeyCreate")),
        });
  }, [isEdit, t]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProviderFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      baseUrl: "",
      apiKey: "",
      apiType: "openai-compatible",
      enabled: true,
      ...defaultValues,
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <FormField label={t("providers.form.name")} error={errors.name?.message}>
        <input
          {...register("name")}
          className={cn(fieldClasses, errors.name && "border-destructive")}
          placeholder={t("providers.form.namePh")}
          autoFocus
        />
      </FormField>

      <FormField label={t("providers.form.baseUrl")} error={errors.baseUrl?.message}>
        <input
          {...register("baseUrl")}
          className={cn(fieldClasses, errors.baseUrl && "border-destructive")}
          placeholder="https://api.openai.com/v1"
        />
      </FormField>

      <FormField
        label={isEdit ? t("providers.form.apiKeyEditHint") : t("providers.form.apiKey")}
        error={errors.apiKey?.message}
      >
        <input
          {...register("apiKey")}
          type="password"
          className={cn(fieldClasses, errors.apiKey && "border-destructive")}
          placeholder={isEdit ? "••••••••" : "sk-..."}
        />
      </FormField>

      <FormField label={t("providers.form.apiType")} error={errors.apiType?.message}>
        <select
          {...register("apiType")}
          className={cn(fieldClasses, "appearance-none")}
        >
          {API_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.labelKey}
            </option>
          ))}
        </select>
      </FormField>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          {...register("enabled")}
          className="h-4 w-4 rounded border-border"
        />
        <span>{t("providers.form.enabled")}</span>
      </label>

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          {t("providers.form.cancel")}
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isEdit ? t("providers.form.save") : t("providers.form.create")}
        </button>
      </div>
    </form>
  );
}

const fieldClasses =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-ring transition-shadow focus:ring-2 focus:ring-offset-1";

function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

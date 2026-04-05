"use client";
// Provider 下模型列表、新增、编辑、删除 — react-hook-form + zod
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CloudDownload, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";
import { inferFeatureHints, inferThinkingHint } from "@/lib/model-feature-hints";

export interface UpstreamModel {
  id: string;
  owned_by?: string;
  created?: number;
}

export interface ProviderModelRow {
  id: string;
  modelId: string;
  alias: string | null;
  contextWindow: number;
  inputCost: number;
  outputCost: number;
  enabled: boolean;
  supportsThinking: boolean;
  defaultThinking: { enabled?: boolean; budget_tokens?: number | null };
  features: string[];
}

interface ModelFormValues {
  modelId: string;
  alias?: string;
  contextWindow: number;
  inputCost: number;
  outputCost: number;
  enabled: boolean;
  supportsThinking: boolean;
  thinkingBudgetTokens: number | null;
  supportsVision: boolean;
  supportsAudio: boolean;
  supportsImageGeneration: boolean;
}

interface ModelsManageDialogProps {
  open: boolean;
  providerId: string;
  providerName: string;
  onClose: () => void;
  onChanged: () => void;
  onToast: (message: string, type: "success" | "error") => void;
}

const fieldClasses =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ModelsManageDialog({
  open,
  providerId,
  providerName,
  onClose,
  onChanged,
  onToast,
}: ModelsManageDialogProps) {
  const { t } = useI18n();
  const [models, setModels] = useState<ProviderModelRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [upstreamModels, setUpstreamModels] = useState<UpstreamModel[] | null>(null);
  const [upstreamLoading, setUpstreamLoading] = useState(false);
  const [upstreamError, setUpstreamError] = useState<string | null>(null);
  const [upstreamHint, setUpstreamHint] = useState<string | null>(null);
  const [selectedUpstreamIds, setSelectedUpstreamIds] = useState<Set<string>>(new Set());
  const [upstreamFilter, setUpstreamFilter] = useState("");
  const [batchAdding, setBatchAdding] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });

  const modelSchema = useMemo(
    () =>
      z.object({
        modelId: z
          .string()
          .min(1, t("models.validation.modelIdRequired"))
          .max(200),
        alias: z.string().max(200).optional(),
        contextWindow: z.coerce.number().int().min(1).default(128000),
        inputCost: z.coerce.number().min(0).default(0),
        outputCost: z.coerce.number().min(0).default(0),
        enabled: z.boolean().default(true),
        supportsThinking: z.boolean().default(false),
        thinkingBudgetTokens: z.coerce.number().int().positive().nullable().default(null),
        supportsVision: z.boolean().default(false),
        supportsAudio: z.boolean().default(false),
        supportsImageGeneration: z.boolean().default(false),
      }),
    [t],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/providers/${providerId}/models`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as ProviderModelRow[];
      setModels(data);
    } catch {
      onToast(t("models.toast.loadFail"), "error");
    } finally {
      setLoading(false);
    }
  }, [providerId, onToast, t]);

  useEffect(() => {
    if (open && providerId) void load();
  }, [open, providerId, load]);

  useEffect(() => {
    if (!open) return;
    setUpstreamModels(null);
    setUpstreamError(null);
    setUpstreamHint(null);
    setSelectedUpstreamIds(new Set());
    setUpstreamFilter("");
    setBatchAdding(false);
  }, [open, providerId]);

  const existingModelIds = useMemo(
    () => new Set(models.map((m) => m.modelId)),
    [models],
  );

  const filteredUpstream = useMemo(() => {
    if (!upstreamModels) return [];
    const q = upstreamFilter.trim().toLowerCase();
    return upstreamModels.filter(
      (m) => !q || m.id.toLowerCase().includes(q) || (m.owned_by?.toLowerCase().includes(q) ?? false),
    );
  }, [upstreamModels, upstreamFilter]);

  // Clear selection when upstream models change
  useEffect(() => {
    setSelectedUpstreamIds(new Set());
  }, [upstreamModels]);

  const fetchUpstreamModels = useCallback(async () => {
    setUpstreamLoading(true);
    setUpstreamError(null);
    setUpstreamHint(null);
    try {
      const res = await fetch(
        `/api/providers/${providerId}/upstream-models`,
      );
      const data = (await res.json()) as {
        models?: UpstreamModel[];
        error?: string;
        hint?: string;
      };
      if (!res.ok) {
        if (res.status === 429) {
          setUpstreamError(t("models.upstream.rateLimited"));
        } else {
          setUpstreamError(data.error ?? t("models.upstream.fetchFail"));
        }
        setUpstreamModels([]);
        return;
      }
      const list = data.models ?? [];
      setUpstreamModels(list);
      setUpstreamHint(data.hint ?? null);
    } catch {
      setUpstreamError(t("models.upstream.netError"));
      setUpstreamModels([]);
    } finally {
      setUpstreamLoading(false);
    }
  }, [providerId, t]);

  const toggleUpstream = (id: string) => {
    setSelectedUpstreamIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const availableUpstream = useMemo(
    () => filteredUpstream.filter((m) => !existingModelIds.has(m.id)),
    [filteredUpstream, existingModelIds],
  );

  const selectAllAvailable = () => {
    setSelectedUpstreamIds(new Set(availableUpstream.map((m) => m.id)));
  };

  const deselectAll = () => setSelectedUpstreamIds(new Set());

  const addSelectedFromUpstream = async () => {
    const ids = [...selectedUpstreamIds].filter((id) => !existingModelIds.has(id));
    if (ids.length === 0) return;
    setBatchAdding(true);
    setBatchProgress({ current: 0, total: ids.length });
    let ok = 0;
    let fail = 0;
    for (const modelId of ids) {
      setBatchProgress((p) => ({ ...p, current: p.current + 1 }));
      const features = inferFeatureHints(modelId);
      const supportsThinking = inferThinkingHint(modelId);
      try {
        const res = await fetch(`/api/providers/${providerId}/models`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modelId,
            alias: null,
            contextWindow: 128000,
            inputCost: 0,
            outputCost: 0,
            enabled: true,
            supportsThinking,
            defaultThinking: { enabled: supportsThinking, budget_tokens: null },
            features,
          }),
        });
        if (!res.ok) throw new Error();
        ok++;
      } catch {
        fail++;
      }
    }
    await load();
    onChanged();
    if (ok > 0) onToast(t("models.upstream.batchDone", { ok }), "success");
    if (fail > 0) onToast(t("models.upstream.batchFail", { fail }), "error");
    setSelectedUpstreamIds(new Set());
    setBatchAdding(false);
  };

  const addForm = useForm<ModelFormValues>({
    resolver: zodResolver(modelSchema),
    defaultValues: {
      modelId: "",
      alias: "",
      contextWindow: 128000,
      inputCost: 0,
      outputCost: 0,
      enabled: true,
      supportsThinking: false,
      thinkingBudgetTokens: null,
      supportsVision: false,
      supportsAudio: false,
      supportsImageGeneration: false,
    },
  });

  const editForm = useForm<ModelFormValues>({
    resolver: zodResolver(modelSchema),
  });

  const startEdit = (m: ProviderModelRow) => {
    setEditingId(m.id);
    editForm.reset({
      modelId: m.modelId,
      alias: m.alias ?? "",
      contextWindow: m.contextWindow,
      inputCost: m.inputCost,
      outputCost: m.outputCost,
      enabled: m.enabled,
      supportsThinking: m.supportsThinking,
      thinkingBudgetTokens: m.defaultThinking?.budget_tokens ?? null,
      supportsVision: (m.features ?? []).includes("vision"),
      supportsAudio: (m.features ?? []).includes("audio"),
      supportsImageGeneration: (m.features ?? []).includes("image-generation"),
    });
  };

  const onAdd = addForm.handleSubmit(async (values) => {
    const features: string[] = [];
    if (values.supportsVision) features.push("vision");
    if (values.supportsAudio) features.push("audio");
    if (values.supportsImageGeneration) features.push("image-generation");
    try {
      const res = await fetch(`/api/providers/${providerId}/models`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: values.modelId,
          alias: values.alias || null,
          contextWindow: values.contextWindow,
          inputCost: values.inputCost,
          outputCost: values.outputCost,
          enabled: values.enabled,
          supportsThinking: values.supportsThinking,
          defaultThinking: {
            enabled: values.supportsThinking,
            budget_tokens: values.supportsThinking ? (values.thinkingBudgetTokens || null) : null,
          },
          features,
        }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? t("models.toast.addFail"));
      }
      addForm.reset();
      onToast(t("models.toast.addOk"), "success");
      await load();
      onChanged();
    } catch (e) {
      onToast(
        e instanceof Error ? e.message : t("models.toast.addFail"),
        "error",
      );
    }
  });

  const onUpdate = editForm.handleSubmit(async (values) => {
    if (!editingId) return;
    const features: string[] = [];
    if (values.supportsVision) features.push("vision");
    if (values.supportsAudio) features.push("audio");
    if (values.supportsImageGeneration) features.push("image-generation");
    try {
      const res = await fetch(`/api/models/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: values.modelId,
          alias: values.alias || null,
          contextWindow: values.contextWindow,
          inputCost: values.inputCost,
          outputCost: values.outputCost,
          enabled: values.enabled,
          supportsThinking: values.supportsThinking,
          defaultThinking: {
            enabled: values.supportsThinking,
            budget_tokens: values.supportsThinking ? (values.thinkingBudgetTokens || null) : null,
          },
          features,
        }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? t("models.toast.updateFail"));
      }
      setEditingId(null);
      onToast(t("models.toast.updateOk"), "success");
      await load();
      onChanged();
    } catch (e) {
      onToast(
        e instanceof Error ? e.message : t("models.toast.updateFail"),
        "error",
      );
    }
  });

  const handleDelete = async (id: string, modelId: string) => {
    if (!confirm(t("models.confirm.delete", { id: modelId }))) return;
    try {
      const res = await fetch(`/api/models/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      if (editingId === id) setEditingId(null);
      onToast(t("models.toast.deleteOk"), "success");
      await load();
      onChanged();
    } catch {
      onToast(t("models.toast.deleteFail"), "error");
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-background shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">{t("models.title")}</h2>
            <p className="text-sm text-muted-foreground">{providerName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted"
            aria-label={t("models.close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <div className="mb-4 rounded-lg border border-border bg-muted/30 p-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-medium">
              <CloudDownload className="h-4 w-4" />
              {t("models.upstream.title")}
            </p>
            <p className="mb-3 text-xs text-muted-foreground">
              {t("models.upstream.desc")}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void fetchUpstreamModels()}
                disabled={upstreamLoading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                {upstreamLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CloudDownload className="h-4 w-4" />
                )}
                {t("models.upstream.fetch")}
              </button>
              {upstreamModels !== null && upstreamModels.length > 0 && (
                <>
                  <input
                    type="search"
                    placeholder={t("models.upstream.filter")}
                    value={upstreamFilter}
                    onChange={(e) => setUpstreamFilter(e.target.value)}
                    className={cn(fieldClasses, "max-w-[280px]")}
                    aria-label={t("models.upstream.filter")}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={selectAllAvailable}
                      disabled={batchAdding}
                      className="text-xs text-primary hover:underline disabled:opacity-50"
                    >
                      {t("models.upstream.selectAll")}
                    </button>
                    <button
                      type="button"
                      onClick={deselectAll}
                      disabled={batchAdding}
                      className="text-xs text-muted-foreground hover:underline disabled:opacity-50"
                    >
                      {t("models.upstream.deselectAll")}
                    </button>
                  </div>
                </>
              )}
            </div>
            {upstreamModels !== null && upstreamModels.length > 0 && (
              <>
                <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-border bg-background">
                  {filteredUpstream.map((m) => {
                    const isExisting = existingModelIds.has(m.id);
                    const isSelected = selectedUpstreamIds.has(m.id);
                    return (
                      <label
                        key={m.id}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 border-b border-border px-3 py-1.5 text-sm last:border-0 hover:bg-muted/50",
                          isExisting && "cursor-default opacity-50",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={isExisting || batchAdding}
                          onChange={() => toggleUpstream(m.id)}
                          className="h-4 w-4 rounded border-input"
                        />
                        <span className="font-mono text-xs">{m.id}</span>
                        {m.owned_by && (
                          <span className="text-xs text-muted-foreground">
                            ({m.owned_by})
                          </span>
                        )}
                        {isExisting && (
                          <span className="text-xs text-muted-foreground">
                            {t("models.upstream.alreadyAdded")}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void addSelectedFromUpstream()}
                    disabled={selectedUpstreamIds.size === 0 || batchAdding}
                    className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {batchAdding
                      ? t("models.upstream.adding", {
                          current: batchProgress.current,
                          total: batchProgress.total,
                        })
                      : t("models.upstream.addN", { n: selectedUpstreamIds.size })}
                  </button>
                </div>
              </>
            )}
            {upstreamError && (
              <p className="mt-2 text-sm text-destructive" role="alert">
                {upstreamError}
              </p>
            )}
            {upstreamHint && (
              <p
                className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100"
                role="status"
              >
                {upstreamHint}
              </p>
            )}
            {upstreamModels !== null &&
              upstreamModels.length === 0 &&
              !upstreamError &&
              !upstreamHint && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("models.upstream.empty")}
                </p>
              )}
          </div>

          <div className="mb-4 rounded-lg border border-border bg-muted/30 p-4">
            <p className="mb-3 flex items-center gap-2 text-sm font-medium">
              <Plus className="h-4 w-4" />
              {t("models.manual.title")}
            </p>
            <form onSubmit={onAdd} className="grid gap-3 sm:grid-cols-2">
              <Field
                label="modelId"
                error={addForm.formState.errors.modelId?.message}
              >
                <input
                  {...addForm.register("modelId")}
                  className={cn(
                    fieldClasses,
                    addForm.formState.errors.modelId && "border-destructive",
                  )}
                  placeholder="gpt-4o-mini"
                />
              </Field>
              <Field
                label={t("models.manual.alias")}
                error={addForm.formState.errors.alias?.message}
              >
                <input
                  {...addForm.register("alias")}
                  className={fieldClasses}
                  placeholder={t("models.manual.aliasPh")}
                />
              </Field>
              <Field
                label={t("models.manual.context")}
                error={addForm.formState.errors.contextWindow?.message}
              >
                <input
                  type="number"
                  {...addForm.register("contextWindow")}
                  className={fieldClasses}
                />
              </Field>
              <Field
                label={t("models.manual.inputCost")}
                error={addForm.formState.errors.inputCost?.message}
              >
                <input
                  type="number"
                  step="any"
                  min={0}
                  {...addForm.register("inputCost")}
                  className={cn(
                    fieldClasses,
                    addForm.formState.errors.inputCost && "border-destructive",
                  )}
                  placeholder="0"
                />
              </Field>
              <Field
                label={t("models.manual.outputCost")}
                error={addForm.formState.errors.outputCost?.message}
              >
                <input
                  type="number"
                  step="any"
                  min={0}
                  {...addForm.register("outputCost")}
                  className={cn(
                    fieldClasses,
                    addForm.formState.errors.outputCost && "border-destructive",
                  )}
                  placeholder="0"
                />
              </Field>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                {t("models.manual.costHint")}
              </p>
              <div className="flex flex-wrap items-end gap-4 sm:col-span-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    {...addForm.register("enabled")}
                    className="h-4 w-4 rounded border-input"
                  />
                  {t("models.manual.enabled")}
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    {...addForm.register("supportsThinking")}
                    className="h-4 w-4 rounded border-input"
                  />
                  {t("models.manual.supportsThinking")}
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    {...addForm.register("supportsVision")}
                    className="h-4 w-4 rounded border-input"
                  />
                  {t("models.manual.supportsVision")}
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    {...addForm.register("supportsAudio")}
                    className="h-4 w-4 rounded border-input"
                  />
                  {t("models.manual.supportsAudio")}
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    {...addForm.register("supportsImageGeneration")}
                    className="h-4 w-4 rounded border-input"
                  />
                  {t("models.manual.supportsImageGen")}
                </label>
              </div>
              {addForm.watch("supportsThinking") && (
                <Field
                  label={t("models.manual.thinkingBudget")}
                  error={addForm.formState.errors.thinkingBudgetTokens?.message}
                >
                  <input
                    type="number"
                    {...addForm.register("thinkingBudgetTokens")}
                    className={fieldClasses}
                    placeholder="8192"
                  />
                </Field>
              )}
              <div className="flex items-end sm:col-span-2">
                <button
                  type="submit"
                  className="ml-auto inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  {t("models.manual.add")}
                </button>
              </div>
            </form>
          </div>

          {loading ? (
            <div className="flex justify-center py-12 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : models.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("models.empty")}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-3 py-2 text-left font-medium">modelId</th>
                    <th className="px-3 py-2 text-left font-medium">
                      {t("models.col.alias")}
                    </th>
                    <th className="px-3 py-2 text-center font-medium">
                      {t("models.col.context")}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      {t("models.col.inputCost")}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      {t("models.col.outputCost")}
                    </th>
                    <th className="px-3 py-2 text-center font-medium">
                      {t("models.col.thinking")}
                    </th>
                    <th className="px-3 py-2 text-center font-medium">
                      {t("models.col.capabilities")}
                    </th>
                    <th className="px-3 py-2 text-center font-medium">
                      {t("models.col.status")}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      {t("models.col.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((m) =>
                    editingId === m.id ? (
                      <tr
                        key={m.id}
                        className="border-b border-border bg-muted/20"
                      >
                        <td colSpan={9} className="p-3">
                          <form
                            onSubmit={onUpdate}
                            className="grid gap-2 sm:grid-cols-2"
                          >
                            <Field
                              label="modelId"
                              error={
                                editForm.formState.errors.modelId?.message
                              }
                            >
                              <input
                                {...editForm.register("modelId")}
                                className={cn(
                                  fieldClasses,
                                  editForm.formState.errors.modelId &&
                                    "border-destructive",
                                )}
                              />
                            </Field>
                            <Field
                              label={t("models.col.alias")}
                              error={editForm.formState.errors.alias?.message}
                            >
                              <input
                                {...editForm.register("alias")}
                                className={fieldClasses}
                              />
                            </Field>
                            <Field
                              label={t("models.manual.context")}
                              error={
                                editForm.formState.errors.contextWindow
                                  ?.message
                              }
                            >
                              <input
                                type="number"
                                {...editForm.register("contextWindow")}
                                className={fieldClasses}
                              />
                            </Field>
                            <Field
                              label={t("models.manual.inputCost")}
                              error={
                                editForm.formState.errors.inputCost?.message
                              }
                            >
                              <input
                                type="number"
                                step="any"
                                min={0}
                                {...editForm.register("inputCost")}
                                className={cn(
                                  fieldClasses,
                                  editForm.formState.errors.inputCost &&
                                    "border-destructive",
                                )}
                              />
                            </Field>
                            <Field
                              label={t("models.manual.outputCost")}
                              error={
                                editForm.formState.errors.outputCost?.message
                              }
                            >
                              <input
                                type="number"
                                step="any"
                                min={0}
                                {...editForm.register("outputCost")}
                                className={cn(
                                  fieldClasses,
                                  editForm.formState.errors.outputCost &&
                                    "border-destructive",
                                )}
                              />
                            </Field>
                            <div className="flex flex-wrap items-center gap-4 text-sm sm:col-span-2">
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  {...editForm.register("enabled")}
                                  className="h-4 w-4 rounded"
                                />
                                {t("models.manual.enabled")}
                              </label>
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  {...editForm.register("supportsThinking")}
                                  className="h-4 w-4 rounded"
                                />
                                {t("models.manual.supportsThinking")}
                              </label>
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  {...editForm.register("supportsVision")}
                                  className="h-4 w-4 rounded"
                                />
                                {t("models.manual.supportsVision")}
                              </label>
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  {...editForm.register("supportsAudio")}
                                  className="h-4 w-4 rounded"
                                />
                                {t("models.manual.supportsAudio")}
                              </label>
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  {...editForm.register("supportsImageGeneration")}
                                  className="h-4 w-4 rounded"
                                />
                                {t("models.manual.supportsImageGen")}
                              </label>
                            </div>
                            {editForm.watch("supportsThinking") && (
                              <Field
                                label={t("models.manual.thinkingBudget")}
                                error={editForm.formState.errors.thinkingBudgetTokens?.message}
                              >
                                <input
                                  type="number"
                                  {...editForm.register("thinkingBudgetTokens")}
                                  className={fieldClasses}
                                  placeholder="8192"
                                />
                              </Field>
                            )}
                            <div className="flex gap-2 sm:col-span-2">
                              <button
                                type="submit"
                                className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground"
                              >
                                {t("models.save")}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                className="rounded-lg border px-3 py-1.5 text-sm"
                              >
                                {t("models.cancel")}
                              </button>
                            </div>
                          </form>
                        </td>
                      </tr>
                    ) : (
                      <tr
                        key={m.id}
                        className="border-b border-border last:border-0"
                      >
                        <td className="px-3 py-2 font-mono text-xs">
                          {m.modelId}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {m.alias ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-center tabular-nums">
                          {m.contextWindow}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-xs">
                          {formatUsdPerM(m.inputCost)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-xs">
                          {formatUsdPerM(m.outputCost)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {m.supportsThinking ? (
                            <span className="inline-block rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                              {t("models.status.thinking")}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <div className="flex flex-wrap justify-center gap-1">
                            {(m.features ?? []).includes("vision") && (
                              <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                {t("models.status.vision")}
                              </span>
                            )}
                            {(m.features ?? []).includes("audio") && (
                              <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                {t("models.status.audio")}
                              </span>
                            )}
                            {(m.features ?? []).includes("image-generation") && (
                              <span className="inline-block rounded-full bg-pink-100 px-2 py-0.5 text-xs font-medium text-pink-700 dark:bg-pink-900/30 dark:text-pink-400">
                                {t("models.status.imageGen")}
                              </span>
                            )}
                            {!(m.features ?? []).includes("vision") && !(m.features ?? []).includes("audio") && !(m.features ?? []).includes("image-generation") && (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-xs font-medium",
                              m.enabled
                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                            )}
                          >
                            {m.enabled
                              ? t("models.status.enabled")
                              : t("models.status.disabled")}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => startEdit(m)}
                            className="mr-1 rounded p-1.5 text-muted-foreground hover:bg-muted"
                            title={t("models.edit")}
                            aria-label={t("models.edit")}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void handleDelete(m.id, m.modelId)
                            }
                            className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            title={t("models.delete")}
                            aria-label={t("models.delete")}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

function formatUsdPerM(n: number | string): string {
  const v = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
}

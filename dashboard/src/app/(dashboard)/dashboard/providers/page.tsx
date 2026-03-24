"use client";
// Provider 管理页 — CRUD、密钥查看、连接测试（ISSUE-V3-06）
import { useCallback, useEffect, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Zap,
  Loader2,
  X,
  Server,
  Boxes,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ProviderForm,
  type ProviderFormValues,
} from "@/components/providers/provider-form";
import { ModelsManageDialog } from "@/components/providers/models-manage-dialog";
import { useI18n } from "@/lib/i18n/context";

interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  apiType: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { models: number };
}

type DialogState =
  | { type: "closed" }
  | { type: "create" }
  | { type: "edit"; provider: Provider };

type ModelsDialogState = { id: string; name: string } | null;

export default function ProvidersPage() {
  const { t } = useI18n();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<DialogState>({ type: "closed" });
  const [modelsDialog, setModelsDialog] = useState<ModelsDialogState>(null);
  const [submitting, setSubmitting] = useState(false);
  const showToast = useCallback(
    (message: string, type: "success" | "error") => {
      if (type === "success") toast.success(message);
      else toast.error(message);
    },
    []
  );

  const fetchProviders = useCallback(async () => {
    try {
      const res = await fetch("/api/providers");
      if (!res.ok) throw new Error();
      const data = (await res.json()) as Provider[];
      setProviders(data);
    } catch {
      showToast(t("providers.toast.loadFail"), "error");
    } finally {
      setLoading(false);
    }
  }, [showToast, t]);

  useEffect(() => {
    void fetchProviders();
  }, [fetchProviders]);

  const handleCreate = async (values: ProviderFormValues) => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? t("providers.toast.createFail"));
      }
      setDialog({ type: "closed" });
      showToast(t("providers.toast.createOk"), "success");
      await fetchProviders();
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : t("providers.toast.createFail"),
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (
    id: string,
    values: ProviderFormValues
  ) => {
    setSubmitting(true);
    try {
      const payload = { ...values };
      if (!payload.apiKey) delete payload.apiKey;
      const res = await fetch(`/api/providers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? t("providers.toast.updateFail"));
      }
      setDialog({ type: "closed" });
      showToast(t("providers.toast.updateOk"), "success");
      await fetchProviders();
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : t("providers.toast.updateFail"),
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(t("providers.confirm.delete", { name }))) {
      return;
    }
    try {
      const res = await fetch(`/api/providers/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      showToast(t("providers.toast.deleteOk"), "success");
      await fetchProviders();
    } catch {
      showToast(t("providers.toast.deleteFail"), "error");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("providers.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("providers.subtitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDialog({ type: "create" })}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          {t("providers.add")}
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl border border-border bg-card"
            />
          ))}
        </div>
      ) : providers.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16">
          <Server className="h-12 w-12 text-muted-foreground/40" />
          <p className="mt-4 text-muted-foreground">{t("providers.empty")}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">
                  {t("providers.col.name")}
                </th>
                <th className="px-4 py-3 text-left font-medium">
                  {t("providers.col.baseUrl")}
                </th>
                <th className="px-4 py-3 text-left font-medium">
                  {t("providers.col.type")}
                </th>
                <th className="px-4 py-3 text-left font-medium">
                  {t("providers.col.apiKey")}
                </th>
                <th className="px-4 py-3 text-center font-medium">
                  {t("providers.col.status")}
                </th>
                <th className="px-4 py-3 text-center font-medium">
                  {t("providers.col.models")}
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  {t("providers.col.actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {providers.map((p) => (
                <ProviderRow
                  key={p.id}
                  provider={p}
                  onEdit={() => setDialog({ type: "edit", provider: p })}
                  onDelete={() => void handleDelete(p.id, p.name)}
                  onManageModels={() =>
                    setModelsDialog({ id: p.id, name: p.name })
                  }
                  onToast={showToast}
                  onRefresh={() => void fetchProviders()}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modelsDialog && (
        <ModelsManageDialog
          open
          providerId={modelsDialog.id}
          providerName={modelsDialog.name}
          onClose={() => setModelsDialog(null)}
          onChanged={() => void fetchProviders()}
          onToast={showToast}
        />
      )}

      {dialog.type !== "closed" && (
        <Dialog
          title={
            dialog.type === "create"
              ? t("providers.dialog.create")
              : t("providers.dialog.edit")
          }
          onClose={() => setDialog({ type: "closed" })}
        >
          <ProviderForm
            isEdit={dialog.type === "edit"}
            defaultValues={
              dialog.type === "edit"
                ? {
                    name: dialog.provider.name,
                    baseUrl: dialog.provider.baseUrl,
                    apiType: dialog.provider.apiType as
                      | "openai"
                      | "anthropic"
                      | "openai-compatible",
                    enabled: dialog.provider.enabled,
                    apiKey: "",
                  }
                : undefined
            }
            onSubmit={(values) =>
              dialog.type === "edit"
                ? handleUpdate(dialog.provider.id, values)
                : handleCreate(values)
            }
            onCancel={() => setDialog({ type: "closed" })}
            submitting={submitting}
          />
        </Dialog>
      )}

    </div>
  );
}

function ProviderRow({
  provider,
  onEdit,
  onDelete,
  onManageModels,
  onToast,
  onRefresh,
}: {
  provider: Provider;
  onEdit: () => void;
  onDelete: () => void;
  onManageModels: () => void;
  onToast: (message: string, type: "success" | "error") => void;
  onRefresh: () => void;
}) {
  const { t } = useI18n();
  const [keyVisible, setKeyVisible] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [toggleBusy, setToggleBusy] = useState(false);

  const handleRevealKey = async () => {
    if (keyVisible) {
      setKeyVisible(false);
      setRevealedKey(null);
      return;
    }
    try {
      const res = await fetch(`/api/providers/${provider.id}/reveal-key`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { apiKey: string };
      setRevealedKey(data.apiKey);
      setKeyVisible(true);
      setTimeout(() => {
        setKeyVisible(false);
        setRevealedKey(null);
      }, 10_000);
    } catch {
      onToast(t("providers.toast.revealFail"), "error");
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await fetch(`/api/providers/${provider.id}/test`, {
        method: "POST",
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { success: boolean; message?: string };
      if (data.success) {
        onToast(
          data.message ?? t("providers.toast.connectOk", { name: provider.name }),
          "success"
        );
      } else {
        onToast(data.message ?? t("providers.toast.connectFail"), "error");
      }
    } catch {
      onToast(t("providers.toast.testRequestFail"), "error");
    } finally {
      setTesting(false);
    }
  };

  const handleToggleEnabled = async () => {
    if (toggleBusy) return;
    setToggleBusy(true);
    try {
      const res = await fetch(`/api/providers/${provider.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !provider.enabled }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "update");
      }
      onToast(
        provider.enabled
          ? t("providers.toast.disabledOk")
          : t("providers.toast.enabledOk"),
        "success",
      );
      onRefresh();
    } catch {
      onToast(t("providers.toast.updateFail"), "error");
    } finally {
      setToggleBusy(false);
    }
  };

  return (
    <tr className="border-b border-border last:border-0 transition-colors hover:bg-muted/30">
      <td className="px-4 py-3 font-medium">{provider.name}</td>
      <td className="px-4 py-3 text-muted-foreground">
        <span className="max-w-[200px] truncate block" title={provider.baseUrl}>
          {provider.baseUrl}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-mono">
          {provider.apiType}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">
            {keyVisible && revealedKey
              ? revealedKey
              : "••••••••••••••••"}
          </span>
          <button
            type="button"
            onClick={() => void handleRevealKey()}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title={
              keyVisible ? t("providers.key.toggleHide") : t("providers.key.show")
            }
            aria-label={
              keyVisible ? t("providers.key.hide") : t("providers.key.show")
            }
          >
            {keyVisible ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </td>
      <td className="px-4 py-3 text-center">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
            provider.enabled
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              provider.enabled ? "bg-green-500" : "bg-red-500"
            )}
          />
          {provider.enabled
            ? t("providers.status.enabled")
            : t("providers.status.disabled")}
        </span>
      </td>
      <td className="px-4 py-3 text-center text-muted-foreground">
        {provider._count?.models ?? 0}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            role="switch"
            aria-checked={provider.enabled}
            aria-label={
              provider.enabled
                ? t("providers.a11y.disableProvider")
                : t("providers.a11y.enableProvider")
            }
            disabled={toggleBusy}
            onClick={() => void handleToggleEnabled()}
            title={
              provider.enabled
                ? t("providers.action.disable")
                : t("providers.action.enable")
            }
            className={cn(
              "relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
              provider.enabled ? "bg-green-600" : "bg-muted",
            )}
          >
            <span
              className={cn(
                "pointer-events-none absolute top-0.5 left-0.5 block h-5 w-5 rounded-full bg-white shadow transition-transform",
                provider.enabled ? "translate-x-5" : "translate-x-0",
              )}
            />
          </button>
          <button
            type="button"
            onClick={onManageModels}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title={t("providers.models.manage")}
            aria-label={t("providers.models.manage")}
          >
            <Boxes className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => void handleTest()}
            disabled={testing}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            title={t("providers.test")}
            aria-label={t("providers.test")}
          >
            {testing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title={t("providers.action.edit")}
            aria-label={t("providers.action.edit")}
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            title={t("providers.action.delete")}
            aria-label={t("providers.action.delete")}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-background p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

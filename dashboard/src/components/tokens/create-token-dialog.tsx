// 创建 Token 弹窗 — 输入名称创建，创建后展示完整 Token 供复制（ISSUE-V3-06）
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { toast } from "sonner";

interface CreateTokenDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  /** 与系统设置「允许再次复制」一致；开启后服务端保存加密副本 */
  allowReveal?: boolean;
}

interface CreatedToken {
  id: string;
  name: string;
  fullToken: string;
  storedForReveal?: boolean;
}

export function CreateTokenDialog({
  open,
  onClose,
  onCreated,
  allowReveal = false,
}: CreateTokenDialogProps) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<CreatedToken | null>(null);
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      el.showModal();
    } else {
      el.close();
    }
  }, [open]);

  const handleClose = useCallback(() => {
    setName("");
    setError("");
    setCreated(null);
    setCopied(false);
    onClose();
  }, [onClose]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim()) {
        setError(t("tokens.create.nameRequired"));
        return;
      }
      setCreating(true);
      setError("");
      try {
        const res = await fetch("/api/tokens", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim() }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? t("tokens.create.fail"));
        }
        const data = (await res.json()) as CreatedToken;
        setCreated(data);
        onCreated();
        toast.success(t("common.saveSuccess"));
      } catch (err) {
        setError(
          err instanceof Error ? err.message : t("tokens.create.failRetry"),
        );
      } finally {
        setCreating(false);
      }
    },
    [name, onCreated, t],
  );

  const handleCopy = useCallback(async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.fullToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* 浏览器不支持 clipboard API 时静默忽略 */
    }
  }, [created]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      onClose={handleClose}
      className="w-full max-w-lg rounded-lg border border-border bg-background p-0 shadow-lg backdrop:bg-black/50"
    >
      <div className="p-6">
        <h2 className="text-lg font-semibold">
          {created ? t("tokens.create.successTitle") : t("tokens.create.title")}
        </h2>

        {created ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950">
              <p className="mb-2 text-sm font-medium text-amber-800 dark:text-amber-100">
                {created.storedForReveal
                  ? t("tokens.create.successOnce")
                  : t("tokens.create.successNoStore")}
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all rounded bg-white px-3 py-2 font-mono text-xs dark:bg-card">
                  {created.fullToken}
                </code>
                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  className="shrink-0 rounded-md border border-border px-3 py-2 text-xs font-medium transition-colors hover:bg-muted"
                >
                  {copied ? t("tokens.create.copied") : t("tokens.create.copy")}
                </button>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                {t("tokens.create.done")}
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="mt-4 space-y-4"
          >
            <p className="text-xs text-muted-foreground" role="note">
              {allowReveal ? t("tokens.create.hintOn") : t("tokens.create.hintOff")}
            </p>
            <div className="space-y-1.5">
              <label htmlFor="token-name" className="text-sm font-medium">
                {t("tokens.create.nameLabel")}
              </label>
              <input
                id="token-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("tokens.create.namePlaceholder")}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground"
                autoFocus
              />
              {error && (
                <p className="text-xs text-destructive">{error}</p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                {t("tokens.create.cancel")}
              </button>
              <button
                type="submit"
                disabled={creating}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {creating ? t("tokens.create.submitting") : t("tokens.create.submit")}
              </button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}

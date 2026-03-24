// Token 列表表格 — 仅展示未撤销 Token；支持撤销与再次复制（若已存密文）
"use client";

import { useCallback, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import type { Locale } from "@/lib/i18n/messages";

export interface TokenItem {
  id: string;
  name: string;
  tokenSuffix: string;
  createdAt: string;
  /** 服务端是否保存了可解密副本（不暴露密文） */
  canReveal?: boolean;
  /** 系统签发（如内部 LLM），不可撤销 */
  systemManaged?: boolean;
}

interface TokenListProps {
  tokens: TokenItem[];
  onRevoke: (id: string) => Promise<void>;
  onRevealCopy?: (id: string) => Promise<void>;
}

function formatDate(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleString(locale === "en" ? "en-US" : "zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TokenList({
  tokens,
  onRevoke,
  onRevealCopy,
}: TokenListProps) {
  const { t, locale } = useI18n();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revealingId, setRevealingId] = useState<string | null>(null);

  const handleRevoke = useCallback(
    async (id: string) => {
      setRevoking(true);
      try {
        await onRevoke(id);
      } finally {
        setRevoking(false);
        setConfirmId(null);
      }
    },
    [onRevoke],
  );

  const handleReveal = useCallback(
    async (id: string) => {
      if (!onRevealCopy) return;
      setRevealingId(id);
      try {
        await onRevealCopy(id);
      } finally {
        setRevealingId(null);
      }
    },
    [onRevealCopy],
  );

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="px-4 py-2.5 text-left font-medium">
              {t("providers.col.name")}
            </th>
            <th className="px-4 py-2.5 text-left font-medium">
              {t("tokens.table.token")}
            </th>
            <th className="px-4 py-2.5 text-left font-medium">
              {t("tokens.table.created")}
            </th>
            <th className="px-4 py-2.5 text-left font-medium">
              {t("providers.col.status")}
            </th>
            <th className="px-4 py-2.5 text-right font-medium">
              {t("providers.col.actions")}
            </th>
          </tr>
        </thead>
        <tbody>
          {tokens.length === 0 && (
            <tr>
              <td
                colSpan={5}
                className="px-4 py-8 text-center text-muted-foreground"
              >
                {t("tokens.empty")}
              </td>
            </tr>
          )}
          {tokens.map((token) => (
            <tr key={token.id} className="border-b border-border">
              <td className="px-4 py-2.5 font-medium">
                <span className="inline-flex flex-wrap items-center gap-2">
                  {token.name}
                  {token.systemManaged ? (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                      {t("tokens.internal.badge")}
                    </span>
                  ) : null}
                </span>
              </td>
              <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                sr_****{token.tokenSuffix}
              </td>
              <td className="px-4 py-2.5 text-muted-foreground">
                {formatDate(token.createdAt, locale)}
              </td>
              <td className="px-4 py-2.5">
                <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-950 dark:text-green-200">
                  {t("tokens.status.active")}
                </span>
              </td>
              <td className="px-4 py-2.5 text-right">
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {token.canReveal && onRevealCopy && (
                    <button
                      type="button"
                      onClick={() => void handleReveal(token.id)}
                      disabled={revealingId === token.id}
                      className="rounded-md border border-border px-3 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
                    >
                      {revealingId === token.id
                        ? t("tokens.reveal.processing")
                        : t("tokens.action.reveal")}
                    </button>
                  )}
                  {token.systemManaged ? (
                    <span className="text-xs text-muted-foreground">
                      {t("tokens.internal.revokeDisabled")}
                    </span>
                  ) : confirmId === token.id ? (
                    <div className="inline-flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {t("tokens.revoke.confirm")}
                          </span>
                      <button
                        type="button"
                        onClick={() => void handleRevoke(token.id)}
                        disabled={revoking}
                        className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                      >
                            {revoking
                              ? t("tokens.revoke.processing")
                              : t("common.confirm")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmId(null)}
                        className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted"
                      >
                            {t("tokens.create.cancel")}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmId(token.id)}
                      className="rounded-md border border-border px-3 py-1 text-xs font-medium text-destructive hover:bg-muted"
                    >
                          {t("tokens.action.revoke")}
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

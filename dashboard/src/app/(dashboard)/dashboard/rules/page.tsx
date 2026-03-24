// 路由规则管理页 — 可视化编辑 + Raw JSON + 自然语言 + 命中分析
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { RuleCard, type RuleRecord } from "@/components/rules/rule-card";
import { RuleForm } from "@/components/rules/rule-form";
import { RuleEditorRaw } from "@/components/rules/rule-editor-raw";
import { NlRuleGenerator } from "@/components/rules/nl-rule-generator";
import { RuleHitStats } from "@/components/rules/rule-hit-stats";
import type { RuleFormData } from "@/lib/schemas/rule";
import { useI18n } from "@/lib/i18n/context";
import { toast } from "sonner";

type TabKey = "visual" | "raw" | "nlgen" | "hitstats";

export default function RulesPage() {
  const { t } = useI18n();
  const [rules, setRules] = useState<RuleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("visual");
  const [formOpen, setFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RuleRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [rawSaving, setRawSaving] = useState(false);
  const dragItemId = useRef<string | null>(null);
  const [bulkConfirm, setBulkConfirm] = useState<
    "enable_all" | "disable_all" | "delete_all" | null
  >(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  // 拉取规则列表
  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch("/api/rules");
      if (res.ok) {
        const data = (await res.json()) as RuleRecord[];
        setRules(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRules();
  }, [fetchRules]);

  // 创建 / 更新规则
  async function handleSubmit(data: RuleFormData) {
    setSubmitting(true);
    try {
      const url = editingRule ? `/api/rules/${editingRule.id}` : "/api/rules";
      const method = editingRule ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        toast.success(t("rules.toast.saveOk"));
        await fetchRules();
        setFormOpen(false);
        setEditingRule(null);
      } else {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(err.error ?? t("rules.toast.saveFail"));
      }
    } catch {
      toast.error(t("rules.toast.saveFail"));
    } finally {
      setSubmitting(false);
    }
  }

  // 删除规则
  async function handleDelete(id: string) {
    if (!confirm(t("rules.confirmDelete"))) return;
    const res = await fetch(`/api/rules/${id}`, { method: "DELETE" });
    if (res.ok) await fetchRules();
  }

  // 启用/禁用切换
  async function handleToggle(id: string, enabled: boolean) {
    const rule = rules.find((r) => r.id === id);
    if (!rule) return;
    await fetch(`/api/rules/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: rule.name,
        nameEn: rule.nameEn ?? undefined,
        priority: rule.priority,
        enabled,
        conditions: rule.conditions,
        targetModel: rule.targetModel,
        fallbackChain: rule.fallbackChain,
        description: rule.description,
        descriptionEn: rule.descriptionEn ?? undefined,
      }),
    });
    await fetchRules();
  }

  // 拖拽排序 (HTML5 Drag & Drop)
  function onDragStart(e: React.DragEvent, id: string) {
    dragItemId.current = id;
    e.dataTransfer.effectAllowed = "move";
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  async function onDrop(_e: React.DragEvent, targetId: string) {
    const sourceId = dragItemId.current;
    dragItemId.current = null;
    if (!sourceId || sourceId === targetId) return;

    const reordered = [...rules];
    const srcIdx = reordered.findIndex((r) => r.id === sourceId);
    const tgtIdx = reordered.findIndex((r) => r.id === targetId);
    if (srcIdx === -1 || tgtIdx === -1) return;

    const [moved] = reordered.splice(srcIdx, 1);
    reordered.splice(tgtIdx, 0, moved);

    // 根据新位置分配优先级（倒序，最上面的优先级最高）
    const updates = reordered.map((r, i) => ({
      id: r.id,
      priority: Math.max(0, 1000 - i * Math.floor(1000 / Math.max(reordered.length, 1))),
    }));

    setRules(
      reordered.map((r, i) => ({ ...r, priority: updates[i].priority }))
    );

    await fetch("/api/rules/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
  }

  // 导出规则
  async function handleExport() {
    const res = await fetch("/api/rules/export");
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `smart-router-rules-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // 导入规则
  async function handleImport() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        const data = JSON.parse(text) as unknown;
        const res = await fetch("/api/rules/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (res.ok) {
          toast.success(t("rules.importOk"));
          await fetchRules();
        } else {
          toast.error(t("rules.importFail"));
        }
      } catch {
        toast.error(t("rules.importInvalidJson"));
      }
    };
    input.click();
  }

  async function handleBulkAction(
    action: "enable_all" | "disable_all" | "delete_all",
  ) {
    setBulkLoading(true);
    try {
      const res = await fetch("/api/rules/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const data = (await res.json()) as { affected: number };
        const msgKey =
          action === "enable_all"
            ? "rules.bulk.enableSuccess"
            : action === "disable_all"
              ? "rules.bulk.disableSuccess"
              : "rules.bulk.deleteSuccess";
        toast.success(t(msgKey, { n: data.affected }));
        await fetchRules();
      } else {
        toast.error(t("rules.bulk.fail"));
      }
    } catch {
      toast.error(t("rules.bulk.fail"));
    } finally {
      setBulkLoading(false);
      setBulkConfirm(null);
    }
  }

  // Raw 视图保存：全量替换所有规则
  async function handleRawSave(formDataList: RuleFormData[]) {
    setRawSaving(true);
    try {
      for (const rule of rules) {
        const del = await fetch(`/api/rules/${rule.id}`, { method: "DELETE" });
        if (!del.ok) throw new Error("delete");
      }
      for (const data of formDataList) {
        const cre = await fetch("/api/rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!cre.ok) throw new Error("create");
      }
      await fetchRules();
      toast.success(t("rules.toast.rawSaveOk"));
    } catch {
      toast.error(t("rules.toast.saveFail"));
    } finally {
      setRawSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("rules.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("rules.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            className="rounded-md border px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-foreground dark:hover:bg-muted"
          >
            {t("rules.export")}
          </button>
          <button
            type="button"
            onClick={handleImport}
            className="rounded-md border px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-foreground dark:hover:bg-muted"
          >
            {t("rules.import")}
          </button>
          <Link
            href="/dashboard/rules/wizard"
            className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200"
          >
            {t("rules.wizard")}
          </Link>
          <button
            type="button"
            onClick={() => {
              setEditingRule(null);
              setFormOpen(true);
              setTab("visual");
            }}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {t("rules.addButton")}
          </button>
          {rules.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setBulkConfirm("enable_all")}
                className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm font-medium text-green-800 hover:bg-green-100 dark:border-green-900 dark:bg-green-950 dark:text-green-200"
              >
                {t("rules.bulk.enableAll")}
              </button>
              <button
                type="button"
                onClick={() => setBulkConfirm("disable_all")}
                className="rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm font-medium text-yellow-700 hover:bg-yellow-100 dark:border-yellow-900 dark:bg-yellow-950 dark:text-yellow-200"
              >
                {t("rules.bulk.disableAll")}
              </button>
              <button
                type="button"
                onClick={() => setBulkConfirm("delete_all")}
                className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
              >
                {t("rules.bulk.deleteAll")}
              </button>
            </>
          )}
        </div>
      </div>

      <section
        className="rounded-lg border border-border bg-muted/30 p-4 text-sm"
        aria-label={t("rules.chain.title")}
      >
        <h2 className="font-semibold text-foreground">{t("rules.chain.title")}</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-muted-foreground">
          <li>{t("rules.chain.l0")}</li>
          <li>{t("rules.chain.l1")}</li>
          <li>{t("rules.chain.l2")}</li>
          <li>
            {t("rules.chain.l3a")}{" "}
            <Link
              href="/dashboard/settings"
              className="font-medium text-primary underline underline-offset-2 hover:no-underline"
            >
              {t("rules.chain.l3Link")}
            </Link>{" "}
            {t("rules.chain.l3b")}
          </li>
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">{t("rules.chain.footer")}</p>
      </section>

      {/* 视图切换 Tab */}
      <div className="flex border-b">
        {(
          [
            { key: "visual" as const, label: t("rules.tab.visual") },
            { key: "raw" as const, label: t("rules.tab.raw") },
            { key: "nlgen" as const, label: t("rules.tab.nl") },
            { key: "hitstats" as const, label: t("rules.tab.hit") },
          ] as const
        ).map(({ key, label }) => (
          <button
            type="button"
            key={key}
            onClick={() => setTab(key)}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
        <div className="ml-auto flex items-center text-sm text-muted-foreground">
          {t("rules.count", { n: rules.length })}
        </div>
      </div>

      {/* 表单弹窗 */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold">
              {editingRule ? t("rules.dialog.edit") : t("rules.dialog.create")}
            </h2>
            <RuleForm
              initialData={editingRule}
              onSubmit={handleSubmit}
              onCancel={() => {
                setFormOpen(false);
                setEditingRule(null);
              }}
              isSubmitting={submitting}
            />
          </div>
        </div>
      )}

      {bulkConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-900">
            <h2 className="text-lg font-semibold text-foreground">
              {t(
                bulkConfirm === "enable_all"
                  ? "rules.bulk.enableAllConfirmTitle"
                  : bulkConfirm === "disable_all"
                    ? "rules.bulk.disableAllConfirmTitle"
                    : "rules.bulk.deleteAllConfirmTitle",
              )}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t(
                bulkConfirm === "enable_all"
                  ? "rules.bulk.enableAllConfirmDesc"
                  : bulkConfirm === "disable_all"
                    ? "rules.bulk.disableAllConfirmDesc"
                    : "rules.bulk.deleteAllConfirmDesc",
              )}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setBulkConfirm(null)}
                disabled={bulkLoading}
                className="rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-foreground dark:hover:bg-muted"
              >
                {t("rules.bulk.cancel")}
              </button>
              <button
                type="button"
                onClick={() =>
                  bulkConfirm
                    ? void handleBulkAction(bulkConfirm)
                    : undefined
                }
                disabled={bulkLoading}
                className={`rounded-md px-4 py-2 text-sm font-medium text-white ${
                  bulkConfirm === "delete_all"
                    ? "bg-red-600 hover:bg-red-700"
                    : bulkConfirm === "enable_all"
                      ? "bg-green-600 hover:bg-green-700"
                      : "bg-yellow-600 hover:bg-yellow-700"
                } disabled:opacity-50`}
              >
                {bulkLoading && (
                  <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                )}
                {t("rules.bulk.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 主内容区 */}
      {loading ? (
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          {t("common.loading")}
        </div>
      ) : tab === "visual" ? (
        /* 可视化视图 */
        rules.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-lg border-2 border-dashed text-muted-foreground">
            <p className="text-lg">{t("rules.visual.emptyTitle")}</p>
            <p className="mt-1 text-sm">{t("rules.visual.emptyHint")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rules.map((rule) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                onEdit={(r) => {
                  setEditingRule(r);
                  setFormOpen(true);
                }}
                onDelete={handleDelete}
                onToggle={handleToggle}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDrop={onDrop}
              />
            ))}
          </div>
        )
      ) : tab === "nlgen" ? (
        /* 自然语言规则生成 */
        <NlRuleGenerator
          onSave={async (newRules) => {
            try {
              for (const rule of newRules) {
                const res = await fetch("/api/rules", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(rule),
                });
                if (!res.ok) throw new Error("create");
              }
              await fetchRules();
              setTab("visual");
              toast.success(t("rules.toast.saveOk"));
            } catch {
              toast.error(t("rules.toast.saveFail"));
            }
          }}
        />
      ) : tab === "hitstats" ? (
        /* 规则命中分析 */
        <RuleHitStats />
      ) : (
        /* Raw JSON 视图 */
        <RuleEditorRaw
          rules={rules}
          onSave={handleRawSave}
          isSaving={rawSaving}
        />
      )}
    </div>
  );
}

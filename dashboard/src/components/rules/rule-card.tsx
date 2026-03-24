// 规则卡片 — 显示单条规则摘要，支持拖拽排序；按语言展示中英文名称与描述
"use client";

import type { ConditionItem, Conditions } from "@/lib/schemas/rule";
import { useI18n } from "@/lib/i18n/context";
import { pickRuleDescription, pickRuleName } from "@/lib/rule-display";

export interface RuleRecord {
  id: string;
  name: string;
  nameEn?: string | null;
  priority: number;
  enabled: boolean;
  conditions: Conditions;
  targetModel: string;
  fallbackChain: string[];
  description: string | null;
  descriptionEn?: string | null;
  hitCount: number;
  lastHitAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function summarizeConditionItem(
  item: ConditionItem,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  switch (item.type) {
    case "keywords":
      return t("rule.condition.sum.keywords", {
        kw: item.keywords?.join(", ") || t("rule.condition.none"),
      });
    case "tokenCount": {
      const max =
        item.maxTokens != null ? String(item.maxTokens) : "∞";
      return t("rule.condition.sum.tokenRange", {
        min: String(item.minTokens ?? 0),
        max,
      });
    }
    case "taskType":
      return t("rule.condition.sum.task", {
        task: item.taskTypes?.join(", ") || t("rule.condition.none"),
      });
    case "maxCost":
      return t("rule.condition.sum.maxCost", {
        v: String(item.maxCostPerMillion ?? "?"),
      });
    case "maxLatency":
      return t("rule.condition.sum.maxLatency", {
        v: String(item.maxLatencyMs ?? "?"),
      });
    case "providerHealth":
      return t("rule.condition.sum.providerHealth", {
        name: item.providerName ?? "Provider",
        status: item.healthStatus ?? "?",
      });
    default:
      return t("rule.condition.unknown");
  }
}

function conditionTypeLabel(
  type: ConditionItem["type"],
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  return t(`rule.condition.type.${type}`);
}

function priorityColor(p: number): string {
  if (p >= 800) return "bg-red-100 text-red-800";
  if (p >= 500) return "bg-yellow-100 text-yellow-800";
  return "bg-green-100 text-green-800";
}

interface RuleCardProps {
  rule: RuleRecord;
  onEdit: (rule: RuleRecord) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, id: string) => void;
}

export function RuleCard({
  rule,
  onEdit,
  onDelete,
  onToggle,
  onDragStart,
  onDragOver,
  onDrop,
}: RuleCardProps) {
  const { t, locale } = useI18n();
  const conditions = rule.conditions as Conditions;
  const displayName = pickRuleName(rule, locale);
  const displayDesc = pickRuleDescription(rule, locale);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, rule.id)}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, rule.id)}
      className={`rounded-lg border bg-card p-4 shadow-sm transition-opacity ${
        rule.enabled ? "opacity-100" : "opacity-50"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className="cursor-grab text-muted-foreground select-none"
            title={t("rule.card.dragTitle")}
          >
            ⠿
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">{displayName}</h3>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${priorityColor(rule.priority)}`}
              >
                P{rule.priority}
              </span>
            </div>
            {displayDesc && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {displayDesc}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              checked={rule.enabled}
              onChange={(e) => onToggle(rule.id, e.target.checked)}
              className="peer sr-only"
            />
            <div className="h-5 w-9 rounded-full bg-gray-300 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-green-500 peer-checked:after:translate-x-full" />
          </label>
          <button
            type="button"
            onClick={() => onEdit(rule)}
            className="rounded px-2 py-1 text-sm text-blue-600 hover:bg-blue-50"
          >
            {t("rule.card.edit")}
          </button>
          <button
            type="button"
            onClick={() => onDelete(rule.id)}
            className="rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50"
          >
            {t("rule.card.delete")}
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded bg-blue-50 px-2 py-0.5 text-blue-700">
          → {rule.targetModel}
        </span>
        {rule.fallbackChain.length > 0 && (
          <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-600">
            {t("rule.card.fallback")}: {rule.fallbackChain.join(" → ")}
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          {t("rule.card.hits", { n: rule.hitCount })}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          {conditions.combinator}:
        </span>
        {conditions.items.map((item, i) => (
          <span
            key={i}
            className="inline-flex rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700"
          >
            {conditionTypeLabel(item.type, t)} —{" "}
            {summarizeConditionItem(item, t)}
          </span>
        ))}
      </div>
    </div>
  );
}

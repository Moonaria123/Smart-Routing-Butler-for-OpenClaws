// Raw JSON 编辑器 — 使用 textarea 占位（后续替换为 Monaco Editor）
"use client";

import { useEffect, useState, useCallback } from "react";
import { ruleSchema, type RuleFormData } from "@/lib/schemas/rule";
import { z } from "zod";
import type { RuleRecord } from "./rule-card";
import { useI18n } from "@/lib/i18n/context";

const rulesArraySchema = z.array(ruleSchema);

interface RuleEditorRawProps {
  rules: RuleRecord[];
  onSave: (rules: RuleFormData[]) => void;
  isSaving?: boolean;
}

function rulesToFormData(rules: RuleRecord[]): RuleFormData[] {
  return rules.map((r) => ({
    name: r.name,
    nameEn: r.nameEn ?? undefined,
    priority: r.priority,
    enabled: r.enabled,
    conditions: r.conditions,
    targetModel: r.targetModel,
    fallbackChain: r.fallbackChain,
    thinkingStrategy: r.thinkingStrategy ?? "auto",
    description: r.description ?? undefined,
    descriptionEn: r.descriptionEn ?? undefined,
  }));
}

export function RuleEditorRaw({ rules, onSave, isSaving = false }: RuleEditorRawProps) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [isValid, setIsValid] = useState(true);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (!isDirty) {
      setText(JSON.stringify(rulesToFormData(rules), null, 2));
      setErrors([]);
      setIsValid(true);
    }
  }, [rules, isDirty]);

  const validate = useCallback((value: string) => {
    try {
      const parsed = JSON.parse(value) as unknown;
      const result = rulesArraySchema.safeParse(parsed);
      if (result.success) {
        setErrors([]);
        setIsValid(true);
        return result.data;
      }
      setErrors(
        result.error.issues.map(
          (issue) => `[${issue.path.join(".")}] ${issue.message}`
        )
      );
      setIsValid(false);
      return null;
    } catch {
      setErrors(["__PARSE_ERROR__"]);
      setIsValid(false);
      return null;
    }
  }, []);

  function handleChange(value: string) {
    setText(value);
    setIsDirty(true);
    validate(value);
  }

  function handleSave() {
    const data = validate(text);
    if (data) {
      onSave(data);
      setIsDirty(false);
    }
  }

  function handleReset() {
    setText(JSON.stringify(rulesToFormData(rules), null, 2));
    setErrors([]);
    setIsValid(true);
    setIsDirty(false);
  }

  const lineCount = text.split("\n").length;

  return (
    <div className="space-y-3" role="group" aria-label="Raw JSON editor">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{t("raw.lines", { n: lineCount })}</span>
          {isDirty && (
            <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-700">
              {t("raw.unsaved")}
            </span>
          )}
          {isValid ? (
            <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
              {t("raw.valid")}
            </span>
          ) : (
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">
              {t("raw.invalid")}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {isDirty && (
            <button
              type="button"
              onClick={handleReset}
              className="rounded-md border px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              {t("raw.reset")}
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={!isValid || !isDirty || isSaving}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? t("raw.saving") : t("raw.save")}
          </button>
        </div>
      </div>

      <textarea
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        className="h-[600px] w-full resize-y rounded-md border bg-gray-900 p-4 font-mono text-sm text-green-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        spellCheck={false}
        aria-label="Rule JSON editor"
      />

      {errors.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3">
          <h4 className="mb-1 text-sm font-medium text-red-800">
            {errors[0] === "__PARSE_ERROR__"
              ? t("raw.parseFail")
              : t("raw.errorCount", { n: errors.length })}
          </h4>
          {errors[0] !== "__PARSE_ERROR__" && (
            <ul className="list-inside list-disc space-y-0.5 text-xs text-red-700">
              {errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

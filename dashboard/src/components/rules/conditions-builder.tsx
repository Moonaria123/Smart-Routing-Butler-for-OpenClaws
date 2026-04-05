// 条件构建器 — 可视化构建规则匹配条件
"use client";

import { useFieldArray, useFormContext } from "react-hook-form";
import type { RuleFormData, ConditionItem } from "@/lib/schemas/rule";
import { CONDITION_TYPE_LABELS, TASK_TYPE_OPTIONS } from "@/lib/schemas/rule";
import { useI18n } from "@/lib/i18n/context";

const CONDITION_TYPES = Object.keys(CONDITION_TYPE_LABELS) as ConditionItem["type"][];

const CONDITION_TYPE_I18N_KEYS: Record<ConditionItem["type"], string> = {
  keywords: "rule.condition.type.keywords",
  tokenCount: "rule.condition.type.tokenCount",
  taskType: "rule.condition.type.taskType",
  maxCost: "rule.condition.type.maxCost",
  maxLatency: "rule.condition.type.maxLatency",
  providerHealth: "rule.condition.type.providerHealth",
  hasModality: "rule.condition.type.hasModality",
};

function emptyCondition(): ConditionItem {
  return { type: "keywords", keywords: [] };
}

export function ConditionsBuilder() {
  const { t } = useI18n();
  const { register, watch, setValue, control } =
    useFormContext<RuleFormData>();

  const { fields, append, remove } = useFieldArray({
    control,
    name: "conditions.items",
  });

  const combinator = watch("conditions.combinator");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">{t("cond.combinator")}</span>
        <div className="inline-flex rounded-md border">
          {(["AND", "OR"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setValue("conditions.combinator", c)}
              className={`px-3 py-1 text-sm font-medium transition-colors ${
                combinator === c
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {fields.map((field, index) => (
        <ConditionItemEditor
          key={field.id}
          index={index}
          onRemove={() => remove(index)}
          register={register}
          watch={watch}
          setValue={setValue}
        />
      ))}

      <button
        type="button"
        onClick={() => append(emptyCondition())}
        className="rounded-md border border-dashed border-gray-300 px-4 py-2 text-sm text-gray-600 transition-colors hover:border-blue-400 hover:text-blue-600"
      >
        {t("cond.addCondition")}
      </button>
    </div>
  );
}

interface ConditionItemEditorProps {
  index: number;
  onRemove: () => void;
  register: ReturnType<typeof useFormContext<RuleFormData>>["register"];
  watch: ReturnType<typeof useFormContext<RuleFormData>>["watch"];
  setValue: ReturnType<typeof useFormContext<RuleFormData>>["setValue"];
}

function ConditionItemEditor({
  index,
  onRemove,
  register,
  watch,
  setValue,
}: ConditionItemEditorProps) {
  const { t } = useI18n();
  const type = watch(`conditions.items.${index}.type`);

  return (
    <div className="rounded-md border bg-gray-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <select
          {...register(`conditions.items.${index}.type`)}
          className="rounded-md border bg-white px-3 py-1.5 text-sm"
          onChange={(e) => {
            const newType = e.target.value as ConditionItem["type"];
            setValue(`conditions.items.${index}.type`, newType);
            resetConditionParams(index, newType, setValue);
          }}
        >
          {CONDITION_TYPES.map((ct) => (
            <option key={ct} value={ct}>
              {t(CONDITION_TYPE_I18N_KEYS[ct])}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onRemove}
          className="text-sm text-red-500 hover:text-red-700"
        >
          {t("cond.remove")}
        </button>
      </div>

      {type === "keywords" && (
        <KeywordsInput index={index} register={register} watch={watch} setValue={setValue} />
      )}
      {type === "tokenCount" && (
        <div className="flex gap-3">
          <label className="flex flex-col gap-1 text-sm">
            {t("cond.minToken")}
            <input
              type="number"
              {...register(`conditions.items.${index}.minTokens`, {
                valueAsNumber: true,
              })}
              className="w-32 rounded-md border px-2 py-1.5"
              placeholder="0"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("cond.maxToken")}
            <input
              type="number"
              {...register(`conditions.items.${index}.maxTokens`, {
                valueAsNumber: true,
              })}
              className="w-32 rounded-md border px-2 py-1.5"
              placeholder="∞"
            />
          </label>
        </div>
      )}
      {type === "taskType" && (
        <TaskTypeSelector index={index} watch={watch} setValue={setValue} />
      )}
      {type === "maxCost" && (
        <label className="flex flex-col gap-1 text-sm">
          {t("cond.maxCostPerM")}
          <input
            type="number"
            step="0.01"
            {...register(`conditions.items.${index}.maxCostPerMillion`, {
              valueAsNumber: true,
            })}
            className="w-40 rounded-md border px-2 py-1.5"
            placeholder="10.00"
          />
        </label>
      )}
      {type === "maxLatency" && (
        <label className="flex flex-col gap-1 text-sm">
          {t("cond.maxLatencyMs")}
          <input
            type="number"
            {...register(`conditions.items.${index}.maxLatencyMs`, {
              valueAsNumber: true,
            })}
            className="w-40 rounded-md border px-2 py-1.5"
            placeholder="5000"
          />
        </label>
      )}
      {type === "providerHealth" && (
        <div className="flex gap-3">
          <label className="flex flex-col gap-1 text-sm">
            {t("cond.providerName")}
            <input
              type="text"
              {...register(`conditions.items.${index}.providerName`)}
              className="w-40 rounded-md border px-2 py-1.5"
              placeholder="openai"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("cond.healthStatus")}
            <select
              {...register(`conditions.items.${index}.healthStatus`)}
              className="rounded-md border bg-white px-3 py-1.5"
            >
              <option value="green">{t("cond.health.green")}</option>
              <option value="yellow">{t("cond.health.yellow")}</option>
              <option value="red">{t("cond.health.red")}</option>
            </select>
          </label>
        </div>
      )}
      {type === "hasModality" && (
        <ModalitySelector index={index} watch={watch} setValue={setValue} />
      )}
    </div>
  );
}

function resetConditionParams(
  index: number,
  newType: ConditionItem["type"],
  setValue: ReturnType<typeof useFormContext<RuleFormData>>["setValue"]
) {
  const prefix = `conditions.items.${index}` as const;
  setValue(`${prefix}.keywords`, undefined);
  setValue(`${prefix}.minTokens`, undefined);
  setValue(`${prefix}.maxTokens`, undefined);
  setValue(`${prefix}.taskTypes`, undefined);
  setValue(`${prefix}.maxCostPerMillion`, undefined);
  setValue(`${prefix}.maxLatencyMs`, undefined);
  setValue(`${prefix}.providerName`, undefined);
  setValue(`${prefix}.healthStatus`, undefined);
  setValue(`${prefix}.modalities`, undefined);

  if (newType === "keywords") setValue(`${prefix}.keywords`, []);
  if (newType === "taskType") setValue(`${prefix}.taskTypes`, []);
  if (newType === "hasModality") setValue(`${prefix}.modalities`, []);
}

function KeywordsInput({
  index,
  watch,
  setValue,
}: {
  index: number;
  register: ConditionItemEditorProps["register"];
  watch: ConditionItemEditorProps["watch"];
  setValue: ConditionItemEditorProps["setValue"];
}) {
  const { t } = useI18n();
  const keywords: string[] =
    watch(`conditions.items.${index}.keywords`) ?? [];

  function addKeyword(value: string) {
    const trimmed = value.trim();
    if (trimmed && !keywords.includes(trimmed)) {
      setValue(`conditions.items.${index}.keywords`, [...keywords, trimmed]);
    }
  }

  function removeKeyword(kw: string) {
    setValue(
      `conditions.items.${index}.keywords`,
      keywords.filter((k) => k !== kw)
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {keywords.map((kw) => (
          <span
            key={kw}
            className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-sm text-blue-800"
          >
            {kw}
            <button
              type="button"
              onClick={() => removeKeyword(kw)}
              className="ml-0.5 text-blue-600 hover:text-blue-900"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        placeholder={t("cond.keywordsPh")}
        className="w-full rounded-md border px-2 py-1.5 text-sm"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addKeyword(e.currentTarget.value);
            e.currentTarget.value = "";
          }
        }}
      />
    </div>
  );
}

function TaskTypeSelector({
  index,
  watch,
  setValue,
}: {
  index: number;
  watch: ConditionItemEditorProps["watch"];
  setValue: ConditionItemEditorProps["setValue"];
}) {
  const selected: string[] =
    watch(`conditions.items.${index}.taskTypes`) ?? [];

  function toggle(taskType: string) {
    if (selected.includes(taskType)) {
      setValue(
        `conditions.items.${index}.taskTypes`,
        selected.filter((t) => t !== taskType)
      );
    } else {
      setValue(`conditions.items.${index}.taskTypes`, [...selected, taskType]);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {TASK_TYPE_OPTIONS.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => toggle(t)}
          className={`rounded-md border px-3 py-1 text-sm transition-colors ${
            selected.includes(t)
              ? "border-blue-500 bg-blue-50 text-blue-700"
              : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

const MODALITY_OPTIONS = ["vision", "audio", "image-generation"] as const;
const MODALITY_I18N_KEYS: Record<string, string> = {
  vision: "cond.modality.vision",
  audio: "cond.modality.audio",
  "image-generation": "cond.modality.imageGen",
};

function ModalitySelector({
  index,
  watch,
  setValue,
}: {
  index: number;
  watch: ConditionItemEditorProps["watch"];
  setValue: ConditionItemEditorProps["setValue"];
}) {
  const { t } = useI18n();
  const selected: string[] =
    watch(`conditions.items.${index}.modalities`) ?? [];

  function toggle(modality: string) {
    if (selected.includes(modality)) {
      setValue(
        `conditions.items.${index}.modalities`,
        selected.filter((m) => m !== modality)
      );
    } else {
      setValue(`conditions.items.${index}.modalities`, [...selected, modality]);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {MODALITY_OPTIONS.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => toggle(m)}
          className={`rounded-md border px-3 py-1 text-sm transition-colors ${
            selected.includes(m)
              ? "border-blue-500 bg-blue-50 text-blue-700"
              : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          {t(MODALITY_I18N_KEYS[m])}
        </button>
      ))}
    </div>
  );
}

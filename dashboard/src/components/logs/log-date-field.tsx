// 请求日志日期 — 文本 + 随界面语言的日历（ISSUE-V3-14）
"use client";

import { useEffect, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import { format, parseISO } from "date-fns";
import { zhCN, enUS } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import "react-day-picker/style.css";

function isoToPickerDate(iso: string): Date | undefined {
  const t = iso.trim();
  if (!t) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return undefined;
  return parseISO(`${t}T12:00:00`);
}

export function LogDateField({
  label,
  value,
  onChange,
  id,
  invalid,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  id: string;
  invalid?: boolean;
  placeholder?: string;
}) {
  const { locale, t } = useI18n();
  const dfLocale = locale === "en" ? enUS : zhCN;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const selected = isoToPickerDate(value);

  return (
    <div className="relative flex flex-col gap-1" ref={ref}>
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <div className="flex gap-1">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid}
          className="h-9 w-32 rounded-md border border-input bg-background px-2 font-mono text-sm placeholder:text-muted-foreground md:w-36"
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-input bg-background text-muted-foreground hover:bg-muted"
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={t("logs.filter.calendarOpen")}
        >
          <CalendarIcon className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {open ? (
        <div className="absolute left-0 top-full z-50 mt-1 rounded-md border border-border bg-card p-2 shadow-md">
          <DayPicker
            mode="single"
            locale={dfLocale}
            selected={selected}
            onSelect={(d) => {
              if (d) {
                onChange(format(d, "yyyy-MM-dd"));
                setOpen(false);
              }
            }}
            defaultMonth={selected}
          />
          <button
            type="button"
            className="mt-2 w-full rounded border border-input py-1.5 text-xs hover:bg-muted"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            {t("logs.filter.calendarClear")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

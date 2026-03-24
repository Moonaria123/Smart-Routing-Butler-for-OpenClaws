// 规则中英文展示 — 按控制台 locale 选择 name/nameEn 与 description/descriptionEn
import type { Locale } from "@/lib/i18n/messages";

export interface RuleBilingualFields {
  name: string;
  nameEn?: string | null;
  description?: string | null;
  descriptionEn?: string | null;
}

export function pickRuleName(rule: RuleBilingualFields, locale: Locale): string {
  if (locale === "en") {
    const en = rule.nameEn?.trim();
    return en || rule.name;
  }
  return rule.name;
}

export function pickRuleDescription(
  rule: RuleBilingualFields,
  locale: Locale,
): string | null {
  if (locale === "en") {
    const en = rule.descriptionEn?.trim();
    if (en) return en;
    return rule.description ?? null;
  }
  return rule.description ?? null;
}

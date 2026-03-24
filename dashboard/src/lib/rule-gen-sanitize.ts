// LLM 生成规则的后处理：normalize 模型引用并裁剪至白名单（ISSUE-V3-15）
import type { ModelAllowlistMaps } from "@/lib/rule-gen-allowlist";

export type RuleGenLocale = "zh" | "en";

/** 规范化 LLM 返回的 conditions，避免缺省 `items` 导致前端访问 `.items.length` 崩溃（ISSUE-V5-05） */
export function normalizeGeneratedConditions(raw: unknown): {
  combinator: string;
  items: unknown[];
} {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { combinator: "AND", items: [] };
  }
  const o = raw as Record<string, unknown>;
  const combinator =
    typeof o.combinator === "string" && o.combinator.trim()
      ? o.combinator
      : "AND";
  const items = Array.isArray(o.items) ? o.items : [];
  return { combinator, items };
}

/** 将单条模型引用解析为白名单内的 `Provider/modelId` */
export function normalizeModelRefToAllowlist(
  raw: string | undefined | null,
  maps: ModelAllowlistMaps,
): { ref: string | null; strategy: "exact" | "hyphen_map" | "bare_id" | "first_hyphen_slash" | "none" } {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return { ref: null, strategy: "none" };

  if (maps.refSet.has(s)) {
    return { ref: s, strategy: "exact" };
  }

  for (const ref of maps.refSet) {
    const hyphenForm = ref.replace(/\//g, "-");
    const underForm = ref.replace(/\//g, "_");
    if (s === hyphenForm || s === underForm) {
      return { ref, strategy: "hyphen_map" };
    }
  }

  if (!s.includes("/")) {
    const cands = maps.byBareModelId.get(s) ?? [];
    if (cands.length >= 1) {
      return { ref: cands[0]!, strategy: "bare_id" };
    }
    const hi = s.indexOf("-");
    if (hi > 0) {
      const candidate = `${s.slice(0, hi)}/${s.slice(hi + 1)}`;
      if (maps.refSet.has(candidate)) {
        return { ref: candidate, strategy: "first_hyphen_slash" };
      }
    }
    const ui = s.indexOf("_");
    if (ui > 0) {
      const candidate = `${s.slice(0, ui)}/${s.slice(ui + 1)}`;
      if (maps.refSet.has(candidate)) {
        return { ref: candidate, strategy: "first_hyphen_slash" };
      }
    }
  }

  return { ref: null, strategy: "none" };
}

function warnInvalidTarget(
  locale: RuleGenLocale,
  index: number,
  raw: string,
  fallback: string,
): string {
  if (locale === "en") {
    return `Rule #${index + 1}: invalid targetModel "${raw}" was replaced with "${fallback}".`;
  }
  return `第 ${index + 1} 条规则：非法 targetModel「${raw}」已替换为「${fallback}」。`;
}

function warnInvalidFallback(
  locale: RuleGenLocale,
  index: number,
  raw: string,
): string {
  if (locale === "en") {
    return `Rule #${index + 1}: removed invalid fallback model "${raw}".`;
  }
  return `第 ${index + 1} 条规则：已移除非法备选模型「${raw}」。`;
}

function warnAmbiguousBare(
  locale: RuleGenLocale,
  index: number,
  bare: string,
  chosen: string,
): string {
  if (locale === "en") {
    return `Rule #${index + 1}: ambiguous modelId "${bare}" matched multiple providers; using "${chosen}".`;
  }
  return `第 ${index + 1} 条规则：模型 ID「${bare}」对应多个 Provider，已选用「${chosen}」。`;
}

function pickDefaultTarget(
  preferred: string | null,
  maps: ModelAllowlistMaps,
): string | null {
  if (preferred && maps.refSet.has(preferred)) return preferred;
  if (maps.refSet.size === 0) return null;
  return [...maps.refSet].sort()[0] ?? null;
}

/**
 * 将 LLM 返回的规则数组裁剪到白名单；写入 targetModel / fallbackChain 合法值。
 */
export function sanitizeGeneratedRules(
  rules: unknown[],
  maps: ModelAllowlistMaps,
  options: { locale: RuleGenLocale; defaultTargetHint: string | null },
): { rules: Record<string, unknown>[]; warnings: string[] } {
  const warnings: string[] = [];
  const defaultRef = pickDefaultTarget(options.defaultTargetHint, maps);

  if (!defaultRef && maps.refSet.size === 0) {
    return { rules: [], warnings };
  }

  const safeDefault = defaultRef ?? [...maps.refSet].sort()[0]!;

  const out: Record<string, unknown>[] = [];

  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    if (!r || typeof r !== "object" || Array.isArray(r)) continue;
    const obj = { ...(r as Record<string, unknown>) };
    const rawTarget =
      typeof obj.targetModel === "string" ? obj.targetModel : "";
    const norm = normalizeModelRefToAllowlist(rawTarget, maps);

    if (norm.ref) {
      if (
        norm.strategy === "bare_id" &&
        (maps.byBareModelId.get(rawTarget.trim())?.length ?? 0) > 1
      ) {
        warnings.push(
          warnAmbiguousBare(options.locale, i, rawTarget.trim(), norm.ref),
        );
      }
      obj.targetModel = norm.ref;
    } else {
      if (rawTarget) {
        warnings.push(
          warnInvalidTarget(options.locale, i, rawTarget, safeDefault),
        );
      }
      obj.targetModel = safeDefault;
    }

    const chainRaw = obj.fallbackChain;
    const nextChain: string[] = [];
    if (Array.isArray(chainRaw)) {
      for (const item of chainRaw) {
        if (typeof item !== "string") continue;
        const n = normalizeModelRefToAllowlist(item, maps);
        if (n.ref) {
          if (n.ref !== obj.targetModel) nextChain.push(n.ref);
        } else if (item.trim()) {
          warnings.push(warnInvalidFallback(options.locale, i, item));
        }
      }
    }
    obj.fallbackChain = nextChain.slice(0, 8);
    obj.conditions = normalizeGeneratedConditions(obj.conditions);
    out.push(obj);
  }

  return { rules: out, warnings };
}

/** 从 LLM 原始文本中解析 JSON（兼容 markdown 代码块与前后缀文本） */
export function extractJsonFromLlmResponse(raw: string): { rules: unknown[] } {
  const normalize = (parsed: unknown): { rules: unknown[] } => {
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      const rules = (parsed as Record<string, unknown>).rules;
      if (Array.isArray(rules)) return { rules };
      return { rules: [] };
    }
    if (Array.isArray(parsed)) return { rules: parsed };
    return { rules: [] };
  };

  const tryFence = (): unknown => {
    const re = /```(?:json|JSON)?\s*\n?([\s\S]*?)```/;
    const m = raw.match(re);
    if (!m?.[1]) throw new SyntaxError("no fenced block");
    return JSON.parse(m[1].trim());
  };

  const tryObjectSlice = (): unknown => {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new SyntaxError("no object span");
    }
    return JSON.parse(raw.slice(start, end + 1));
  };

  const tryArraySlice = (): unknown => {
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start === -1 || end === -1 || end <= start) {
      throw new SyntaxError("no array span");
    }
    return JSON.parse(raw.slice(start, end + 1));
  };

  const attempts: Array<() => unknown> = [
    () => JSON.parse(raw),
    tryFence,
    tryObjectSlice,
    tryArraySlice,
  ];

  let lastErr: unknown;
  for (const fn of attempts) {
    try {
      return normalize(fn());
    } catch (e) {
      lastErr = e;
    }
  }

  const msg =
    lastErr instanceof Error ? lastErr.message : String(lastErr ?? "unknown");
  throw new Error(`Failed to extract JSON from LLM response: ${msg}`);
}

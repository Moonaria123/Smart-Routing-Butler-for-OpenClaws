// 精确规则模式：LLM 键值块 → 规则对象（ISSUE-V5-03）；不经 JSON.parse 整段规则树

/** 去掉最外层 markdown 代码围栏，便于解析 */
function stripOuterFences(raw: string): string {
  let s = raw.trim();
  const fence = /^```(?:\w+)?\s*\n?([\s\S]*?)\n?```$/m.exec(s);
  if (fence?.[1]) s = fence[1].trim();
  return s;
}

/** 将单行 `key: value` 拆成键值（仅第一个冒号分割，值内可有冒号） */
function parseLine(line: string): { key: string; value: string } | null {
  const t = line.trim();
  if (!t || t.startsWith("#")) return null;
  const i = t.indexOf(":");
  if (i <= 0) return null;
  const key = t.slice(0, i).trim();
  const value = t.slice(i + 1).trim();
  if (!key) return null;
  return { key, value };
}

function parseBool(v: string): boolean {
  const x = v.toLowerCase();
  return x === "true" || x === "1" || x === "yes";
}

function parseNum(v: string): number | undefined {
  const n = Number.parseInt(v.trim(), 10);
  return Number.isFinite(n) ? n : undefined;
}

function parseFloatNum(v: string): number | undefined {
  const n = Number.parseFloat(v.trim());
  return Number.isFinite(n) ? n : undefined;
}

/** 将单行块解析为 key-value map（键名统一小写比较） */
function blockToMap(block: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const line of block.split(/\r?\n/)) {
    const kv = parseLine(line);
    if (!kv) continue;
    m.set(kv.key.toLowerCase(), kv.value);
  }
  return m;
}

const TASK_TYPES = new Set([
  "chat",
  "coding",
  "translation",
  "summarization",
  "analysis",
  "creative",
  "math",
]);

function buildConditions(map: Map<string, string>): {
  combinator: "AND" | "OR";
  items: Array<Record<string, unknown>>;
} {
  const comb = map.get("combinator")?.toUpperCase();
  const combinator: "AND" | "OR" = comb === "OR" ? "OR" : "AND";
  const ct = (map.get("conditiontype") ?? map.get("condition_type") ?? "taskType")
    .toLowerCase()
    .trim();

  if (ct === "keywords") {
    const raw = map.get("keywords") ?? "";
    const keywords = raw
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      combinator,
      items: [
        {
          type: "keywords",
          keywords: keywords.length > 0 ? keywords : ["*"],
        },
      ],
    };
  }

  if (ct === "tokencount" || ct === "token_count") {
    const minT = map.get("mintokens");
    const maxT = map.get("maxtokens");
    const item: Record<string, unknown> = { type: "tokenCount" };
    if (minT !== undefined) {
      const n = parseNum(minT);
      if (n !== undefined) item.minTokens = n;
    }
    if (maxT !== undefined) {
      const n = parseNum(maxT);
      if (n !== undefined) item.maxTokens = n;
    }
    return { combinator, items: [item] };
  }

  if (ct === "none" || ct === "") {
    return {
      combinator,
      items: [{ type: "taskType", taskTypes: ["chat"] }],
    };
  }

  // default taskType
  const raw = map.get("tasktypes") ?? map.get("task_types") ?? "chat";
  const taskTypes = raw
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((t) => TASK_TYPES.has(t));
  return {
    combinator,
    items: [
      {
        type: "taskType",
        taskTypes: taskTypes.length > 0 ? taskTypes : ["chat"],
      },
    ],
  };
}

/** 单条键值块 → 单条规则对象（供 sanitize 使用） */
export function structuredBlockToRule(map: Map<string, string>): Record<
  string,
  unknown
> | null {
  const name = map.get("name")?.trim();
  const targetModel = map.get("targetmodel")?.trim();
  if (!name || !targetModel) return null;

  const nameEn = map.get("nameen")?.trim() ?? name;
  const priority = parseNum(map.get("priority") ?? "500") ?? 500;
  const enabled =
    map.has("enabled") ? parseBool(map.get("enabled")!) : true;

  const fbRaw = map.get("fallbackchain") ?? map.get("fallback_chain") ?? "";
  const fallbackChain = fbRaw
    .split(/[|｜]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);

  const description = map.get("description")?.trim() ?? "";
  const descriptionEn =
    map.get("descriptionen")?.trim() ?? description;

  const confidence = parseFloatNum(map.get("confidence") ?? "0.85") ?? 0.85;

  const conditions = buildConditions(map);

  return {
    name,
    nameEn,
    priority: Math.min(1000, Math.max(0, priority)),
    enabled,
    conditions,
    targetModel,
    fallbackChain,
    description,
    descriptionEn,
    confidence,
  };
}

/**
 * 从 LLM 文本解析多条规则：块之间用单独一行的 `---` 分隔；也可整块无分隔符作单条。
 */
export function parseStructuredRulesFromLlm(raw: string): Record<
  string,
  unknown
>[] {
  const text = stripOuterFences(raw);
  if (!text) {
    throw new Error("empty structured response");
  }

  const chunks = text
    .split(/\r?\n-{3,}\s*\r?\n/)
    .map((c) => c.trim())
    .filter(Boolean);

  const rules: Record<string, unknown>[] = [];
  for (const chunk of chunks) {
    const map = blockToMap(chunk);
    const rule = structuredBlockToRule(map);
    if (rule) rules.push(rule);
  }

  if (rules.length === 0) {
    throw new Error("no valid rule blocks (need name + targetModel per block)");
  }
  return rules;
}

// NL/问卷向导 LLM 系统提示词 — 按界面语言切换（ISSUE-V3-16）
import type { RuleGenLocale } from "@/lib/rule-gen-sanitize";

function truncateAllowlistBlock(lines: string[], maxChars: number): string {
  const body = lines.join("\n");
  if (body.length <= maxChars) return body;
  return `${body.slice(0, maxChars)}\n…`;
}

/** 将白名单注入提示词（完整列表，过长时截断并保留前缀） */
export function formatAllowlistForPrompt(refs: string[]): string {
  const sorted = [...refs].sort();
  return truncateAllowlistBlock(
    sorted.map((r) => `- ${r}`),
    24_000,
  );
}

const WIZARD_ZH = `你是一个 AI 路由规则配置助手。根据用户的需求生成路由规则列表。
每条规则必须严格遵循以下 JSON 结构（必须同时包含中英文名称与描述）：
{
  "name": "规则名称（简体中文）",
  "nameEn": "Rule name in English",
  "priority": 500,
  "enabled": true,
  "conditions": {
    "combinator": "AND",
    "items": [
      { "type": "taskType", "taskTypes": ["coding"] }
    ]
  },
  "targetModel": "Provider名称/modelId",
  "fallbackChain": ["Provider名称/另一模型Id"],
  "description": "规则描述（简体中文）",
  "descriptionEn": "Rule description in English"
}

【硬约束】targetModel 与 fallbackChain 中的每一项必须是下面「允许列表」中的某一行，格式 exactly 为 Provider名称/modelId（正斜杠 / 分隔）。禁止使用 provider-model、裸 modelId（除非该 ID 在列表中唯一对应一条）、或列表外的幻觉模型名。
条件类型（type）可选值:
- "keywords": 关键词匹配，需要 keywords 字段（字符串数组）
- "tokenCount": Token 数量范围，需要 minTokens 和/或 maxTokens 字段
- "taskType": 任务类型匹配，需要 taskTypes 字段（可选值: chat, coding, translation, summarization, analysis, creative, math）
- "maxCost": 最大成本限制，需要 maxCostPerMillion 字段
- "providerHealth": Provider 健康状态，需要 providerName 和 healthStatus 字段

返回 JSON 格式: { "rules": [...] }
确保 priority 范围为 0-1000，高优先级规则 priority 值更大。
每个使用场景至少生成一条规则。

【当前允许使用的模型（白名单）】
`;

const WIZARD_EN = `You are an AI assistant that generates Smart Router Butler rules from user requirements.
Each rule MUST follow this JSON shape. Because the user interface is **English**, every human-readable field MUST be written in **English** (ISSUE-V5-06):
{
  "name": "Short English rule title (primary label for en UI)",
  "nameEn": "Same English title (duplicate is OK)",
  "priority": 500,
  "enabled": true,
  "conditions": {
    "combinator": "AND",
    "items": [
      { "type": "taskType", "taskTypes": ["coding"] }
    ]
  },
  "targetModel": "ProviderName/modelId",
  "fallbackChain": ["ProviderName/otherModelId"],
  "description": "English description of when this rule applies",
  "descriptionEn": "English description (may duplicate description)"
}

【Hard constraint】targetModel and every fallbackChain entry MUST be copied exactly from the allowlist below, using ProviderName/modelId with a single slash. Do NOT use "provider-model", invented vendor strings, or any ID not in the list.

Condition types (type):
- "keywords" → keywords: string[]
- "tokenCount" → minTokens and/or maxTokens
- "taskType" → taskTypes: chat | coding | translation | summarization | analysis | creative | math
- "maxCost" → maxCostPerMillion
- "providerHealth" → providerName, healthStatus

Return JSON: { "rules": [...] }. priority in 0-1000 (higher = higher priority). At least one rule per selected use case.

【Allowlisted models】
`;

const NL_ZH = `你是一个 AI 路由规则解析器。将用户的自然语言描述转换为结构化路由规则。

每条规则必须同时包含中英文名称与描述：
- name / nameEn, priority (0-1000), enabled: true
- conditions: { combinator: "AND" | "OR", items: [...] }
- targetModel: 必须是下方「允许列表」中的完整 Provider名称/modelId（正斜杠），禁止幻觉或未配置的模型
- fallbackChain: 仅包含允许列表中的 Provider名称/modelId，最多 3～8 个
- description / descriptionEn
- confidence: 0-1

条件类型（type）：
- "keywords" → keywords: string[]
- "tokenCount" → minTokens / maxTokens
- "taskType" → taskTypes: chat, coding, translation, summarization, analysis, creative, math
- "maxCost" → maxCostPerMillion
- "maxLatency" → maxLatencyMs
- "providerHealth" → providerName, healthStatus

若描述模糊，降低 confidence。若含多条规则则拆分。
返回 JSON: { "rules": [...] }

【当前允许使用的模型（白名单）】
`;

const NL_EN = `You parse natural language into Smart Router Butler rules. The Dashboard is in **English**: write **name**, **nameEn**, **description**, and **descriptionEn** entirely in **English** (they may duplicate across pairs when helpful). Include priority 0-1000, enabled: true, **conditions** with **combinator** and a non-empty **items** array whenever possible, and confidence 0-1.

【Hard constraint】targetModel and fallbackChain entries MUST be exact entries from the allowlist below (ProviderName/modelId with one slash). No invented providers or misspelled IDs.

Return JSON: { "rules": [...] }

【Allowlisted models】
`;

export function getWizardSystemPrompt(
  locale: RuleGenLocale,
  allowlistRefs: string[],
): string {
  const base = locale === "en" ? WIZARD_EN : WIZARD_ZH;
  return `${base}\n${formatAllowlistForPrompt(allowlistRefs)}\n`;
}

export function getNlSystemPrompt(
  locale: RuleGenLocale,
  allowlistRefs: string[],
): string {
  const base = locale === "en" ? NL_EN : NL_ZH;
  return `${base}\n${formatAllowlistForPrompt(allowlistRefs)}\n`;
}

/** 精确规则模式（ISSUE-V5-03）：仅输出键值块，禁止 JSON */
const STRUCTURED_NL_ZH = `你是路由规则助手。用户将用自然语言描述需求；你必须把结果写成**纯文本键值块**，禁止输出 JSON、禁止 markdown 代码围栏。

每条规则一个块；多条规则之间用**单独一行**只含三个横线分隔：
---
（块与块之间如上）

每个块内每行格式：**英文键名: 值**（冒号后一个空格可选）。允许的键：
- name: （简体中文规则名）
- nameEn: （英文规则名）
- priority: （0-1000 的整数）
- enabled: true 或 false
- targetModel: 必须从下方白名单**原样复制一行**（Provider名称/modelId）
- fallbackChain: 多个模型用竖线 | 分隔，每一项也须为白名单中的完整一行；可无此项
- description: 中文描述
- descriptionEn: 英文描述
- combinator: AND 或 OR
- conditionType: taskType | keywords | tokenCount | none
- taskTypes: 逗号分隔，仅当 conditionType 为 taskType；合法值含 chat,coding,translation,summarization,analysis,creative,math
- keywords: 逗号分隔关键词，仅当 conditionType 为 keywords
- minTokens / maxTokens: 整数，仅当 conditionType 为 tokenCount 时使用
- confidence: 0 到 1 的小数

conditionType 为 none 时可用 taskTypes 省略（系统默认 chat）。**不要**输出 { } 或 [ ]。

【白名单 — targetModel / fallbackChain 只能从中复制】
`;

const STRUCTURED_NL_EN = `You are a routing rules assistant. Convert the user's request into **plain key:value blocks only**. Do NOT output JSON. Do NOT wrap in markdown code fences.

One block per rule. Separate multiple rules with a line containing only three dashes:
---

Allowed keys per block (English key names):
- name, nameEn, priority (0-1000), enabled (true/false)
- targetModel: MUST copy exactly one line from the allowlist below (ProviderName/modelId)
- fallbackChain: optional, pipe-separated full allowlist entries
- description, descriptionEn, combinator (AND|OR), confidence (0-1)
- conditionType: taskType | keywords | tokenCount | none
- taskTypes: comma-separated when conditionType is taskType
- keywords: comma-separated when conditionType is keywords
- minTokens, maxTokens: integers for tokenCount

【Allowlist — copy only from here】
`;

const STRUCTURED_WIZARD_ZH = `你是路由规则助手。根据用户问卷答案生成路由规则，输出格式为**纯文本键值块**，禁止 JSON、禁止代码围栏。

规则分隔与键名说明同「自然语言精确模式」。每条规则一个块，块之间单独一行 ---。

【白名单 — targetModel / fallbackChain 只能从中复制】
`;

const STRUCTURED_WIZARD_EN = `You are a routing rules assistant. From the wizard answers, produce rules as **plain key:value blocks only**. No JSON. No markdown fences.

Separate rules with a line of three dashes. Same keys as the NL structured mode.

【Allowlist — copy only from here】
`;

export function getNlStructuredSystemPrompt(
  locale: RuleGenLocale,
  allowlistRefs: string[],
): string {
  const base = locale === "en" ? STRUCTURED_NL_EN : STRUCTURED_NL_ZH;
  return `${base}\n${formatAllowlistForPrompt(allowlistRefs)}\n`;
}

export function getWizardStructuredSystemPrompt(
  locale: RuleGenLocale,
  allowlistRefs: string[],
): string {
  const base = locale === "en" ? STRUCTURED_WIZARD_EN : STRUCTURED_WIZARD_ZH;
  return `${base}\n${formatAllowlistForPrompt(allowlistRefs)}\n`;
}

export function parseRuleGenLocale(raw: unknown): RuleGenLocale {
  return raw === "en" ? "en" : "zh";
}

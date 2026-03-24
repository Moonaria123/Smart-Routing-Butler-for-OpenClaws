// L1 taskType 启发式检测与别名归一——无 DB 依赖，供 ruleEngine 与单测复用（ISSUE-V4-05）

/** 规则条件里历史别名 → L1 规范 taskType */
const TASK_TYPE_ALIASES: Readonly<Record<string, string>> = {
  coding: "code",
  code_gen: "code",
  codegen: "code",
  dev: "code",
  development: "code",
  summary: "summarization",
  summarise: "summarization",
  summarisation: "summarization",
  translate: "translation",
  analyzer: "analysis",
  analysing: "analysis",
  maths: "math",
  mathematics: "math",
};

export function normalizeTaskTypeLabel(raw: string): string {
  const k = raw.trim().toLowerCase();
  return TASK_TYPE_ALIASES[k] ?? k;
}

const TASK_PATTERNS: readonly [string, RegExp][] = [
  [
    "code",
    /\b(code|function|class|debug|bug|fix|implement|algorithm|api|programming|compile|syntax|variable|loop|array|import|export|refactor|typescript|javascript|python|java|rust|go|cpp|sql)\b|(?:写代码|编程实现|调试这段|实现一个函数|帮我写个类|重构这段)/i,
  ],
  [
    "translation",
    /\b(translate|translation|翻译|转换为|translate\s+to)\b/i,
  ],
  [
    "summarization",
    /\b(summarize|summary|总结|摘要|概括|归纳|tl;?dr)\b/i,
  ],
  [
    "writing",
    /\b(write|essay|article|blog|story|poem|writing|写作|撰写|文章|故事)\b/i,
  ],
  [
    "analysis",
    /\b(analyze|analysis|分析|evaluate|评估|compare|对比)\b/i,
  ],
  [
    "math",
    /\b(math|calculate|equation|数学|计算|formula|公式|integral|derivative|证明|prove)\b/i,
  ],
];

/** 同步启发式 taskType（含中文短语） */
export function detectTaskType(text: string): string {
  for (const [taskType, pattern] of TASK_PATTERNS) {
    if (pattern.test(text)) return taskType;
  }
  return "general";
}

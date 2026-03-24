// AI 问卷向导 API — 接收向导答案，调用 LLM 生成路由规则（V3-15/16/17）
import { NextResponse } from "next/server";

export const maxDuration = 180;
import { requireSession } from "@/lib/auth-guard";
import { callLLM } from "@/lib/llm";
import { loadEnabledModelAllowlist } from "@/lib/rule-gen-allowlist";
import {
  getResolvedRuleGenerationModel,
  getRuleGenerationTemperature,
} from "@/lib/rule-generation-model";
import {
  getWizardStructuredSystemPrompt,
  getWizardSystemPrompt,
  parseRuleGenLocale,
} from "@/lib/rule-gen-prompts";
import { parseStructuredRulesFromLlm } from "@/lib/rule-gen-structured";
import {
  extractJsonFromLlmResponse,
  sanitizeGeneratedRules,
} from "@/lib/rule-gen-sanitize";
import { z } from "zod";

const wizardSchema = z.object({
  locale: z.enum(["zh", "en"]).optional(),
  mode: z.enum(["json", "structured"]).optional(),
  answers: z.object({
    useCases: z.array(z.string()).min(1),
    prioritizeCost: z.boolean(),
    prioritizeSpeed: z.boolean(),
    providers: z.array(z.string()),
    preferredModels: z.array(z.string()),
    budget: z.number().optional(),
  }),
});

function buildWizardUserPrompt(
  locale: ReturnType<typeof parseRuleGenLocale>,
  answers: z.infer<typeof wizardSchema>["answers"],
): string {
  if (locale === "en") {
    return [
      "Generate routing rules from this configuration:",
      `- Use cases: ${answers.useCases.join(", ")}`,
      `- Prioritize cost: ${answers.prioritizeCost ? "yes" : "no"}`,
      `- Prioritize speed: ${answers.prioritizeSpeed ? "yes" : "no"}`,
      `- Available providers: ${answers.providers.join(", ")}`,
      `- Preferred models (IDs): ${answers.preferredModels.join(", ")}`,
      answers.budget !== undefined ? `- Monthly budget: USD ${answers.budget}` : "",
      "",
      "Produce at least one rule per use case with sensible priorities and models from the allowlist only.",
      "All rule titles and descriptions must be written in English.",
    ]
      .filter(Boolean)
      .join("\n");
  }
  return [
    "根据以下配置需求生成路由规则：",
    `- 使用场景: ${answers.useCases.join("、")}`,
    `- 优先成本: ${answers.prioritizeCost ? "是" : "否"}`,
    `- 优先速度: ${answers.prioritizeSpeed ? "是" : "否"}`,
    `- 可用 Provider: ${answers.providers.join("、")}`,
    `- 首选模型: ${answers.preferredModels.join("、")}`,
    answers.budget !== undefined ? `- 月度预算: $${answers.budget}` : "",
    "",
    "请为每个使用场景生成至少一条路由规则，合理分配模型和优先级；模型必须从系统白名单中选择。",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function POST(request: Request) {
  const { session, error } = await requireSession();
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "请求体解析失败" },
      { status: 400 },
    );
  }

  const parsed = wizardSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "参数验证失败", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const locale = parseRuleGenLocale(parsed.data.locale);
  const genMode = parsed.data.mode === "structured" ? "structured" : "json";
  const { answers } = parsed.data;

  const allowlist = await loadEnabledModelAllowlist();
  if (allowlist.refSet.size === 0) {
    return NextResponse.json(
      {
        rules: [],
        warnings: [],
        error:
          locale === "en"
            ? "No enabled model is configured. Add a provider and model first."
            : "当前没有已启用的模型，请先在 Provider 管理中添加并启用模型。",
      },
      { status: 400 },
    );
  }

  const model = await getResolvedRuleGenerationModel();
  const temperature = await getRuleGenerationTemperature();
  const systemPrompt =
    genMode === "structured"
      ? getWizardStructuredSystemPrompt(locale, [...allowlist.refSet])
      : getWizardSystemPrompt(locale, [...allowlist.refSet]);
  const userPrompt = buildWizardUserPrompt(locale, answers);

  const result = await callLLM(
    {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      model: model ?? undefined,
      jsonMode: genMode === "json",
      temperature,
    },
    session!.user.id,
  );

  if (result.error) {
    return NextResponse.json({
      rules: [],
      warnings: [],
      error: result.error,
      generationMode: genMode,
    });
  }

  try {
    const rawRules =
      genMode === "structured"
        ? parseStructuredRulesFromLlm(result.content)
        : (() => {
            const data = extractJsonFromLlmResponse(result.content);
            return Array.isArray(data.rules) ? data.rules : [];
          })();
    const { rules, warnings } = sanitizeGeneratedRules(rawRules, allowlist, {
      locale,
      defaultTargetHint: model,
    });
    return NextResponse.json({ rules, warnings, generationMode: genMode });
  } catch (err) {
    const content = result.content;
    const label =
      genMode === "structured"
        ? "[rule-gen] parseStructuredRulesFromLlm failed"
        : "[rule-gen] extractJsonFromLlmResponse failed";
    console.warn(label, {
      contentLength: content.length,
      contentPreview: content.slice(0, 100),
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({
      rules: [],
      warnings: [],
      generationMode: genMode,
      error:
        genMode === "structured"
          ? locale === "en"
            ? "Failed to parse structured rule blocks"
            : "精确模式解析失败，请确认输出为键值块且含 name 与 targetModel"
          : locale === "en"
            ? "Failed to parse LLM response"
            : "LLM 返回格式解析失败",
    });
  }
}

// 自然语言规则生成 API — 解析自然语言为结构化路由规则（V3-15/16/17）
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
  getNlStructuredSystemPrompt,
  getNlSystemPrompt,
  parseRuleGenLocale,
} from "@/lib/rule-gen-prompts";
import { parseStructuredRulesFromLlm } from "@/lib/rule-gen-structured";
import {
  extractJsonFromLlmResponse,
  sanitizeGeneratedRules,
} from "@/lib/rule-gen-sanitize";
import { z } from "zod";

const inputSchema = z.object({
  text: z.string().min(1, "描述不能为空").max(2000),
  locale: z.enum(["zh", "en"]).optional(),
  /** json=默认；structured=精确规则模式（键值块，ISSUE-V5-03） */
  mode: z.enum(["json", "structured"]).optional(),
});

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

  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "参数验证失败", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const locale = parseRuleGenLocale(parsed.data.locale);
  const genMode = parsed.data.mode === "structured" ? "structured" : "json";
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
      ? getNlStructuredSystemPrompt(locale, [...allowlist.refSet])
      : getNlSystemPrompt(locale, [...allowlist.refSet]);
  const userContent =
    locale === "en"
      ? `Convert the following description into routing rules. Use English for all rule names and descriptions.\n\n${parsed.data.text}`
      : `请将以下描述转换为路由规则：\n${parsed.data.text}`;

  const result = await callLLM(
    {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
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

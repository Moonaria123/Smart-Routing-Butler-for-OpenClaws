// 规则生成（NL/问卷）所用模型与采样温度 — GET/PUT system_config（ISSUE-V3-12 / V3-17）
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import {
  DEFAULT_RULE_GENERATION_TEMPERATURE,
  parseRuleGenerationStored,
  parseRuleGenerationTemperature,
  RULE_GENERATION_TARGET_MODEL_KEY,
  RULE_GENERATION_TEMPERATURE_KEY,
  validateProxyModelId,
} from "@/lib/rule-generation-model";

const putSchema = z.object({
  useDefault: z.boolean().optional(),
  targetModel: z.string().min(1).optional(),
  temperature: z.number().min(0).max(2).optional(),
});

async function getRuleGenerationConfigJson() {
  const [rowModel, rowTemp] = await Promise.all([
    db.systemConfig.findUnique({
      where: { key: RULE_GENERATION_TARGET_MODEL_KEY },
    }),
    db.systemConfig.findUnique({
      where: { key: RULE_GENERATION_TEMPERATURE_KEY },
    }),
  ]);
  const targetModel = parseRuleGenerationStored(rowModel?.value);
  const tRaw = parseRuleGenerationTemperature(rowTemp?.value);
  const temperature =
    tRaw !== null && tRaw >= 0 && tRaw <= 2
      ? tRaw
      : DEFAULT_RULE_GENERATION_TEMPERATURE;
  return {
    useDefault: targetModel === null,
    targetModel,
    temperature,
  };
}

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const body = await getRuleGenerationConfigJson();
  return NextResponse.json(body);
}

export async function PUT(request: Request) {
  const { error } = await requireSession();
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体解析失败" }, { status: 400 });
  }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "参数验证失败", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { useDefault, targetModel, temperature } = parsed.data;
  if (
    useDefault === undefined &&
    targetModel === undefined &&
    temperature === undefined
  ) {
    return NextResponse.json(
      { error: "至少需要提供 useDefault、targetModel 或 temperature 之一" },
      { status: 400 },
    );
  }

  if (temperature !== undefined) {
    await db.systemConfig.upsert({
      where: { key: RULE_GENERATION_TEMPERATURE_KEY },
      create: {
        key: RULE_GENERATION_TEMPERATURE_KEY,
        value: { temperature },
      },
      update: { value: { temperature } },
    });
  }

  if (useDefault !== undefined) {
    if (useDefault) {
      await db.systemConfig.deleteMany({
        where: { key: RULE_GENERATION_TARGET_MODEL_KEY },
      });
    } else {
      const tm = targetModel?.trim();
      if (!tm) {
        return NextResponse.json(
          {
            error:
              "指定模型时须提供 targetModel（Provider名称/modelId）",
          },
          { status: 400 },
        );
      }
      const ok = await validateProxyModelId(tm);
      if (!ok) {
        return NextResponse.json(
          { error: "目标模型不存在或未启用，请从下拉框选择" },
          { status: 400 },
        );
      }
      await db.systemConfig.upsert({
        where: { key: RULE_GENERATION_TARGET_MODEL_KEY },
        create: {
          key: RULE_GENERATION_TARGET_MODEL_KEY,
          value: { targetModel: tm },
        },
        update: { value: { targetModel: tm } },
      });
    }
  }

  const next = await getRuleGenerationConfigJson();
  return NextResponse.json(next);
}

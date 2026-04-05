// 单个模型更新与删除
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth-guard";
import { logServerError } from "@/lib/server-logger";

type RouteCtx = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  modelId: z.string().min(1).max(200).optional(),
  alias: z.string().max(200).optional().nullable(),
  contextWindow: z.number().int().min(1).optional(),
  inputCost: z.number().min(0).optional(),
  outputCost: z.number().min(0).optional(),
  enabled: z.boolean().optional(),
  supportsThinking: z.boolean().optional(),
  defaultThinking: z.object({
    enabled: z.boolean().optional().default(false),
    budget_tokens: z.number().int().positive().nullable().optional().default(null),
  }).optional(),
  features: z.array(z.string()).optional(),
});

export async function PUT(request: NextRequest, ctx: RouteCtx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体解析失败" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "参数校验失败" },
      { status: 400 }
    );
  }

  const existing = await db.model.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "模型不存在" }, { status: 404 });
  }

  try {
    const model = await db.model.update({
      where: { id },
      data: {
        ...(parsed.data.modelId !== undefined && { modelId: parsed.data.modelId }),
        ...(parsed.data.alias !== undefined && { alias: parsed.data.alias }),
        ...(parsed.data.contextWindow !== undefined && {
          contextWindow: parsed.data.contextWindow,
        }),
        ...(parsed.data.inputCost !== undefined && { inputCost: parsed.data.inputCost }),
        ...(parsed.data.outputCost !== undefined && { outputCost: parsed.data.outputCost }),
        ...(parsed.data.enabled !== undefined && { enabled: parsed.data.enabled }),
        ...(parsed.data.supportsThinking !== undefined && { supportsThinking: parsed.data.supportsThinking }),
        ...(parsed.data.defaultThinking !== undefined && { defaultThinking: parsed.data.defaultThinking as object }),
        ...(parsed.data.features !== undefined && { features: parsed.data.features }),
      },
    });
    return NextResponse.json(model);
  } catch (e) {
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "该 Provider 下已存在相同 modelId" },
        { status: 409 }
      );
    }
    logServerError("models/[id] PUT", e);
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, ctx: RouteCtx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await ctx.params;

  const existing = await db.model.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "模型不存在" }, { status: 404 });
  }

  await db.model.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

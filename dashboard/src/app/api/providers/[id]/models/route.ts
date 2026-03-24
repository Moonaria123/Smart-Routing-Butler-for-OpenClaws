// Provider 下模型列表与新增 — 供 Provider 管理页与向导使用
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth-guard";
import { logServerError } from "@/lib/server-logger";

type RouteCtx = { params: Promise<{ id: string }> };

const createSchema = z.object({
  modelId: z.string().min(1, "modelId 不能为空").max(200),
  alias: z.string().max(200).optional().nullable(),
  contextWindow: z.number().int().min(1).optional().default(128000),
  inputCost: z.number().min(0).optional().default(0),
  outputCost: z.number().min(0).optional().default(0),
  enabled: z.boolean().optional().default(true),
});

export async function GET(_request: NextRequest, ctx: RouteCtx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id: providerId } = await ctx.params;

  const provider = await db.provider.findUnique({
    where: { id: providerId },
    select: { id: true },
  });
  if (!provider) {
    return NextResponse.json({ error: "Provider 不存在" }, { status: 404 });
  }

  const models = await db.model.findMany({
    where: { providerId },
    orderBy: { modelId: "asc" },
    select: {
      id: true,
      modelId: true,
      alias: true,
      contextWindow: true,
      inputCost: true,
      outputCost: true,
      enabled: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(models);
}

export async function POST(request: NextRequest, ctx: RouteCtx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id: providerId } = await ctx.params;

  const provider = await db.provider.findUnique({
    where: { id: providerId },
    select: { id: true },
  });
  if (!provider) {
    return NextResponse.json({ error: "Provider 不存在" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体解析失败" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "参数校验失败" },
      { status: 400 }
    );
  }

  try {
    const model = await db.model.create({
      data: {
        providerId,
        modelId: parsed.data.modelId,
        alias: parsed.data.alias ?? null,
        contextWindow: parsed.data.contextWindow,
        inputCost: parsed.data.inputCost,
        outputCost: parsed.data.outputCost,
        enabled: parsed.data.enabled,
        defaultParams: {},
        features: [],
      },
    });
    return NextResponse.json(model, { status: 201 });
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
    logServerError("providers/[id]/models POST", e);
    return NextResponse.json({ error: "创建失败" }, { status: 500 });
  }
}

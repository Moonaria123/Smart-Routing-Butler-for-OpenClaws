// Provider 更新 + 删除 API — 更新时 apiKey 可选
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { requireSession } from "@/lib/auth-guard";
import { logServerError } from "@/lib/server-logger";

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().min(1).optional(),
  apiType: z.enum(["openai", "anthropic", "openai-compatible"]).optional(),
  enabled: z.boolean().optional(),
});

type RouteCtx = { params: Promise<{ id: string }> };

export async function PUT(request: Request, ctx: RouteCtx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await ctx.params;

  try {
    const body: unknown = await request.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { apiKey, ...rest } = parsed.data;
    const data: Record<string, unknown> = { ...rest };
    if (apiKey) {
      data.apiKey = encrypt(apiKey);
    }

    const provider = await db.provider.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        baseUrl: true,
        apiType: true,
        enabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(provider);
  } catch (e) {
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code: string }).code === "P2025"
    ) {
      return NextResponse.json({ error: "Provider 不存在" }, { status: 404 });
    }
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code: string }).code === "P2002"
    ) {
      return NextResponse.json({ error: "该名称已被使用" }, { status: 409 });
    }
    logServerError("providers/[id] PUT", e);
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, ctx: RouteCtx) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await ctx.params;

  try {
    await db.provider.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code: string }).code === "P2025"
    ) {
      return NextResponse.json({ error: "Provider 不存在" }, { status: 404 });
    }
    logServerError("providers/[id] DELETE", e);
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
}

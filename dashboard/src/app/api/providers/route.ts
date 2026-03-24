// Provider 列表 + 创建 API — 列表不返回 apiKey；?includeModels=1 时附带模型列表（向导等）
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { requireSession } from "@/lib/auth-guard";
import { logServerError } from "@/lib/server-logger";

const createSchema = z.object({
  name: z.string().min(1, "名称不能为空").max(100),
  baseUrl: z.string().url("请输入合法的 URL"),
  apiKey: z.string().min(1, "API Key 不能为空"),
  apiType: z.enum(["openai", "anthropic", "openai-compatible"]),
  enabled: z.boolean().optional().default(true),
});

export async function GET(request: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const includeModels =
    request.nextUrl.searchParams.get("includeModels") === "1" ||
    request.nextUrl.searchParams.get("includeModels") === "true";

  try {
    const providers = await db.provider.findMany({
      orderBy: { createdAt: "desc" },
      select: includeModels
        ? {
            id: true,
            name: true,
            baseUrl: true,
            apiType: true,
            enabled: true,
            createdAt: true,
            updatedAt: true,
            models: {
              orderBy: { modelId: "asc" },
              select: {
                id: true,
                modelId: true,
                alias: true,
                enabled: true,
                inputCost: true,
                outputCost: true,
                contextWindow: true,
              },
            },
          }
        : {
            id: true,
            name: true,
            baseUrl: true,
            apiType: true,
            enabled: true,
            createdAt: true,
            updatedAt: true,
            _count: { select: { models: true } },
          },
    });

    return NextResponse.json(providers);
  } catch (e) {
    logServerError("providers/GET", e);
    return NextResponse.json(
      { error: "数据加载失败" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const { error } = await requireSession();
  if (error) return error;

  try {
    const body: unknown = await request.json();
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { name, baseUrl, apiKey, apiType, enabled } = parsed.data;
    const encryptedKey = encrypt(apiKey);

    const provider = await db.provider.create({
      data: { name, baseUrl, apiKey: encryptedKey, apiType, enabled },
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

    return NextResponse.json(provider, { status: 201 });
  } catch (e) {
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "该 Provider 名称已存在" },
        { status: 409 }
      );
    }
    logServerError("providers/POST", e);
    return NextResponse.json(
      { error: "创建失败，请稍后重试" },
      { status: 500 }
    );
  }
}

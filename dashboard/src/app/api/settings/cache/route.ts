// 缓存配置 API — 读取与更新缓存 TTL 设置
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { z } from "zod";

const updateSchema = z.object({
  exactCacheTtl: z.number().int().min(0).max(604800).optional(),
  semanticCacheTtl: z.number().int().min(0).max(604800).optional(),
});

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const configs = await db.systemConfig.findMany({
    where: { key: { in: ["exact_cache_ttl", "semantic_cache_ttl"] } },
  });

  const result = { exactCacheTtl: 86400, semanticCacheTtl: 86400 };

  for (const c of configs) {
    const val = c.value as { seconds?: number };
    if (c.key === "exact_cache_ttl" && typeof val.seconds === "number") {
      result.exactCacheTtl = val.seconds;
    }
    if (c.key === "semantic_cache_ttl" && typeof val.seconds === "number") {
      result.semanticCacheTtl = val.seconds;
    }
  }

  return NextResponse.json(result);
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

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "参数验证失败", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const updates: Promise<unknown>[] = [];

  if (parsed.data.exactCacheTtl !== undefined) {
    updates.push(
      db.systemConfig.upsert({
        where: { key: "exact_cache_ttl" },
        create: {
          key: "exact_cache_ttl",
          value: { seconds: parsed.data.exactCacheTtl },
        },
        update: { value: { seconds: parsed.data.exactCacheTtl } },
      })
    );
  }

  if (parsed.data.semanticCacheTtl !== undefined) {
    updates.push(
      db.systemConfig.upsert({
        where: { key: "semantic_cache_ttl" },
        create: {
          key: "semantic_cache_ttl",
          value: { seconds: parsed.data.semanticCacheTtl },
        },
        update: { value: { seconds: parsed.data.semanticCacheTtl } },
      })
    );
  }

  await Promise.all(updates);

  return NextResponse.json({ ok: true });
}

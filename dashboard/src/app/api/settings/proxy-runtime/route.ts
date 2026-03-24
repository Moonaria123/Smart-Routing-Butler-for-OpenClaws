// Proxy 运行时配置（L0.5 超时、L1 fallback、L2/L3 开关）— system_config + Redis 通知（ISSUE-V4-03 / V4-04 / V5-09）
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { publishProxyConfigUpdate } from "@/lib/redis";
import { z } from "zod";

const putSchema = z.object({
  semanticCacheCheckTimeoutMs: z.number().int().min(10).max(200).optional(),
  fallbackOnInvalidL1Target: z.boolean().optional(),
  routingEnableL2: z.boolean().optional(),
  routingEnableL3: z.boolean().optional(),
});

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const rows = await db.systemConfig.findMany({
    where: {
      key: {
        in: [
          "semantic_cache_check_timeout_ms",
          "fallback_on_invalid_l1_target",
          "routing_enable_l2",
          "routing_enable_l3",
        ],
      },
    },
  });

  let semanticCacheCheckTimeoutMs = 55;
  let fallbackOnInvalidL1Target = false;
  let routingEnableL2 = true;
  let routingEnableL3 = true;

  for (const r of rows) {
    if (r.key === "semantic_cache_check_timeout_ms") {
      const v = r.value as { ms?: number };
      if (typeof v.ms === "number") semanticCacheCheckTimeoutMs = v.ms;
    }
    if (r.key === "fallback_on_invalid_l1_target") {
      const v = r.value as { enabled?: boolean };
      if (typeof v.enabled === "boolean") fallbackOnInvalidL1Target = v.enabled;
    }
    if (r.key === "routing_enable_l2") {
      const v = r.value as { enabled?: boolean };
      if (typeof v.enabled === "boolean") routingEnableL2 = v.enabled;
    }
    if (r.key === "routing_enable_l3") {
      const v = r.value as { enabled?: boolean };
      if (typeof v.enabled === "boolean") routingEnableL3 = v.enabled;
    }
  }

  return NextResponse.json({
    semanticCacheCheckTimeoutMs,
    fallbackOnInvalidL1Target,
    routingEnableL2,
    routingEnableL3,
  });
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
      { status: 400 }
    );
  }

  const ops: Promise<unknown>[] = [];

  if (parsed.data.semanticCacheCheckTimeoutMs !== undefined) {
    ops.push(
      db.systemConfig.upsert({
        where: { key: "semantic_cache_check_timeout_ms" },
        create: {
          key: "semantic_cache_check_timeout_ms",
          value: { ms: parsed.data.semanticCacheCheckTimeoutMs },
        },
        update: { value: { ms: parsed.data.semanticCacheCheckTimeoutMs } },
      })
    );
  }

  if (parsed.data.fallbackOnInvalidL1Target !== undefined) {
    ops.push(
      db.systemConfig.upsert({
        where: { key: "fallback_on_invalid_l1_target" },
        create: {
          key: "fallback_on_invalid_l1_target",
          value: { enabled: parsed.data.fallbackOnInvalidL1Target },
        },
        update: { value: { enabled: parsed.data.fallbackOnInvalidL1Target } },
      })
    );
  }

  if (parsed.data.routingEnableL2 !== undefined) {
    ops.push(
      db.systemConfig.upsert({
        where: { key: "routing_enable_l2" },
        create: {
          key: "routing_enable_l2",
          value: { enabled: parsed.data.routingEnableL2 },
        },
        update: { value: { enabled: parsed.data.routingEnableL2 } },
      })
    );
  }

  if (parsed.data.routingEnableL3 !== undefined) {
    ops.push(
      db.systemConfig.upsert({
        where: { key: "routing_enable_l3" },
        create: {
          key: "routing_enable_l3",
          value: { enabled: parsed.data.routingEnableL3 },
        },
        update: { value: { enabled: parsed.data.routingEnableL3 } },
      })
    );
  }

  if (ops.length === 0) {
    return NextResponse.json({ error: "无变更字段" }, { status: 400 });
  }

  await Promise.all(ops);
  await publishProxyConfigUpdate();

  return NextResponse.json({ ok: true });
}

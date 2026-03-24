// 聚合所有 Provider 的健康快照 — Redis `provider:<id>:health` 与 DB 元数据
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { getRedis } from "@/lib/redis";
import { logServerError } from "@/lib/server-logger";

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  try {
    const providers = await db.provider.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        enabled: true,
        baseUrl: true,
        apiType: true,
        updatedAt: true,
      },
    });

    const redis = getRedis();
    const items = await Promise.all(
      providers.map(async (p) => {
        const raw = await redis.get(`provider:${p.id}:health`);
        let health: Record<string, unknown> | null = null;
        if (raw) {
          try {
            health = JSON.parse(raw) as Record<string, unknown>;
          } catch {
            health = null;
          }
        }
        return {
          providerId: p.id,
          name: p.name,
          enabled: p.enabled,
          baseUrl: p.baseUrl,
          apiType: p.apiType,
          updatedAt: p.updatedAt.toISOString(),
          health,
        };
      }),
    );

    return NextResponse.json({ providers: items });
  } catch (e) {
    logServerError("providers/health", e);
    return NextResponse.json({ error: "加载失败" }, { status: 500 });
  }
}

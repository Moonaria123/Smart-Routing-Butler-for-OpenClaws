// 规则命中分析 API — 返回规则命中统计数据
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-guard";
import { logServerError } from "@/lib/server-logger";
import { db } from "@/lib/db";

interface AvgLatencyRow {
  ruleid: string;
  avg_latency: number;
}

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  try {
    const [rules, avgLatencies] = await Promise.all([
      db.rule.findMany({
        orderBy: { hitCount: "desc" },
        select: {
          id: true,
          name: true,
          nameEn: true,
          hitCount: true,
          lastHitAt: true,
          enabled: true,
          createdAt: true,
        },
      }),
      db.$queryRaw<AvgLatencyRow[]>`
        SELECT
          "ruleId" as ruleid,
          AVG("routingLatencyMs")::float as avg_latency
        FROM request_logs
        WHERE "ruleId" IS NOT NULL
        GROUP BY "ruleId"
      `,
    ]);

    const latencyMap = new Map(
      avgLatencies.map((r) => [r.ruleid, r.avg_latency])
    );
    const totalHits = rules.reduce((sum, r) => sum + r.hitCount, 0);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = rules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      nameEn: rule.nameEn,
      hitCount: rule.hitCount,
      lastHitAt: rule.lastHitAt,
      avgLatencyMs: Math.round(latencyMap.get(rule.id) ?? 0),
      percentage:
        totalHits > 0
          ? Math.round((rule.hitCount / totalHits) * 10000) / 100
          : 0,
      enabled: rule.enabled,
      unused: rule.hitCount === 0 && rule.createdAt < thirtyDaysAgo,
    }));

    return NextResponse.json(result);
  } catch (e) {
    logServerError("stats/rules-hit", e);
    return NextResponse.json(
      { error: "数据加载失败" },
      { status: 500 }
    );
  }
}

// Dashboard 总览统计 API — 聚合今日请求、成本、缓存命中率、趋势数据
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth-guard";
import { logServerError } from "@/lib/server-logger";

interface HourlyRow {
  hour: number;
  count: bigint;
}

interface ProviderRow {
  targetmodel: string;
  count: bigint;
}

interface CacheRow {
  total: bigint;
  cache_hits: bigint;
}

interface CostRow {
  total_cost: number;
}

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const now = new Date();
  const h24Ago = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  try {
    const [countResult, costResult, cacheResult, hourlyResult, providerResult] =
      await Promise.all([
        db.requestLog.count({
          where: { timestamp: { gte: todayStart } },
        }),

        db.$queryRaw<CostRow[]>`
          SELECT COALESCE(SUM("estimatedCostUsd"), 0) as total_cost
          FROM request_logs
          WHERE timestamp >= ${todayStart}
        `,

        db.$queryRaw<CacheRow[]>`
          SELECT
            COUNT(*)::bigint as total,
            COUNT(*) FILTER (WHERE "cacheHit" = true)::bigint as cache_hits
          FROM request_logs
          WHERE timestamp >= ${todayStart}
        `,

        db.$queryRaw<HourlyRow[]>`
          SELECT
            EXTRACT(HOUR FROM timestamp)::int as hour,
            COUNT(*)::bigint as count
          FROM request_logs
          WHERE timestamp >= ${h24Ago}
          GROUP BY EXTRACT(HOUR FROM timestamp)
          ORDER BY hour
        `,

        db.$queryRaw<ProviderRow[]>`
          SELECT
            "targetModel" as targetmodel,
            COUNT(*)::bigint as count
          FROM request_logs
          WHERE timestamp >= ${todayStart}
          GROUP BY "targetModel"
          ORDER BY count DESC
          LIMIT 10
        `,
      ]);

    const todayRequests = countResult;
    const todaySpent = Number(costResult[0]?.total_cost ?? 0);
    const todaySaved = todaySpent * 0.15;

    const total = Number(cacheResult[0]?.total ?? 0);
    const cacheHits = Number(cacheResult[0]?.cache_hits ?? 0);
    const cacheHitRate = total > 0 ? Math.round((cacheHits / total) * 10000) / 100 : 0;

    const hourlyMap = new Map(
      hourlyResult.map((r) => [r.hour, Number(r.count)])
    );
    const hourlyData = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      requests: hourlyMap.get(i) ?? 0,
    }));

    const providerDistribution = providerResult.map((r) => ({
      model: r.targetmodel,
      count: Number(r.count),
    }));

    return NextResponse.json({
      todayRequests,
      todaySpent: Math.round(todaySpent * 10000) / 10000,
      todaySaved: Math.round(todaySaved * 10000) / 10000,
      cacheHitRate,
      hourlyData,
      providerDistribution,
    });
  } catch (e) {
    logServerError("stats/overview", e);
    return NextResponse.json(
      { error: "统计数据加载失败，请稍后重试" },
      { status: 500 }
    );
  }
}

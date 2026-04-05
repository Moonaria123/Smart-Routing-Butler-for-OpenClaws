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

interface ThinkingRow {
  total: bigint;
  thinking_count: bigint;
}

interface MultimodalRow {
  total: bigint;
  multimodal_count: bigint;
}

interface ImageGenRow {
  image_gen_count: bigint;
}

interface TokenRow {
  apitokenname: string | null;
  count: bigint;
}

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const now = new Date();
  const h24Ago = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  try {
    const [countResult, costResult, cacheResult, hourlyResult, providerResult, thinkingResult, multimodalResult, tokenResult, imageGenResult] =
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

        db.$queryRaw<ThinkingRow[]>`
          SELECT
            COUNT(*)::bigint as total,
            COUNT(*) FILTER (WHERE "thinkingEnabled" = true)::bigint as thinking_count
          FROM request_logs
          WHERE timestamp >= ${todayStart}
        `,

        db.$queryRaw<MultimodalRow[]>`
          SELECT
            COUNT(*)::bigint as total,
            COUNT(*) FILTER (WHERE array_length(modalities, 1) > 1)::bigint as multimodal_count
          FROM request_logs
          WHERE timestamp >= ${todayStart}
        `,

        db.$queryRaw<TokenRow[]>`
          SELECT
            "apiTokenName" as apitokenname,
            COUNT(*)::bigint as count
          FROM request_logs
          WHERE timestamp >= ${todayStart} AND "apiTokenId" IS NOT NULL
          GROUP BY "apiTokenName"
          ORDER BY count DESC
          LIMIT 10
        `,

        db.$queryRaw<ImageGenRow[]>`
          SELECT
            COUNT(*) FILTER (WHERE 'image-generation' = ANY(modalities))::bigint as image_gen_count
          FROM request_logs
          WHERE timestamp >= ${todayStart}
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

    const thinkingTotal = Number(thinkingResult[0]?.total ?? 0);
    const thinkingCount = Number(thinkingResult[0]?.thinking_count ?? 0);
    const thinkingRate = thinkingTotal > 0
      ? Math.round((thinkingCount / thinkingTotal) * 10000) / 100
      : 0;

    const multimodalTotal = Number(multimodalResult[0]?.total ?? 0);
    const multimodalCount = Number(multimodalResult[0]?.multimodal_count ?? 0);
    const multimodalRate = multimodalTotal > 0
      ? Math.round((multimodalCount / multimodalTotal) * 10000) / 100
      : 0;

    const tokenDistribution = tokenResult.map((r) => ({
      name: r.apitokenname ?? "Unknown",
      count: Number(r.count),
    }));

    const imageGenRequests = Number(imageGenResult[0]?.image_gen_count ?? 0);

    return NextResponse.json({
      todayRequests,
      todaySpent: Math.round(todaySpent * 10000) / 10000,
      todaySaved: Math.round(todaySaved * 10000) / 10000,
      cacheHitRate,
      hourlyData,
      providerDistribution,
      thinkingRequests: thinkingCount,
      thinkingRate,
      multimodalRequests: multimodalCount,
      multimodalRate,
      tokenDistribution,
      imageGenRequests,
    });
  } catch (e) {
    logServerError("stats/overview", e);
    return NextResponse.json(
      { error: "统计数据加载失败，请稍后重试" },
      { status: 500 }
    );
  }
}

// 规则命中分析 API — 返回规则命中统计数据（支持按 apiTokenId 筛选）
import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/auth-guard";
import { logServerError } from "@/lib/server-logger";
import { db } from "@/lib/db";

interface AvgLatencyRow {
  ruleid: string;
  avg_latency: number;
}

interface LastHitRow {
  ruleid: string;
  last_hit: Date | null;
}

export async function GET(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const apiTokenId = req.nextUrl.searchParams.get("apiTokenId");

  try {
    const [rules, avgLatencies, hitCountsByRule, lastHitsByRule] = await Promise.all([
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
      apiTokenId
        ? db.$queryRaw<AvgLatencyRow[]>`
            SELECT "ruleId" as ruleid, AVG("routingLatencyMs")::float as avg_latency
            FROM request_logs
            WHERE "ruleId" IS NOT NULL AND "apiTokenId" = ${apiTokenId}
            GROUP BY "ruleId"`
        : db.$queryRaw<AvgLatencyRow[]>`
            SELECT "ruleId" as ruleid, AVG("routingLatencyMs")::float as avg_latency
            FROM request_logs
            WHERE "ruleId" IS NOT NULL
            GROUP BY "ruleId"`,
      apiTokenId
        ? db.$queryRaw<{ ruleid: string; cnt: bigint }[]>`
            SELECT "ruleId" as ruleid, COUNT(*)::bigint as cnt
            FROM request_logs
            WHERE "ruleId" IS NOT NULL AND "apiTokenId" = ${apiTokenId}
            GROUP BY "ruleId"`
        : null,
      apiTokenId
        ? db.$queryRaw<LastHitRow[]>`
            SELECT "ruleId" as ruleid, MAX(timestamp) as last_hit
            FROM request_logs
            WHERE "ruleId" IS NOT NULL AND "apiTokenId" = ${apiTokenId}
            GROUP BY "ruleId"`
        : null,
    ]);

    const latencyMap = new Map(
      avgLatencies.map((r) => [r.ruleid, r.avg_latency])
    );

    // 按 Token 筛选时使用 request_logs 聚合计数；否则用 rules 表 hitCount
    const hitCountMap = hitCountsByRule
      ? new Map(hitCountsByRule.map((r) => [r.ruleid, Number(r.cnt)]))
      : null;

    // 按 Token 筛选时使用 request_logs 的最后命中时间；否则用 rules 表全局 lastHitAt
    const lastHitMap = lastHitsByRule
      ? new Map(lastHitsByRule.map((r) => [r.ruleid, r.last_hit]))
      : null;

    const getHitCount = (rule: { id: string; hitCount: number }) =>
      hitCountMap ? (hitCountMap.get(rule.id) ?? 0) : rule.hitCount;

    const totalHits = rules.reduce((sum, r) => sum + getHitCount(r), 0);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = rules.map((rule) => {
      const hc = getHitCount(rule);
      return {
        id: rule.id,
        name: rule.name,
        nameEn: rule.nameEn,
        hitCount: hc,
        lastHitAt: lastHitMap ? (lastHitMap.get(rule.id) ?? null) : rule.lastHitAt,
        avgLatencyMs: Math.round(latencyMap.get(rule.id) ?? 0),
        percentage:
          totalHits > 0
            ? Math.round((hc / totalHits) * 10000) / 100
            : 0,
        enabled: rule.enabled,
        unused: hc === 0 && rule.createdAt < thirtyDaysAgo,
      };
    });

    return NextResponse.json(result);
  } catch (e) {
    logServerError("stats/rules-hit", e);
    return NextResponse.json(
      { error: "数据加载失败" },
      { status: 500 }
    );
  }
}

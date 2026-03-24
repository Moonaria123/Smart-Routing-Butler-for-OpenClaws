// Fallback 事件统计 API — 按小时聚合最近 7 天的 fallback 事件
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-guard";
import { logServerError } from "@/lib/server-logger";
import { db } from "@/lib/db";

interface FallbackRow {
  hour: string;
  count: bigint;
  reason: string;
}

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  try {
    const result = await db.$queryRaw<FallbackRow[]>`
      SELECT
        TO_CHAR(timestamp, 'YYYY-MM-DD HH24:00') as hour,
        COUNT(*)::bigint as count,
        reason
      FROM fallback_events
      WHERE timestamp >= ${sevenDaysAgo}
      GROUP BY TO_CHAR(timestamp, 'YYYY-MM-DD HH24:00'), reason
      ORDER BY hour
    `;

    const data = result.map((r) => ({
      hour: r.hour,
      count: Number(r.count),
      reason: r.reason,
    }));

    return NextResponse.json(data);
  } catch (e) {
    logServerError("stats/fallback", e);
    return NextResponse.json(
      { error: "数据加载失败" },
      { status: 500 }
    );
  }
}

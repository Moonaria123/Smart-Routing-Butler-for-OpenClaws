// 定时数据保留清理 — 删除超过保留期的 request_logs / fallback_events（需 CRON_SECRET）
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const MS_PER_DAY = 86400000;

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "未配置 CRON_SECRET" },
      { status: 503 }
    );
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const ninetyDaysAgo = new Date(Date.now() - 90 * MS_PER_DAY);
  const thirtyDaysAgo = new Date(Date.now() - 30 * MS_PER_DAY);

  const [logs, events] = await Promise.all([
    db.requestLog.deleteMany({
      where: { timestamp: { lt: ninetyDaysAgo } },
    }),
    db.fallbackEvent.deleteMany({
      where: { timestamp: { lt: thirtyDaysAgo } },
    }),
  ]);

  return NextResponse.json({
    deleted: {
      requestLogs: logs.count,
      fallbackEvents: events.count,
    },
  });
}

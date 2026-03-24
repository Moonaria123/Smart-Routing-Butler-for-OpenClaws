// 请求日志 CSV 导出 API — 流式导出最近 30 天日志
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth-guard";
import { logServerError } from "@/lib/server-logger";

const CSV_HEADER =
  "timestamp,routingLayer,targetModel,latencyMs,inputTokens,outputTokens,estimatedCostUsd,statusCode\n";

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  try {
    const logs = await db.requestLog.findMany({
      where: { timestamp: { gte: thirtyDaysAgo } },
      orderBy: { timestamp: "desc" },
      select: {
        timestamp: true,
        routingLayer: true,
        targetModel: true,
        latencyMs: true,
        inputTokens: true,
        outputTokens: true,
        estimatedCostUsd: true,
        statusCode: true,
      },
    });

    const chunks: string[] = [CSV_HEADER];
    for (const log of logs) {
      chunks.push(
        [
          log.timestamp.toISOString(),
          escapeCSV(log.routingLayer),
          escapeCSV(log.targetModel),
          String(log.latencyMs),
          String(log.inputTokens),
          String(log.outputTokens),
          log.estimatedCostUsd.toFixed(6),
          String(log.statusCode),
        ].join(",") + "\n",
      );
    }

    const csv = chunks.join("");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="request-logs-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (e) {
    logServerError("stats/logs/export", e);
    return NextResponse.json(
      { error: "日志导出失败，请稍后重试" },
      { status: 500 },
    );
  }
}

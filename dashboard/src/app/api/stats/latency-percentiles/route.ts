// 按 routingLayer 聚合请求延迟分位数（P50/P95/P99），供 SLO 与运维查看（ISSUE-PL-05）
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/auth-guard";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type Row = {
  routingLayer: string;
  n: bigint;
  p50: unknown;
  p95: unknown;
  p99: unknown;
};

export async function GET(request: Request) {
  const { error } = await requireSession();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const hoursRaw = searchParams.get("hours");
  const format = searchParams.get("format") ?? "json";
  const hours = Math.min(
    168,
    Math.max(1, hoursRaw ? Number.parseInt(hoursRaw, 10) || 24 : 24),
  );

  const since = new Date(Date.now() - hours * 3600_000);

  const rows = await db.$queryRaw<Row[]>(Prisma.sql`
    SELECT "routingLayer",
      COUNT(*)::bigint AS n,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "latencyMs") AS p50,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "latencyMs") AS p95,
      PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY "latencyMs") AS p99
    FROM request_logs
    WHERE "timestamp" >= ${since}
    GROUP BY "routingLayer"
    ORDER BY "routingLayer"
  `);

  const layers = rows.map((r) => ({
    routingLayer: r.routingLayer,
    sampleCount: Number(r.n),
    p50Ms: roundNum(r.p50),
    p95Ms: roundNum(r.p95),
    p99Ms: roundNum(r.p99),
  }));

  if (format === "csv") {
    const header =
      "routingLayer,sampleCount,p50Ms,p95Ms,p99Ms,hoursWindow\n";
    const body = layers
      .map(
        (l) =>
          `${csvEscape(l.routingLayer)},${l.sampleCount},${l.p50Ms ?? ""},${l.p95Ms ?? ""},${l.p99Ms ?? ""},${hours}`,
      )
      .join("\n");
    return new NextResponse(header + body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="latency-percentiles-${hours}h.csv"`,
      },
    });
  }

  return NextResponse.json({
    hours,
    generatedAt: new Date().toISOString(),
    layers,
  });
}

function roundNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  if (Number.isNaN(n)) return null;
  return Math.round(n * 1000) / 1000;
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

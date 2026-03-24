// 请求日志分页查询 API — 支持时间范围、模型、路由层筛选
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth-guard";
import { Prisma } from "@prisma/client";
import { logServerError } from "@/lib/server-logger";

export async function GET(request: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const params = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10));
  const limit = Math.min(200, Math.max(1, parseInt(params.get("limit") ?? "50", 10)));
  const from = params.get("from");
  const to = params.get("to");
  const model = params.get("model");
  const routingLayer = params.get("routingLayer");
  const ruleId = params.get("ruleId");

  const where: Prisma.RequestLogWhereInput = {};

  if (from || to) {
    where.timestamp = {};
    if (from) where.timestamp.gte = new Date(from);
    if (to) where.timestamp.lte = new Date(to);
  }

  if (model) {
    where.targetModel = { contains: model, mode: "insensitive" };
  }

  if (routingLayer && routingLayer !== "ALL") {
    where.routingLayer = routingLayer;
  }

  if (ruleId) {
    where.ruleId = ruleId;
  }

  try {
    const [logs, total] = await Promise.all([
      db.requestLog.findMany({
        where,
        orderBy: { timestamp: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          timestamp: true,
          routingLayer: true,
          ruleId: true,
          targetModel: true,
          confidence: true,
          latencyMs: true,
          routingLatencyMs: true,
          inputTokens: true,
          outputTokens: true,
          estimatedCostUsd: true,
          statusCode: true,
          streaming: true,
          cacheHit: true,
        },
      }),
      db.requestLog.count({ where }),
    ]);

    return NextResponse.json({
      logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (e) {
    logServerError("stats/logs", e);
    return NextResponse.json(
      { error: "日志数据加载失败，请稍后重试" },
      { status: 500 },
    );
  }
}

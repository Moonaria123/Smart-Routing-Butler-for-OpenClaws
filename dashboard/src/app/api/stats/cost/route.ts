// 成本统计 API — 计算实际/假设成本、节省金额、每日趋势
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-guard";
import { logServerError } from "@/lib/server-logger";
import { db } from "@/lib/db";

interface DailyCostRow {
  date: string;
  actual: number;
  total_input: bigint;
  total_output: bigint;
}

interface MaxCostRow {
  max_input: number;
  max_output: number;
}

export async function GET(request: Request) {
  const { error } = await requireSession();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const days = Math.min(Math.max(Number(searchParams.get("days") || 7), 1), 90);

  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  const todayStr = new Date().toISOString().slice(0, 10);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthStartStr = monthStart.toISOString().slice(0, 10);

  try {
    const [dailyResult, maxCostResult, budgetResult] = await Promise.all([
      db.$queryRaw<DailyCostRow[]>`
        SELECT
          TO_CHAR(timestamp, 'YYYY-MM-DD') as date,
          COALESCE(SUM("estimatedCostUsd"), 0)::float as actual,
          COALESCE(SUM("inputTokens"), 0)::bigint as total_input,
          COALESCE(SUM("outputTokens"), 0)::bigint as total_output
        FROM request_logs
        WHERE timestamp >= ${since}
        GROUP BY TO_CHAR(timestamp, 'YYYY-MM-DD')
        ORDER BY date
      `,
      db.$queryRaw<MaxCostRow[]>`
        SELECT
          COALESCE(MAX("inputCost"), 0)::float as max_input,
          COALESCE(MAX("outputCost"), 0)::float as max_output
        FROM models
        WHERE enabled = true
      `,
      db.systemConfig.findUnique({ where: { key: "monthly_budget" } }),
    ]);

    const maxInput = maxCostResult[0]?.max_input ?? 0;
    const maxOutput = maxCostResult[0]?.max_output ?? 0;

    const dailyCostTrend = dailyResult.map((row) => {
      const hypothetical =
        (Number(row.total_input) * maxInput +
          Number(row.total_output) * maxOutput) /
        1_000_000;
      return {
        date: row.date,
        actual: Math.round(row.actual * 10000) / 10000,
        hypothetical: Math.round(hypothetical * 10000) / 10000,
      };
    });

    const todayEntry = dailyCostTrend.find((d) => d.date === todayStr);
    const todayActualCost = todayEntry?.actual ?? 0;
    const todayHypotheticalCost = todayEntry?.hypothetical ?? 0;
    const todaySaved = Math.max(0, todayHypotheticalCost - todayActualCost);

    const budgetValue = budgetResult?.value as { amount?: number } | null;
    const monthlyBudget = budgetValue?.amount ?? null;

    const budgetUsed =
      monthlyBudget !== null
        ? Math.round(
            dailyCostTrend
              .filter((d) => d.date >= monthStartStr)
              .reduce((sum, d) => sum + d.actual, 0) * 10000
          ) / 10000
        : null;

    return NextResponse.json({
      todayActualCost,
      todayHypotheticalCost,
      todaySaved: Math.round(todaySaved * 10000) / 10000,
      dailyCostTrend,
      budgetUsed,
      monthlyBudget,
    });
  } catch (e) {
    logServerError("stats/cost", e);
    return NextResponse.json(
      { error: "成本数据加载失败" },
      { status: 500 }
    );
  }
}

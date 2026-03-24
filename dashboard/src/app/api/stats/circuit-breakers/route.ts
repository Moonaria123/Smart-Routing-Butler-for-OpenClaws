// 熔断器状态 API — 扫描 Redis 获取当前所有熔断器状态
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-guard";
import { getRedis } from "@/lib/redis";
import {
  isCircuitBreakerOpenKey,
  normalizeCircuitPayload,
  providerModelFromCircuitKey,
  type CircuitBreakerView,
} from "@/lib/circuit-redis";
import { logServerError } from "@/lib/server-logger";

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const redis = getRedis();
  const breakers: CircuitBreakerView[] = [];

  try {
    let cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        "circuit:*",
        "COUNT",
        100,
      );
      cursor = nextCursor;

      for (const key of keys) {
        if (!isCircuitBreakerOpenKey(key)) continue;

        const val = await redis.get(key);
        if (!val) continue;

        try {
          const data = JSON.parse(val) as Record<string, unknown>;
          const norm = normalizeCircuitPayload(data);
          breakers.push({
            model: providerModelFromCircuitKey(key),
            ...norm,
          });
        } catch {
          breakers.push({
            model: providerModelFromCircuitKey(key),
            state: "open",
            triggeredBy: "unknown",
            openedAt: "",
            until: "",
          });
        }
      }
    } while (cursor !== "0");

    return NextResponse.json(breakers);
  } catch (e) {
    logServerError("stats/circuit-breakers", e);
    return NextResponse.json(
      { error: "熔断器数据加载失败" },
      { status: 500 },
    );
  }
}

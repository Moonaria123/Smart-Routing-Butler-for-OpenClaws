// 熔断器——分级触发策略，Redis 分布式状态与连续失败计数（多实例一致）
import { getRedis, incrementFallbackCounter } from "../cache/redis.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import type { CircuitBreakerData, CircuitState } from "../types/index.js";

const CIRCUIT_TTL = config.circuitBreaker.ttlSeconds;
const CONSECUTIVE_THRESHOLD = config.circuitBreaker.consecutive5xxThreshold;

function circuitKey(providerModel: string): string {
  return `circuit:${providerModel}`;
}

/** 5xx/timeout 连续失败计数（Redis INCR，与 contracts/redis-keys.md 对齐） */
function circuitFailCountKey(providerModel: string): string {
  return `circuit:fail_count:${providerModel}`;
}

async function redisIncrFailCount(providerModel: string): Promise<number> {
  const r = getRedis();
  return r.incr(circuitFailCountKey(providerModel));
}

async function redisResetFailCount(providerModel: string): Promise<void> {
  try {
    await getRedis().del(circuitFailCountKey(providerModel));
  } catch (err) {
    logger.error("熔断连续失败计数重置失败", {
      providerModel,
      error: (err as Error).message,
    });
  }
}

// ---- 错误类型 ----

export class CircuitBreakerError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "CircuitBreakerError";
  }
}

// ---- 状态查询 ----

export async function getCircuitState(
  providerModel: string,
): Promise<{ state: CircuitState; data: CircuitBreakerData | null }> {
  try {
    const raw = await getRedis().get(circuitKey(providerModel));
    if (!raw) return { state: "closed", data: null };

    const data = JSON.parse(raw) as CircuitBreakerData;
    return { state: data.state, data };
  } catch (err) {
    logger.error("熔断器状态查询失败", {
      providerModel,
      error: (err as Error).message,
    });
    return { state: "closed", data: null };
  }
}

export async function isCircuitOpen(
  providerModel: string,
): Promise<boolean> {
  const { state } = await getCircuitState(providerModel);
  // 冷却 TTL 到期后 key 消失 → 视为 closed，下一请求即 BRD 所述「half-open」探测（首条成功则 recordSuccess 清状态）
  return state === "open";
}

// ---- 状态变更 ----

async function openCircuit(
  providerModel: string,
  triggeredBy: CircuitBreakerData["triggered_by"],
): Promise<void> {
  const now = Date.now();
  let failures: number = CONSECUTIVE_THRESHOLD;
  try {
    const raw = await getRedis().get(circuitFailCountKey(providerModel));
    if (raw) failures = Math.max(parseInt(raw, 10) || 0, CONSECUTIVE_THRESHOLD);
  } catch {
    /* ignore */
  }

  const data: CircuitBreakerData = {
    state: "open",
    triggered_by: triggeredBy,
    consecutive_failures: failures,
    opened_at: now,
    until: now + CIRCUIT_TTL * 1000,
  };

  try {
    await getRedis().set(
      circuitKey(providerModel),
      JSON.stringify(data),
      "EX",
      CIRCUIT_TTL,
    );
    await redisResetFailCount(providerModel);
    logger.warn(`熔断器已打开: ${providerModel}`, data);
  } catch (err) {
    logger.error("熔断器写入 Redis 失败", {
      providerModel,
      error: (err as Error).message,
    });
  }
}

export async function recordSuccess(
  providerModel: string,
): Promise<void> {
  await redisResetFailCount(providerModel);
  try {
    await getRedis().del(circuitKey(providerModel));
  } catch (err) {
    logger.error("熔断器成功记录删除 key 失败", {
      providerModel,
      error: (err as Error).message,
    });
  }
}

/**
 * 记录失败——分级触发逻辑：
 *   429           → 立即熔断（60s 冷却）
 *   5xx (≥500)    → 连续 3 次后熔断
 *   timeout (0)   → 连续 3 次后熔断
 *   4xx (非 429)  → 不参与熔断，调用方自行处理
 */
export async function recordFailure(
  providerModel: string,
  statusCode: number,
): Promise<void> {
  if (statusCode === 429) {
    await redisResetFailCount(providerModel);
    await openCircuit(providerModel, "429");
    return;
  }

  // 5xx 或 timeout（statusCode === 0 表示超时）
  const triggeredBy: CircuitBreakerData["triggered_by"] =
    statusCode === 0 ? "timeout" : "5xx";
  const count = await redisIncrFailCount(providerModel);

  if (count >= CONSECUTIVE_THRESHOLD) {
    await openCircuit(providerModel, triggeredBy);
  }
}

// ---- 执行包装器 ----

/**
 * 用熔断器包装一次 Provider 调用。
 * 熔断打开时直接抛出 CircuitBreakerError(503)。
 * 4xx (非 429) 错误直接上抛，不参与熔断计数。
 */
export async function executeWithCircuitBreaker<T>(
  providerModel: string,
  fn: () => Promise<T>,
): Promise<T> {
  const open = await isCircuitOpen(providerModel);
  if (open) {
    throw new CircuitBreakerError(
      `熔断器已打开，跳过 ${providerModel}`,
      503,
    );
  }

  try {
    const result = await fn();
    await recordSuccess(providerModel);
    return result;
  } catch (err) {
    const statusCode =
      (err as { statusCode?: number }).statusCode ?? 500;

    // 4xx (非 429) → 认证/参数错误，直接上抛，不做 fallback，不参与熔断
    if (statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
      throw err;
    }

    await recordFailure(providerModel, statusCode);
    throw err;
  }
}

/**
 * Fallback 链执行——按顺序尝试每个目标，跳过已熔断的 Provider。
 * 4xx (非 429) 错误立即终止整条链。
 */
export async function executeFallbackChain<T>(
  targets: string[],
  requestFn: (target: string) => Promise<T>,
): Promise<T> {
  let lastError: Error | null = null;

  for (const target of targets) {
    try {
      return await executeWithCircuitBreaker(target, () =>
        requestFn(target),
      );
    } catch (err) {
      const statusCode =
        (err as { statusCode?: number }).statusCode ?? 0;

      // 4xx (非 429) → 直接终止链，不做 fallback
      if (
        statusCode >= 400 &&
        statusCode < 500 &&
        statusCode !== 429
      ) {
        throw err;
      }

      lastError = err as Error;
      logger.warn(`Fallback 目标 ${target} 失败，尝试下一个`, {
        error: (err as Error).message,
        statusCode,
      });

      // 递增 Fallback 计数器
      setImmediate(() => {
        incrementFallbackCounter().catch((e) =>
          logger.error("Fallback 计数器递增失败", { error: e }),
        );
      });
    }
  }

  throw (
    lastError ?? new Error("所有 Provider 及 fallback 目标均失败")
  );
}

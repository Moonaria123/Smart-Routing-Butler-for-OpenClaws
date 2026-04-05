// SEC-003: Redis 滑动窗口限流中间件（Lua 原子脚本，CR-SEC-02 / CR-SEC-03）
import type { Request, Response, NextFunction } from "express";
import { getRedis } from "../cache/redis.js";
import { logger } from "../utils/logger.js";

export interface RateLimitOptions {
  /** Redis key 前缀，如 "rl:models" */
  keyPrefix: string;
  /** 窗口内最大请求数 */
  maxRequests: number;
  /** 窗口时长（秒） */
  windowSeconds: number;
  /** 从请求中提取限流 key；返回 null 则跳过限流 */
  keyExtractor: (req: Request, res: Response) => string | null;
}

/**
 * Lua 脚本：原子 INCR + EXPIRE + TTL（CR-SEC-02 修复非原子竞态）。
 * 返回 [count, ttl]：count 为当前窗口请求数，ttl 为 key 剩余秒数。
 */
const RATE_LIMIT_LUA = `
local key = KEYS[1]
local window = tonumber(ARGV[1])
local count = redis.call('INCR', key)
if count == 1 then
  redis.call('EXPIRE', key, window)
end
local ttl = redis.call('TTL', key)
return {count, ttl}
`;

/**
 * 创建 Express 限流中间件。
 * Redis 不可用时 fail-open（放行请求）。
 */
/** Docker healthcheck 等本机请求不应消耗限流配额（ISSUE-REG-05） */
const LOOPBACK_IPS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export function createRateLimiter(options: RateLimitOptions) {
  const { keyPrefix, maxRequests, windowSeconds, keyExtractor } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const identity = keyExtractor(req, res);
    if (!identity || LOOPBACK_IPS.has(identity)) {
      next();
      return;
    }

    try {
      const redis = getRedis();
      const redisKey = `${keyPrefix}:${identity}`;

      // Lua 原子执行 INCR + EXPIRE + TTL
      const [count, ttl] = (await redis.eval(
        RATE_LIMIT_LUA,
        1,
        redisKey,
        windowSeconds,
      )) as [number, number];

      // 响应头：限额信息（CR-SEC-03：Reset 为实际剩余秒数）
      const remaining = Math.max(0, maxRequests - count);
      const resetSeconds = ttl > 0 ? ttl : windowSeconds;
      res.setHeader("X-RateLimit-Limit", maxRequests);
      res.setHeader("X-RateLimit-Remaining", remaining);
      res.setHeader("X-RateLimit-Reset", resetSeconds);

      if (count > maxRequests) {
        res.status(429).json({
          error: {
            message: "请求过于频繁，请稍后再试 / Rate limit exceeded",
            type: "rate_limit_error",
            code: "rate_limited",
          },
        });
        return;
      }

      next();
    } catch (err) {
      // Redis 故障 → fail-open，不阻断正常请求
      logger.warn("Rate limiter Redis error, failing open", { keyPrefix, error: err });
      next();
    }
  };
}

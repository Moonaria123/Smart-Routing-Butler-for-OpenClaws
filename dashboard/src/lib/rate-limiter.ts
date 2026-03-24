// 登录频率限制 — 连续 5 次失败锁定 IP 15 分钟
import Redis from "ioredis";
import { logServerError } from "@/lib/server-logger";

const LOCKOUT_THRESHOLD = 5;
const WINDOW_SECONDS = 900; // 15 分钟滑动窗口

let redis: Redis | null = null;

function getRedisClient(): Redis {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL || "redis://redis:6379");
    redis.on("error", (err) => logServerError("rate-limiter/redis", err));
  }
  return redis;
}

export async function checkLoginRateLimit(
  ip: string
): Promise<{ blocked: boolean; remainingAttempts: number }> {
  const key = `login_fail:${ip}`;
  const client = getRedisClient();
  const count = await client.get(key);
  const current = count ? parseInt(count, 10) : 0;

  if (current >= LOCKOUT_THRESHOLD) {
    return { blocked: true, remainingAttempts: 0 };
  }
  return { blocked: false, remainingAttempts: LOCKOUT_THRESHOLD - current };
}

export async function recordLoginFailure(ip: string): Promise<void> {
  const key = `login_fail:${ip}`;
  const client = getRedisClient();
  const newCount = await client.incr(key);
  if (newCount === 1) {
    await client.expire(key, WINDOW_SECONDS);
  }
}

export async function clearLoginFailures(ip: string): Promise<void> {
  const key = `login_fail:${ip}`;
  await getRedisClient().del(key);
}

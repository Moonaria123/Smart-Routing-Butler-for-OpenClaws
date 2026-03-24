// Redis 客户端 — 用于规则更新事件发布
import Redis from "ioredis";

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL || "redis://redis:6379");
  }
  return redis;
}

export async function publishRuleUpdate(
  event: string,
  ruleId?: string
): Promise<void> {
  const client = getRedis();
  await client.publish(
    "rules:updated",
    JSON.stringify({ event, ruleId, timestamp: Date.now() })
  );
}

const TOKEN_INVALIDATE_CHANNEL = "api_tokens:invalidate";

/** 撤销 Token 后通知 Proxy 清除校验缓存（与 proxy apitoken:cache:* 对齐） */
export async function publishApiTokenInvalidated(
  tokenHash: string
): Promise<void> {
  const client = getRedis();
  await client.publish(
    TOKEN_INVALIDATE_CHANNEL,
    JSON.stringify({ tokenHash, timestamp: Date.now() })
  );
  await client.del(`apitoken:cache:${tokenHash}`);
}

/** 通知 Proxy 重载运行时配置（L0.5 超时、L1 fallback 开关，ISSUE-V4-03） */
export async function publishProxyConfigUpdate(): Promise<void> {
  const client = getRedis();
  await client.publish(
    "proxy_config:updated",
    JSON.stringify({ timestamp: Date.now() })
  );
}

/** 通知 Router 重载 L2 阈值等（ISSUE-V4-06） */
export async function publishRouterConfigUpdate(): Promise<void> {
  const client = getRedis();
  await client.publish(
    "router_config:updated",
    JSON.stringify({ timestamp: Date.now() })
  );
}

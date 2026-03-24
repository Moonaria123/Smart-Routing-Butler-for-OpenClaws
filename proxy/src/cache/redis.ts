// Redis 连接单例——与 db.ts 相同的 getter 模式；连接异常时丢弃实例以便下次重建
import { Redis } from "ioredis";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

let redis: Redis | null = null;
let subscriber: Redis | null = null;
let tokenSubscriber: Redis | null = null;
let proxyConfigSubscriber: Redis | null = null;

function attachRedisResetHandlers(client: Redis, label: string): void {
  client.on("error", (err) => {
    logger.error(`Redis 连接错误 (${label})`, { error: err });
  });
  client.on("end", () => {
    if (label === "main" && redis === client) {
      redis = null;
    }
    if (label === "rules" && subscriber === client) {
      subscriber = null;
    }
    if (label === "tokens" && tokenSubscriber === client) {
      tokenSubscriber = null;
    }
    if (label === "proxy-config" && proxyConfigSubscriber === client) {
      proxyConfigSubscriber = null;
    }
    logger.warn(`Redis 连接已关闭 (${label})，下次访问将重建`);
  });
}

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(config.redisUrl);
    attachRedisResetHandlers(redis, "main");
  }
  return redis;
}

const TOKEN_INVALIDATE_CHANNEL = "api_tokens:invalidate";

/** API Token 校验缓存失效（与 authMiddleware 共用 key 前缀） */
export function apiTokenCacheKey(tokenHash: string): string {
  return `apitoken:cache:${tokenHash}`;
}

/** 订阅 Token 撤销事件，清除本地短 TTL 校验缓存 */
export function subscribeToApiTokenInvalidations(): void {
  if (tokenSubscriber) return;
  tokenSubscriber = new Redis(config.redisUrl);
  attachRedisResetHandlers(tokenSubscriber, "tokens");
  tokenSubscriber.on("error", (err) =>
    logger.error("Redis Token 订阅连接错误", { error: err }),
  );
  tokenSubscriber.subscribe(TOKEN_INVALIDATE_CHANNEL, (err) => {
    if (err) {
      logger.error("订阅 api_tokens:invalidate 失败", { error: err });
    }
  });
  tokenSubscriber.on("message", (channel: string, message: string) => {
    if (channel !== TOKEN_INVALIDATE_CHANNEL) return;
    try {
      const data = JSON.parse(message) as { tokenHash?: string };
      if (data.tokenHash) {
        getRedis()
          .del(apiTokenCacheKey(data.tokenHash))
          .catch((e) =>
            logger.error("清除 API Token 缓存失败", { error: e }),
          );
      }
    } catch {
      /* ignore */
    }
  });
}

/**
 * 订阅 rules:updated 频道，收到消息时执行回调（用于规则热更新）。
 * 使用独立的 Redis 连接作为 subscriber，避免阻塞主连接。
 */
export function subscribeToRuleUpdates(onUpdate: () => void): void {
  subscriber = new Redis(config.redisUrl);
  attachRedisResetHandlers(subscriber, "rules");
  subscriber.on("error", (err) => logger.error("Redis Subscriber 连接错误", { error: err }));

  subscriber.subscribe("rules:updated", (err) => {
    if (err) {
      logger.error("订阅 rules:updated 频道失败", { error: err });
      return;
    }
    logger.info("已订阅 rules:updated 频道");
  });

  subscriber.on("message", (channel: string) => {
    if (channel === "rules:updated") {
      logger.info("收到规则更新通知，重新加载规则");
      onUpdate();
    }
  });
}

const PROXY_CONFIG_CHANNEL = "proxy_config:updated";

/** 订阅 Proxy 运行时配置变更（L0.5 超时、L1 fallback 开关等），见 ISSUE-V4-03 */
export function subscribeToProxyConfigUpdates(onUpdate: () => void): void {
  if (proxyConfigSubscriber) return;
  proxyConfigSubscriber = new Redis(config.redisUrl);
  const sub = proxyConfigSubscriber;
  attachRedisResetHandlers(sub, "proxy-config");
  sub.on("error", (err) =>
    logger.error("Redis proxy_config 订阅连接错误", { error: err }),
  );
  sub.subscribe(PROXY_CONFIG_CHANNEL, (err) => {
    if (err) {
      logger.error("订阅 proxy_config:updated 失败", { error: err });
    }
  });
  sub.on("message", (channel: string) => {
    if (channel === PROXY_CONFIG_CHANNEL) {
      logger.info("收到 Proxy 运行时配置更新通知");
      onUpdate();
    }
  });
}

/** 递增 Fallback 计数器（按小时聚合，保留 7 天） */
export async function incrementFallbackCounter(): Promise<void> {
  try {
    const hourKey = `stats:fallback:${new Date().toISOString().slice(0, 13).replace(/[-T]/g, "")}`;
    const r = getRedis();
    await r.incr(hourKey);
    await r.expire(hourKey, 604800);
  } catch (err) {
    logger.error("Fallback 计数器递增失败", { error: (err as Error).message });
  }
}

export async function closeRedis(): Promise<void> {
  if (tokenSubscriber) {
    await tokenSubscriber.quit();
    tokenSubscriber = null;
  }
  if (proxyConfigSubscriber) {
    await proxyConfigSubscriber.quit();
    proxyConfigSubscriber = null;
  }
  if (subscriber) {
    await subscriber.quit();
    subscriber = null;
  }
  if (redis) {
    await redis.quit();
    redis = null;
  }
}

// 精确响应缓存——Key = exact:<SHA-256(model + messages JSON)>
import { createHash } from "node:crypto";
import { getRedis } from "./redis.js";
import { logger } from "../utils/logger.js";
import type { ChatMessage, ChatCompletionResponse } from "../types/index.js";

export type CachedResponse = ChatCompletionResponse & { _cached_at: number };

function buildCacheKey(model: string, messages: ChatMessage[]): string {
  const hash = createHash("sha256")
    .update(model + JSON.stringify(messages))
    .digest("hex");
  return `exact:${hash}`;
}

export async function checkExactCache(
  model: string,
  messages: ChatMessage[],
): Promise<CachedResponse | null> {
  try {
    const key = buildCacheKey(model, messages);
    const raw = await getRedis().get(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CachedResponse;

    getRedis()
      .incr("stats:cache_exact_hits")
      .catch((err: Error) => {
        logger.error("精确缓存命中计数递增失败", { error: err.message });
      });

    return parsed;
  } catch (err) {
    logger.error("精确缓存查询失败", {
      error: (err as Error).message,
    });
    return null;
  }
}

export async function writeExactCache(
  model: string,
  messages: ChatMessage[],
  response: ChatCompletionResponse,
  ttlSeconds: number,
): Promise<void> {
  try {
    const key = buildCacheKey(model, messages);
    const data: CachedResponse = { ...response, _cached_at: Date.now() };
    await getRedis().set(key, JSON.stringify(data), "EX", ttlSeconds);
  } catch (err) {
    logger.error("精确缓存写入失败", {
      error: (err as Error).message,
    });
  }
}

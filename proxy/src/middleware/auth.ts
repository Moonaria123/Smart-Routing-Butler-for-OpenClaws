// API Token 认证中间件——SHA-256 hash 比对 + Redis 短 TTL 正例缓存（撤销通过 Pub/Sub 立即失效）
import { createHash } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { getDbPool } from "../cache/db.js";
import { getRedis, apiTokenCacheKey } from "../cache/redis.js";

const TOKEN_CACHE_TTL_SECONDS = 60;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({
      error: {
        message: "缺少 Authorization Bearer Token",
        type: "authentication_error",
        code: "invalid_api_key",
      },
    });
    return;
  }

  const token = authHeader.slice(7);
  const tokenHash = hashToken(token);

  try {
    const cacheKey = apiTokenCacheKey(tokenHash);
    const cached = await getRedis().get(cacheKey);
    if (cached) {
      // 向后兼容：旧缓存值为 "1"，新缓存值为 JSON {id, name}
      let tokenInfo: { id: string | null; name: string | null } = { id: null, name: null };
      try {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed.id === "string") {
          tokenInfo = { id: parsed.id, name: parsed.name ?? null };
        }
      } catch {
        // 旧缓存值 "1"，无 token info
      }
      res.locals.apiToken = tokenInfo;
      next();
      return;
    }

    const pool = getDbPool();
    const result = await pool.query(
      `SELECT id, name, "revokedAt" FROM api_tokens WHERE "tokenHash" = $1`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      res.status(401).json({
        error: {
          message: "API Token 无效",
          type: "authentication_error",
          code: "invalid_api_key",
        },
      });
      return;
    }

    if (result.rows[0].revokedAt) {
      res.status(401).json({
        error: {
          message: "API Token 已被撤销",
          type: "authentication_error",
          code: "token_revoked",
        },
      });
      return;
    }

    const row = result.rows[0];
    const tokenInfo = { id: row.id as string, name: (row.name as string) ?? null };
    await getRedis().set(cacheKey, JSON.stringify(tokenInfo), "EX", TOKEN_CACHE_TTL_SECONDS);
    res.locals.apiToken = tokenInfo;
    next();
  } catch (err) {
    next(err);
  }
}

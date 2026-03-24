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
    if (cached === "1") {
      next();
      return;
    }

    const pool = getDbPool();
    const result = await pool.query(
      `SELECT id, "revokedAt" FROM api_tokens WHERE "tokenHash" = $1`,
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

    await getRedis().set(cacheKey, "1", "EX", TOKEN_CACHE_TTL_SECONDS);
    next();
  } catch (err) {
    next(err);
  }
}

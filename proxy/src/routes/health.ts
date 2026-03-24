// GET /health — 依赖服务健康检查
import { Router } from "express";
import type { Request, Response } from "express";
import { getRedis } from "../cache/redis.js";
import { getDbPool } from "../cache/db.js";
import { config } from "../config.js";

type ServiceStatus = "ok" | "unavailable";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  const [redis, postgres, routerSvc, ollama] = await Promise.all([
    checkRedis(),
    checkPostgres(),
    checkRouterService(),
    checkOllama(),
  ]);

  // Redis + PostgreSQL 为硬依赖；Router / Ollama 为软依赖（L2/L3 可降级，不因此 503 或 degraded）
  const coreOk = redis === "ok" && postgres === "ok";
  const status = coreOk ? "ok" : "degraded";
  const httpStatus = coreOk ? 200 : 503;

  res.status(httpStatus).json({
    status,
    version: "1.0.0",
    uptime: Math.floor(process.uptime()),
    services: { redis, postgres, router: routerSvc, ollama },
  });
});

export default router;

// ---------------------------------------------------------------------------
// 各服务探测
// ---------------------------------------------------------------------------

async function checkRedis(): Promise<ServiceStatus> {
  try {
    const redis = getRedis();
    const pong = await redis.ping();
    return pong === "PONG" ? "ok" : "unavailable";
  } catch {
    return "unavailable";
  }
}

async function checkPostgres(): Promise<ServiceStatus> {
  try {
    const pool = getDbPool();
    await pool.query("SELECT 1");
    return "ok";
  } catch {
    return "unavailable";
  }
}

async function checkRouterService(): Promise<ServiceStatus> {
  try {
    const res = await fetch(`${config.pythonRouterUrl}/health`, {
      signal: AbortSignal.timeout(3_000),
    });
    return res.ok ? "ok" : "unavailable";
  } catch {
    return "unavailable";
  }
}

async function checkOllama(): Promise<ServiceStatus> {
  try {
    const res = await fetch(`${config.ollamaUrl}/api/tags`, {
      signal: AbortSignal.timeout(3_000),
    });
    return res.ok ? "ok" : "unavailable";
  } catch {
    return "unavailable";
  }
}

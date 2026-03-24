// Smart Router Proxy — 主入口
import express from "express";
import { config } from "./config.js";
import { logger } from "./utils/logger.js";
import { authMiddleware } from "./middleware/auth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import chatCompletionsRouter from "./routes/chatCompletions.js";
import modelsRouter from "./routes/models.js";
import healthRouter from "./routes/health.js";
import {
  getRedis,
  closeRedis,
  subscribeToRuleUpdates,
  subscribeToApiTokenInvalidations,
  subscribeToProxyConfigUpdates,
} from "./cache/redis.js";
import { refreshProxyRuntimeFromDb } from "./runtimeConfig.js";
import { getDbPool, closeDbPool } from "./cache/db.js";
import { loadRules, loadModels } from "./routing/ruleEngine.js";

const app = express();

app.use(express.json({ limit: "1mb" }));

// ---- 路由挂载 ----
app.use("/v1/chat/completions", authMiddleware, chatCompletionsRouter);
app.use("/v1/models", authMiddleware, modelsRouter);
app.use("/health", healthRouter);

// ---- 错误兜底 ----
app.use(errorHandler);

// ---- 启动 ----
async function assertRequiredSchema(): Promise<void> {
  try {
    const pool = getDbPool();
    const checks = [
      `SELECT "fallbackChain" FROM rules LIMIT 0`,
      `SELECT "tokenHash" FROM api_tokens LIMIT 0`,
      `SELECT "modelId" FROM models LIMIT 0`,
    ];
    for (const q of checks) {
      try {
        await pool.query(q);
      } catch (err) {
        logger.warn("数据库 schema 校验未通过，请确认已执行 Prisma 迁移", {
          query: q,
          error: err,
        });
      }
    }
  } catch (err) {
    logger.warn("数据库 schema 校验跳过", { error: err });
  }
}

async function bootstrap(): Promise<void> {
  try {
    const pool = getDbPool();
    await pool.query("SELECT 1");
    logger.info("PostgreSQL 连接成功");
    await assertRequiredSchema();
  } catch (err) {
    logger.error("PostgreSQL 连接失败，服务仍将启动", { error: err });
  }

  try {
    const redis = getRedis();
    await redis.ping();
    logger.info("Redis 连接成功");
  } catch (err) {
    logger.error("Redis 连接失败，服务仍将启动", { error: err });
  }

  // 启动时全量加载规则和模型到内存
  try {
    await loadRules();
    await loadModels();
  } catch (err) {
    logger.error("规则/模型加载失败，服务仍将启动（路由引擎将无规则可用）", { error: err });
  }

  try {
    await refreshProxyRuntimeFromDb();
  } catch (err) {
    logger.warn("Proxy 运行时配置首次加载失败，使用默认值", { error: err });
  }

  // 订阅 Redis Pub/Sub 规则更新通知
  subscribeToRuleUpdates(() => {
    loadRules().catch((err) => logger.error("规则热更新失败", { error: err }));
    loadModels().catch((err) => logger.error("模型热更新失败", { error: err }));
  });

  subscribeToProxyConfigUpdates(() => {
    refreshProxyRuntimeFromDb().catch((err) =>
      logger.error("Proxy 运行时配置热更新失败", { error: err }),
    );
  });

  subscribeToApiTokenInvalidations();

  const server = app.listen(config.port, () => {
    logger.info(`Proxy 服务启动`, { port: config.port });
  });

  function shutdown(): void {
    logger.info("收到终止信号，正在优雅关闭...");
    server.close(() => {
      Promise.all([closeRedis(), closeDbPool()])
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
    });

    setTimeout(() => {
      logger.error("优雅关闭超时，强制退出");
      process.exit(1);
    }, 10_000).unref();
  }

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

bootstrap().catch((err) => {
  logger.error("启动失败", { error: err });
  process.exit(1);
});

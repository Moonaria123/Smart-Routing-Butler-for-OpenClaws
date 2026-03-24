// Proxy 进程内可调配置：L0.5 超时与 L1 fallback 开关；env 优先于 DB，禁止每请求查库。
import { getDbPool } from "./cache/db.js";
import { logger } from "./utils/logger.js";

const MS_MIN = 10;
const MS_MAX = 200;

let semanticCacheCheckMs = 55;
let fallbackOnInvalidL1Target = false;
/** ISSUE-V5-09：是否调用 Router L2（语义路由）；默认 true */
let routingEnableL2 = true;
/** ISSUE-V5-09：是否调用 Router L3（Arch-Router）；默认 true */
let routingEnableL3 = true;

function clampMs(n: number): number {
  if (Number.isNaN(n)) return 55;
  return Math.min(MS_MAX, Math.max(MS_MIN, n));
}

function parseEnvBool(raw: string | undefined): boolean | null {
  if (raw === undefined || raw.trim() === "") return null;
  const v = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return null;
}

/** L0.5 语义缓存检查 HTTP 超时（ms），env > DB > 默认 55 */
export function getSemanticCacheCheckMs(): number {
  return semanticCacheCheckMs;
}

/** L1 命中但 target 无法解析时是否继续走 fallbackChain（401/403 仍不重试） */
export function getFallbackOnInvalidL1Target(): boolean {
  return fallbackOnInvalidL1Target;
}

/** 是否启用 L2 语义路由（关闭则 L1 未命中后跳过 L2） */
export function getRoutingEnableL2(): boolean {
  return routingEnableL2;
}

/** 是否启用 L3 Arch-Router（关闭则跳过 L3；L2 仍可单独关闭） */
export function getRoutingEnableL3(): boolean {
  return routingEnableL3;
}

export async function refreshProxyRuntimeFromDb(): Promise<void> {
  const envMs = process.env.SEMANTIC_CACHE_CHECK_TIMEOUT_MS;
  if (envMs !== undefined && envMs.trim() !== "") {
    semanticCacheCheckMs = clampMs(parseInt(envMs, 10));
  } else {
    let dbMs: number | null = null;
    try {
      const pool = getDbPool();
      const { rows } = await pool.query<{ value: unknown }>(
        `SELECT value FROM system_config WHERE key = $1 LIMIT 1`,
        ["semantic_cache_check_timeout_ms"],
      );
      if (rows.length > 0) {
        const v = rows[0].value;
        if (typeof v === "number") dbMs = v;
        else if (v != null && typeof v === "object" && "ms" in v && typeof (v as { ms: unknown }).ms === "number") {
          dbMs = (v as { ms: number }).ms;
        }
      }
    } catch (err) {
      logger.warn("读取 semantic_cache_check_timeout_ms 失败，使用内存旧值", {
        error: (err as Error).message,
      });
    }
    semanticCacheCheckMs = clampMs(dbMs ?? 55);
  }

  const envFb = parseEnvBool(process.env.FALLBACK_ON_INVALID_L1_TARGET);
  if (envFb !== null) {
    fallbackOnInvalidL1Target = envFb;
  } else {
    let enabled = false;
    try {
      const pool = getDbPool();
      const { rows } = await pool.query<{ value: unknown }>(
        `SELECT value FROM system_config WHERE key = $1 LIMIT 1`,
        ["fallback_on_invalid_l1_target"],
      );
      if (rows.length > 0) {
        const v = rows[0].value;
        if (typeof v === "boolean") enabled = v;
        else if (v != null && typeof v === "object" && "enabled" in v && typeof (v as { enabled: unknown }).enabled === "boolean") {
          enabled = (v as { enabled: boolean }).enabled;
        }
      }
    } catch (err) {
      logger.warn("读取 fallback_on_invalid_l1_target 失败，使用内存旧值", {
        error: (err as Error).message,
      });
    }
    fallbackOnInvalidL1Target = enabled;
  }

  const envL2 = parseEnvBool(process.env.ROUTING_ENABLE_L2);
  if (envL2 !== null) {
    routingEnableL2 = envL2;
  } else {
    let l2 = true;
    try {
      const pool = getDbPool();
      const { rows } = await pool.query<{ value: unknown }>(
        `SELECT value FROM system_config WHERE key = $1 LIMIT 1`,
        ["routing_enable_l2"],
      );
      if (rows.length > 0) {
        const v = rows[0].value;
        if (typeof v === "boolean") l2 = v;
        else if (v != null && typeof v === "object" && "enabled" in v && typeof (v as { enabled: unknown }).enabled === "boolean") {
          l2 = (v as { enabled: boolean }).enabled;
        }
      }
    } catch (err) {
      logger.warn("读取 routing_enable_l2 失败，使用内存旧值", {
        error: (err as Error).message,
      });
    }
    routingEnableL2 = l2;
  }

  const envL3 = parseEnvBool(process.env.ROUTING_ENABLE_L3);
  if (envL3 !== null) {
    routingEnableL3 = envL3;
  } else {
    let l3 = true;
    try {
      const pool = getDbPool();
      const { rows } = await pool.query<{ value: unknown }>(
        `SELECT value FROM system_config WHERE key = $1 LIMIT 1`,
        ["routing_enable_l3"],
      );
      if (rows.length > 0) {
        const v = rows[0].value;
        if (typeof v === "boolean") l3 = v;
        else if (v != null && typeof v === "object" && "enabled" in v && typeof (v as { enabled: unknown }).enabled === "boolean") {
          l3 = (v as { enabled: boolean }).enabled;
        }
      }
    } catch (err) {
      logger.warn("读取 routing_enable_l3 失败，使用内存旧值", {
        error: (err as Error).message,
      });
    }
    routingEnableL3 = l3;
  }

  logger.info("Proxy 运行时配置已刷新", {
    semanticCacheCheckMs,
    fallbackOnInvalidL1Target,
    routingEnableL2,
    routingEnableL3,
  });
}

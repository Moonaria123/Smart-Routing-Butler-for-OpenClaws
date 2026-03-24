// 环境变量加载与校验
import "dotenv/config";

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`缺少必需的环境变量: ${key}`);
  return val;
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  port: parseInt(optionalEnv("PORT", "8080"), 10),

  pythonRouterUrl: optionalEnv("PYTHON_ROUTER_URL", "http://router:8001"),
  redisUrl: optionalEnv("REDIS_URL", "redis://redis:6379"),
  databaseUrl: requireEnv("DATABASE_URL"),
  encryptionKey: requireEnv("ENCRYPTION_KEY"),
  ollamaUrl: optionalEnv("OLLAMA_URL", "http://host.docker.internal:11434"),

  timeouts: {
    /** L0.5 语义缓存检查 HTTP 超时（ms），默认 55，见 ISSUE-V4-03 */
    semanticCacheCheck: parseInt(
      optionalEnv("SEMANTIC_CACHE_CHECK_TIMEOUT_MS", "55"),
      10,
    ),
    l2Semantic: 55,
    l3ArchRouter: 140,
    providerApi: 30_000,
    providerTest: 5_000,
  },

  circuitBreaker: {
    ttlSeconds: 60,
    consecutive5xxThreshold: 3,
  },

  cache: {
    defaultExactTtl: 86400,
    defaultSemanticTtl: 86400,
  },
} as const;

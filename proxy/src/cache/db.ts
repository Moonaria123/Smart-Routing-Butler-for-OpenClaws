// PostgreSQL 连接池——仅用于启动时加载规则和 Token 验证
import pg from "pg";
import { config } from "../config.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getDbPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({ connectionString: config.databaseUrl, max: 5 });
  }
  return pool;
}

export async function closeDbPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// 异步请求日志——setImmediate 延迟写入 DB，支持批量 INSERT 降低 QPS 压力
import { createId } from "@paralleldrive/cuid2";
import { getDbPool } from "./db.js";
import { logger } from "../utils/logger.js";

export interface RequestLogData {
  routingLayer: string;
  ruleId: string | null;
  targetModel: string;
  confidence: number | null;
  latencyMs: number;
  routingLatencyMs: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  statusCode: number;
  streaming: boolean;
  cacheHit: boolean;
  thinkingEnabled: boolean;
  modalities: string[];
  apiTokenId: string | null;
  apiTokenName: string | null;
}

const BATCH_SIZE = 25;
const FLUSH_MS = 50;
const queue: RequestLogData[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush(): void {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushQueue();
  }, FLUSH_MS);
}

async function flushQueue(): Promise<void> {
  if (queue.length === 0) return;
  const batch = queue.splice(0, BATCH_SIZE);
  const pool = getDbPool();

  const values: unknown[] = [];
  const placeholders: string[] = [];
  const paramsPerRow = 17;
  for (let idx = 0; idx < batch.length; idx++) {
    const row = batch[idx];
    const id = createId();
    const base = idx * paramsPerRow;
    placeholders.push(
      `($${base + 1}, NOW(), $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5},
        $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9},
        $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14}, $${base + 15}, $${base + 16}, $${base + 17}, NOW())`,
    );
    values.push(
      id,
      row.routingLayer,
      row.ruleId,
      row.targetModel,
      row.confidence,
      row.latencyMs,
      row.routingLatencyMs,
      row.inputTokens,
      row.outputTokens,
      row.estimatedCostUsd,
      row.statusCode,
      row.streaming,
      row.cacheHit,
      row.thinkingEnabled,
      row.modalities,
      row.apiTokenId,
      row.apiTokenName,
    );
  }

  try {
    await pool.query(
      `INSERT INTO request_logs (
          id, timestamp, "routingLayer", "ruleId", "targetModel", confidence,
          "latencyMs", "routingLatencyMs", "inputTokens", "outputTokens",
          "estimatedCostUsd", "statusCode", streaming, "cacheHit", "thinkingEnabled", modalities, "apiTokenId", "apiTokenName", "createdAt"
        ) VALUES ${placeholders.join(", ")}`,
      values,
    );
  } catch (err) {
    logger.error("请求日志批量写入失败，降级为逐条写入", { error: err });
    for (const row of batch) {
      try {
        const id = createId();
        await pool.query(
          `INSERT INTO request_logs (
            id, timestamp, "routingLayer", "ruleId", "targetModel", confidence,
            "latencyMs", "routingLatencyMs", "inputTokens", "outputTokens",
            "estimatedCostUsd", "statusCode", streaming, "cacheHit", "thinkingEnabled", modalities, "apiTokenId", "apiTokenName", "createdAt"
          ) VALUES (
            $1, NOW(), $2, $3, $4, $5,
            $6, $7, $8, $9,
            $10, $11, $12, $13, $14, $15, $16, $17, NOW()
          )`,
          [
            id,
            row.routingLayer,
            row.ruleId,
            row.targetModel,
            row.confidence,
            row.latencyMs,
            row.routingLatencyMs,
            row.inputTokens,
            row.outputTokens,
            row.estimatedCostUsd,
            row.statusCode,
            row.streaming,
            row.cacheHit,
            row.thinkingEnabled,
            row.modalities,
            row.apiTokenId,
            row.apiTokenName,
          ],
        );
      } catch (e2) {
        logger.error("请求日志单条写入失败", { error: e2 });
      }
    }
  }

  if (queue.length > 0) {
    scheduleFlush();
  }
}

export function logRequest(data: RequestLogData): void {
  setImmediate(() => {
    queue.push(data);
    if (queue.length >= BATCH_SIZE) {
      void flushQueue();
    } else {
      scheduleFlush();
    }
  });
}

// L1 规则命中统计——异步 UPDATE，不阻塞路由主路径
import { getDbPool } from "../cache/db.js";
import { logger } from "../utils/logger.js";

/** 规则命中后异步递增 hitCount、更新 lastHitAt（setImmediate 内执行） */
export function scheduleRuleHitUpdate(ruleId: string): void {
  setImmediate(() => {
    const pool = getDbPool();
    pool
      .query(
        `UPDATE rules
         SET "hitCount" = "hitCount" + 1,
             "lastHitAt" = NOW(),
             "updatedAt" = NOW()
         WHERE id = $1`,
        [ruleId],
      )
      .catch((err: unknown) => {
        logger.error("规则命中计数更新失败", { ruleId, error: err });
      });
  });
}

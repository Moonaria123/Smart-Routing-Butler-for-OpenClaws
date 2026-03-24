-- RequestLog：按状态码筛选与按时间+状态联合查询（US-015）
CREATE INDEX IF NOT EXISTS "request_logs_statusCode_idx" ON "request_logs"("statusCode");
CREATE INDEX IF NOT EXISTS "request_logs_timestamp_statusCode_idx" ON "request_logs"("timestamp", "statusCode");

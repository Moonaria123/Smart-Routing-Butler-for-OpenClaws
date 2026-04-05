-- V5-18: 模型 thinking 模式字段 + 请求日志 thinkingEnabled
ALTER TABLE "models" ADD COLUMN "supportsThinking" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "models" ADD COLUMN "defaultThinking" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "request_logs" ADD COLUMN "thinkingEnabled" BOOLEAN NOT NULL DEFAULT false;

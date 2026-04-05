-- AlterTable: 为 request_logs 添加 API Token 维度字段（ISSUE-V5-17）
ALTER TABLE "request_logs" ADD COLUMN "apiTokenId" TEXT;
ALTER TABLE "request_logs" ADD COLUMN "apiTokenName" TEXT;

-- CreateIndex
CREATE INDEX "request_logs_apiTokenId_idx" ON "request_logs" ("apiTokenId");

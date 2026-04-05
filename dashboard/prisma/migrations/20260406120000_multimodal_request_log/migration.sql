-- AlterTable: 为 request_logs 添加 modalities 列（多模态请求追踪）
ALTER TABLE "request_logs" ADD COLUMN "modalities" TEXT[] NOT NULL DEFAULT ARRAY['text']::TEXT[];

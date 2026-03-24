-- AlterTable
ALTER TABLE "api_tokens" ADD COLUMN "systemManaged" BOOLEAN NOT NULL DEFAULT false;

-- 迁移旧版中文名称的内部 Token，并标记为系统托管
UPDATE "api_tokens"
SET "systemManaged" = true,
    "name" = 'Dashboard Internal LLM (auto)'
WHERE "name" = 'Dashboard 内部 LLM（自动）';

-- 已为英文名但尚未打标的内部 Token（例如先行手工改名）
UPDATE "api_tokens"
SET "systemManaged" = true
WHERE "name" = 'Dashboard Internal LLM (auto)';

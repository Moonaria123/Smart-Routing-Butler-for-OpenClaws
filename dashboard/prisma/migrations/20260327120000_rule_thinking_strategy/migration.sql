-- V5-18: 规则级思维策略字段
ALTER TABLE "rules" ADD COLUMN "thinkingStrategy" TEXT NOT NULL DEFAULT 'auto';

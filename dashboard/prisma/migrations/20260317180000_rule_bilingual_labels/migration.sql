-- 规则中英文名称与描述（控制台双语展示；路由逻辑仍仅用 name/description 存主语言）
ALTER TABLE "rules" ADD COLUMN "nameEn" TEXT;
ALTER TABLE "rules" ADD COLUMN "descriptionEn" TEXT;

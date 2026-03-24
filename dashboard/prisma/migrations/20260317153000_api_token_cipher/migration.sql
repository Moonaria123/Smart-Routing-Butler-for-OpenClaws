-- ApiToken：可选密文字段，供开启「允许再次复制」时加密保存明文（ISSUE-V3-05）
ALTER TABLE "api_tokens" ADD COLUMN IF NOT EXISTS "tokenCipher" TEXT;

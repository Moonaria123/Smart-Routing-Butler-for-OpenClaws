// AES-256-GCM 加密/解密 — 与 proxy/src/utils/crypto.ts 同一密文格式（iv:authTag:ciphertext，IV=16 字节）
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("ENCRYPTION_KEY 环境变量缺失");
  }
  const buf = Buffer.from(raw, "utf-8");
  if (buf.length < 32) {
    throw new Error(
      `ENCRYPTION_KEY 必须至少 32 字节（当前 ${buf.length} 字节）`
    );
  }
  return buf.subarray(0, 32);
}

/** 新数据统一使用与 Proxy 一致的冒号分隔格式，便于单栈解密与运维 */
export function encrypt(text: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, "utf-8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}

const LEGACY_IV_LENGTH = 12;

export function decrypt(encrypted: string): string {
  const key = getKey();

  const parts = encrypted.split(":");
  if (parts.length === 3) {
    try {
      const iv = Buffer.from(parts[0], "base64");
      const authTag = Buffer.from(parts[1], "base64");
      const ciphertext = parts[2];
      if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
        throw new Error("密文 IV 或 AuthTag 长度错误");
      }
      const decipher = createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(ciphertext, "base64", "utf-8");
      decrypted += decipher.final("utf-8");
      return decrypted;
    } catch {
      /* 尝试旧格式 */
    }
  }

  try {
    const combined = Buffer.from(encrypted, "base64");
    if (combined.length < LEGACY_IV_LENGTH + AUTH_TAG_LENGTH + 1) {
      throw new Error("密文长度不足");
    }
    const iv = combined.subarray(0, LEGACY_IV_LENGTH);
    const authTag = combined.subarray(
      LEGACY_IV_LENGTH,
      LEGACY_IV_LENGTH + AUTH_TAG_LENGTH
    );
    const ciphertext = combined.subarray(LEGACY_IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf-8");
  } catch {
    throw new Error("密文解密失败（不兼容的 ENCRYPTION_KEY 或密文格式）");
  }
}

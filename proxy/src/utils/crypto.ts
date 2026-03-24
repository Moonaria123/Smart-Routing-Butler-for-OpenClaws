// AES-256-GCM 加密/解密——API Key 存储安全
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { config } from "../config.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getKeyBuffer(): Buffer {
  const key = Buffer.from(config.encryptionKey, "utf-8");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY 必须为 32 字节");
  }
  return key;
}

export function encrypt(plaintext: string): string {
  const key = getKeyBuffer();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf-8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}

export function decrypt(ciphertext: string): string {
  const key = getKeyBuffer();

  // 兼容两种密文格式：
  // 1) 当前 Proxy 加密格式：iv:authTag:base64(ciphertext)（IV=16 bytes）
  // 2) Dashboard 早期加密格式：base64(iv(12) + authTag(16) + ciphertext)，无分隔符
  const parts = ciphertext.split(":");
  if (parts.length === 3) {
    try {
      const iv = Buffer.from(parts[0], "base64");
      const authTag = Buffer.from(parts[1], "base64");
      const encrypted = parts[2];

      if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
        throw new Error("密文 IV 或 AuthTag 长度错误");
      }

      const decipher = createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, "base64", "utf-8");
      decrypted += decipher.final("utf-8");
      return decrypted;
    } catch {
      // 继续尝试第二种格式
    }
  }

  // 尝试 Dashboard 拼接格式
  try {
    const raw = Buffer.from(ciphertext, "base64");
    const dashIvLength = 12;
    const dashAuthTagLength = AUTH_TAG_LENGTH;
    if (raw.length < dashIvLength + dashAuthTagLength + 1) {
      throw new Error("密文长度不足（dashboard 拼接格式）");
    }

    const iv = raw.subarray(0, dashIvLength);
    const authTag = raw.subarray(dashIvLength, dashIvLength + dashAuthTagLength);
    const encrypted = raw.subarray(dashIvLength + dashAuthTagLength);

    const decipher = createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf-8");
    return decrypted;
  } catch {
    throw new Error("密文解密失败（不兼容的 ENCRYPTION_KEY 或密文格式）");
  }
}

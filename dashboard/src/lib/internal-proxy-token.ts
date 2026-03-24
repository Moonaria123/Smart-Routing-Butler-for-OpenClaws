// 为 Dashboard 服务端调用 Proxy（LLM）自动获取 Bearer Token；`INTERNAL_PROXY_TOKEN_DISPLAY_NAME` 为系统签发 Token 的固定英文名称
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";

export const INTERNAL_PROXY_TOKEN_DISPLAY_NAME =
  "Dashboard Internal LLM (auto)" as const;

const CONFIG_KEY_PREFIX = "internal_proxy_token_";

function configKeyForUser(userId: string): string {
  return `${CONFIG_KEY_PREFIX}${userId}`;
}

/** 若配置了 INTERNAL_API_TOKEN 则优先使用（运维覆盖） */
export async function getOrCreateInternalProxyToken(userId: string): Promise<string> {
  const envToken = process.env.INTERNAL_API_TOKEN?.trim();
  if (envToken) return envToken;

  const key = configKeyForUser(userId);
  const row = await db.systemConfig.findUnique({ where: { key } });
  if (row?.value != null) {
    const raw = row.value as unknown;
    let cipher: string | undefined;
    if (typeof raw === "string") cipher = raw;
    else if (raw && typeof raw === "object" && "cipher" in raw && typeof (raw as { cipher: string }).cipher === "string")
      cipher = (raw as { cipher: string }).cipher;
    if (cipher) {
      try {
        const plainToken = decrypt(cipher);
        const hash = createHash("sha256").update(plainToken).digest("hex");
        const valid = await db.apiToken.findFirst({
          where: { tokenHash: hash, revokedAt: null },
        });
        if (valid) return plainToken;
        // token 已被吊销或删除，fall through 重新签发
      } catch {
        // 解密失败则重新签发
      }
    }
  }

  const rawToken = `sr_${randomBytes(48).toString("hex")}`;
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const tokenSuffix = rawToken.slice(-4);

  await db.apiToken.create({
    data: {
      name: INTERNAL_PROXY_TOKEN_DISPLAY_NAME,
      tokenHash,
      tokenSuffix,
      userId,
      systemManaged: true,
    },
  });

  const cipher = encrypt(rawToken);
  await db.systemConfig.upsert({
    where: { key },
    create: { key, value: { cipher } },
    update: { value: { cipher } },
  });

  return rawToken;
}

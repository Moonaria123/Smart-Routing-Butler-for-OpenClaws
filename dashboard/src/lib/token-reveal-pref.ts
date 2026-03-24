// API Token「允许再次复制」偏好 — 存 system_config，键按用户隔离
import { db } from "@/lib/db";

const key = (userId: string) => `token_reveal_pref:${userId}`;

export async function getTokenRevealAllowed(userId: string): Promise<boolean> {
  const row = await db.systemConfig.findUnique({
    where: { key: key(userId) },
  });
  if (row?.value == null) {
    return false;
  }
  if (typeof row.value === "object" && row.value !== null && "allow" in row.value) {
    return (row.value as { allow?: boolean }).allow === true;
  }
  return false;
}

export async function setTokenRevealAllowed(
  userId: string,
  allow: boolean,
): Promise<void> {
  await db.systemConfig.upsert({
    where: { key: key(userId) },
    create: {
      key: key(userId),
      value: { allow },
    },
    update: { value: { allow } },
  });
}

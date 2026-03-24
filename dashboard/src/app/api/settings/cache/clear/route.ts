// 缓存清除 API — 使用 SCAN + Pipeline 安全清除缓存键
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-guard";
import { getRedis } from "@/lib/redis";
import { logServerError } from "@/lib/server-logger";

export async function POST() {
  const { error } = await requireSession();
  if (error) return error;

  const redis = getRedis();
  let totalDeleted = 0;

  try {
    for (const prefix of ["exact:*", "semantic:*"]) {
      let cursor = "0";
      do {
        const [nextCursor, keys] = await redis.scan(
          cursor,
          "MATCH",
          prefix,
          "COUNT",
          200
        );
        cursor = nextCursor;
        if (keys.length > 0) {
          const pipeline = redis.pipeline();
          for (const key of keys) {
            pipeline.del(key);
          }
          await pipeline.exec();
          totalDeleted += keys.length;
        }
      } while (cursor !== "0");
    }

    return NextResponse.json({ deleted: totalDeleted });
  } catch (e) {
    logServerError("settings/cache/clear", e);
    return NextResponse.json(
      { error: "缓存清除失败，请稍后重试" },
      { status: 500 }
    );
  }
}

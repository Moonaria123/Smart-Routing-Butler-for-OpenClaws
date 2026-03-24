// 手动重置熔断器 — 删除 `circuit:<provider>/<model>` 与 `circuit:fail_count:*`
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-guard";
import { getRedis } from "@/lib/redis";
import { logServerError } from "@/lib/server-logger";

type RouteCtx = { params: Promise<{ model: string }> };

export async function POST(_request: Request, ctx: RouteCtx) {
  const { error } = await requireSession();
  if (error) return error;

  const { model: encoded } = await ctx.params;
  let providerModel: string;
  try {
    providerModel = decodeURIComponent(encoded);
  } catch {
    return NextResponse.json({ error: "无效的 model 参数" }, { status: 400 });
  }

  if (!providerModel || providerModel.includes("..")) {
    return NextResponse.json({ error: "无效的 model 参数" }, { status: 400 });
  }

  const circuitKey = `circuit:${providerModel}`;
  const failCountKey = `circuit:fail_count:${providerModel}`;

  try {
    const redis = getRedis();
    const deleted = await redis.del(circuitKey, failCountKey);
    return NextResponse.json({
      ok: true,
      model: providerModel,
      deletedKeys: deleted,
    });
  } catch (e) {
    logServerError("circuit-breakers/reset", e);
    return NextResponse.json({ error: "重置失败" }, { status: 500 });
  }
}

// 已启用 Provider + 模型白名单 — 供 NL/问卷规则生成校验与提示词注入（ISSUE-V3-15）
import { db } from "@/lib/db";

export type ModelAllowlistMaps = {
  /** 合法复合键 `ProviderName/modelId` */
  refSet: Set<string>;
  /** 裸 modelId → 可能对应多条（多 Provider 同名 modelId） */
  byBareModelId: Map<string, string[]>;
};

/** 从数据库加载当前可路由模型白名单 */
export async function loadEnabledModelAllowlist(): Promise<ModelAllowlistMaps> {
  const rows = await db.model.findMany({
    where: { enabled: true, provider: { enabled: true } },
    select: { modelId: true, provider: { select: { name: true } } },
  });
  const refSet = new Set<string>();
  const byBareModelId = new Map<string, string[]>();
  for (const m of rows) {
    const ref = `${m.provider.name}/${m.modelId}`;
    refSet.add(ref);
    const list = byBareModelId.get(m.modelId) ?? [];
    list.push(ref);
    byBareModelId.set(m.modelId, list);
  }
  for (const [, list] of byBareModelId) {
    list.sort();
  }
  return { refSet, byBareModelId };
}

// Ollama /api/tags 响应是否包含指定模型名
// 与 router health._model_in_tags 对齐，供 L3「测试配置」与 Router 行为一致
export function isArchModelPresentInTags(
  tagsBody: unknown,
  modelName: string
): boolean {
  if (typeof tagsBody !== "object" || tagsBody === null) return false;
  const raw = (tagsBody as { models?: unknown }).models;
  if (!Array.isArray(raw)) return false;
  const prefix = modelName.split(":")[0] ?? "";
  for (const m of raw) {
    if (typeof m !== "object" || m === null || !("name" in m)) continue;
    const name = (m as { name: unknown }).name;
    if (typeof name !== "string") continue;
    if (name === modelName || name.startsWith(`${prefix}:`)) return true;
  }
  return false;
}

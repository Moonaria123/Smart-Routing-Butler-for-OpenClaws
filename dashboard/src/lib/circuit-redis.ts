// 熔断器 Redis 键解析与 JSON 展示字段 — 与 Proxy `circuitBreaker.ts` snake_case 对齐
/** 主熔断 key：`circuit:<provider>/<model>`，非 `circuit:fail_count:*` */
export function isCircuitBreakerOpenKey(key: string): boolean {
  if (!key.startsWith("circuit:")) return false;
  if (key.startsWith("circuit:fail_count:")) return false;
  return true;
}

/** `circuit:<provider>/<model>` → `provider/model` */
export function providerModelFromCircuitKey(key: string): string {
  return key.slice("circuit:".length);
}

export interface CircuitBreakerView {
  model: string;
  state: string;
  triggeredBy: string;
  openedAt: string;
  until: string;
}

/** 将 Proxy 写入的 snake_case 与历史 camelCase 统一为 API 展示字段 */
export function normalizeCircuitPayload(data: Record<string, unknown>): Omit<
  CircuitBreakerView,
  "model"
> {
  const triggered =
    (typeof data.triggeredBy === "string" && data.triggeredBy) ||
    (typeof data.triggered_by === "string" && data.triggered_by) ||
    "unknown";
  const openedRaw = data.openedAt ?? data.opened_at;
  const untilRaw = data.until;
  const openedAt =
    typeof openedRaw === "number"
      ? new Date(openedRaw).toISOString()
      : typeof openedRaw === "string"
        ? openedRaw
        : "";
  const until =
    typeof untilRaw === "number"
      ? new Date(untilRaw).toISOString()
      : typeof untilRaw === "string"
        ? untilRaw
        : "";
  return {
    state: String(data.state ?? "open"),
    triggeredBy: triggered,
    openedAt,
    until,
  };
}

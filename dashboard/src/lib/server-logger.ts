// 服务端 API Route 错误诊断 — setImmediate 异步写一行 JSON，便于平台采集（AUDIT-009）

/** 异步记录错误，不阻塞响应返回后的收尾；与 proxy `logger` 的异步写日志思路一致 */
export function logServerError(scope: string, err: unknown): void {
  setImmediate(() => {
    const base =
      err instanceof Error
        ? { name: err.name, message: err.message, stack: err.stack }
        : { message: String(err) };
    console.error(
      JSON.stringify({
        source: "dashboard-api",
        scope,
        level: "error",
        time: new Date().toISOString(),
        ...base,
      }),
    );
  });
}

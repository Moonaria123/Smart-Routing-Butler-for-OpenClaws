// 异步日志——所有日志使用 setImmediate 写入，不阻塞响应路径

type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  data?: unknown;
}

/** 将 Error / 嵌套对象转为可 JSON 序列化的结构（避免 Error 被序列化为 {}） */
export function serializeForLog(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      cause: value.cause !== undefined ? serializeForLog(value.cause) : undefined,
    };
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => serializeForLog(v));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = serializeForLog(v);
  }
  return out;
}

function write(entry: LogEntry): void {
  setImmediate(() => {
    const serializable =
      entry.data === undefined
        ? entry
        : { ...entry, data: serializeForLog(entry.data) };
    const line = JSON.stringify(serializable);
    if (entry.level === "error") {
      process.stderr.write(line + "\n");
    } else {
      process.stdout.write(line + "\n");
    }
  });
}

export const logger = {
  info(message: string, data?: unknown): void {
    write({ level: "info", message, timestamp: new Date().toISOString(), data });
  },
  warn(message: string, data?: unknown): void {
    write({ level: "warn", message, timestamp: new Date().toISOString(), data });
  },
  error(message: string, data?: unknown): void {
    write({ level: "error", message, timestamp: new Date().toISOString(), data });
  },
  debug(message: string, data?: unknown): void {
    if (process.env.NODE_ENV !== "production") {
      write({ level: "debug", message, timestamp: new Date().toISOString(), data });
    }
  },
};

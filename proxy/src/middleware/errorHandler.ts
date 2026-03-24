// 统一错误处理中间件——按 api-contracts.md 格式返回错误
import type { Request, Response, NextFunction } from "express";
import type { ErrorType, ErrorCode } from "../types/index.js";
import { logger } from "../utils/logger.js";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly type: ErrorType,
    public readonly code: ErrorCode,
    message: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        message: err.message,
        type: err.type,
        code: err.code,
      },
    });
    return;
  }

  logger.error("未处理的内部错误", {
    name: err.name,
    message: err.message,
    stack: process.env.NODE_ENV !== "production" ? err.stack : undefined,
  });

  res.status(500).json({
    error: {
      message: "内部服务器错误",
      type: "server_error" as ErrorType,
      code: "internal_error" as ErrorCode,
    },
  });
}

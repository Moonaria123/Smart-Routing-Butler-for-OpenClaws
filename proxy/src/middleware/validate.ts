// Zod Schema 验证中间件
import type { Request, Response, NextFunction } from "express";
import type { ZodSchema, ZodError } from "zod";

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const zodError = result.error as ZodError;
      const message = zodError.errors
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join("; ");

      res.status(400).json({
        error: {
          message,
          type: "invalid_request_error",
          code: "invalid_messages",
        },
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

// POST /v1/images/generations — OpenAI Images API 兼容端点 (ISSUE-V5-16)
import { Router } from "express";
import type { Request, Response as ExpressResponse } from "express";
import { z } from "zod";
import { AppError } from "../middleware/errorHandler.js";
import { validate } from "../middleware/validate.js";
import { logger } from "../utils/logger.js";
import { resolveProvider } from "../providers/registry.js";
import { logRequest } from "../cache/requestLogger.js";
import { config } from "../config.js";
import { executeWithCircuitBreaker } from "../circuit/circuitBreaker.js";
import { getEnableImageGeneration } from "../runtimeConfig.js";
import { getDbPool } from "../cache/db.js";
import { UpstreamCallError } from "../types/errors.js";

const imageGenerationSchema = z.object({
  prompt: z.string().min(1),
  model: z.string().optional(),
  n: z.number().int().min(1).max(10).optional(),
  size: z.string().optional(),
  quality: z.string().optional(),
  response_format: z.enum(["url", "b64_json"]).optional(),
  style: z.string().optional(),
  user: z.string().optional(),
});

type ImageBody = z.infer<typeof imageGenerationSchema>;

const router = Router();

/**
 * 自动选择第一个具备 "image-generation" 能力的已启用模型。
 * 返回 "ProviderName/modelId" 格式。
 */
async function findImageCapableModel(): Promise<string | null> {
  try {
    const pool = getDbPool();
    const result = await pool.query<{ name: string; modelId: string }>(
      `SELECT p.name, m."modelId"
       FROM models m
       JOIN providers p ON p.id = m."providerId"
       WHERE m.enabled = true AND p.enabled = true
         AND 'image-generation' = ANY(m.features)
       ORDER BY p.name, m."modelId"
       LIMIT 1`,
    );
    if (result.rows.length === 0) return null;
    const r = result.rows[0];
    return `${r.name}/${r.modelId}`;
  } catch {
    return null;
  }
}

router.post("/", validate(imageGenerationSchema), async (req: Request, res: ExpressResponse) => {
  const startTime = performance.now();
  const body = req.body as ImageBody;
  const apiToken = (res.locals as Record<string, unknown>).apiToken as { id: string | null; name: string | null } | undefined;

  // 系统级开关
  if (!getEnableImageGeneration()) {
    throw new AppError(404, "invalid_request_error", "model_not_found", "图片生成功能未启用");
  }

  // 确定目标模型
  let targetModel: string;
  let routingLayer: "DIRECT" | "L3_FALLBACK";

  if (body.model) {
    targetModel = body.model;
    routingLayer = "DIRECT";
  } else {
    const auto = await findImageCapableModel();
    if (!auto) {
      throw new AppError(400, "invalid_request_error", "model_not_found", "未找到支持图片生成的模型，请配置至少一个具备 image-generation 能力的模型");
    }
    targetModel = auto;
    routingLayer = "L3_FALLBACK";
  }

  // 解析 Provider
  const resolved = await resolveProvider(targetModel);

  // 硬能力门控：必须具备 image-generation 能力
  const features = resolved.modelConfig?.features ?? [];
  if (!features.includes("image-generation")) {
    throw new AppError(400, "invalid_request_error", "model_not_found", `模型 ${targetModel} 不支持图片生成（缺少 image-generation 能力标签）`);
  }

  // 提取 sendImageRequest 并判空
  const sendImageRequest = resolved.adapter.sendImageRequest;
  if (!sendImageRequest) {
    throw new AppError(501, "server_error", "internal_error", `Provider ${resolved.providerName} 不支持图片生成 API`);
  }
  // 构建请求体
  const requestBody: Record<string, unknown> = {
    prompt: body.prompt,
    model: resolved.modelId,
  };
  if (body.n !== undefined) requestBody.n = body.n;
  if (body.size !== undefined) requestBody.size = body.size;
  if (body.quality !== undefined) requestBody.quality = body.quality;
  if (body.response_format !== undefined) requestBody.response_format = body.response_format;
  if (body.style !== undefined) requestBody.style = body.style;
  if (body.user !== undefined) requestBody.user = body.user;

  // 熔断器包裹调用
  let upstreamResponse: globalThis.Response;
  try {
    upstreamResponse = await executeWithCircuitBreaker(
      targetModel,
      async () => {
        const controller = new AbortController();
        const timeoutHandle = setTimeout(() => controller.abort(), config.timeouts.providerApi);

        let resp: globalThis.Response;
        try {
          resp = await sendImageRequest({
            baseUrl: resolved.baseUrl,
            apiKey: resolved.apiKey,
            body: requestBody,
            signal: controller.signal,
          });
        } catch (err) {
          clearTimeout(timeoutHandle);
          if ((err as Error).name === "AbortError") {
            throw new UpstreamCallError("Provider 响应超时", 0);
          }
          throw new UpstreamCallError("Provider 请求失败", 500);
        }

        if (!resp.ok) {
          clearTimeout(timeoutHandle);
          throw new UpstreamCallError(`Provider 返回 HTTP ${resp.status}`, resp.status);
        }

        clearTimeout(timeoutHandle);
        return resp;
      },
    );
  } catch (err) {
    if (err instanceof AppError) throw err;
    const sc = (err as UpstreamCallError).statusCode ?? 500;
    if (sc === 0) throw new AppError(504, "upstream_error", "upstream_timeout", "Provider 响应超时");
    if (sc === 401 || sc === 403) throw new AppError(502, "upstream_error", "all_providers_failed", "Provider 认证失败");
    if (sc === 429) throw new AppError(429, "rate_limit_error", "rate_limited", "Provider 速率限制");
    throw new AppError(502, "upstream_error", "all_providers_failed", "图片生成 Provider 失败");
  }

  // 透传响应
  try {
    const data = await upstreamResponse.json();
    res.json(data);
  } catch {
    throw new AppError(502, "upstream_error", "upstream_disconnected", "Provider 响应解析失败");
  }

  // 异步日志
  const totalLatency = performance.now() - startTime;
  logRequest({
    routingLayer,
    ruleId: null,
    targetModel,
    confidence: 1,
    latencyMs: Math.round(totalLatency),
    routingLatencyMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    estimatedCostUsd: 0,
    statusCode: 200,
    streaming: false,
    cacheHit: false,
    thinkingEnabled: false,
    modalities: ["image-generation"],
    apiTokenId: apiToken?.id ?? null,
    apiTokenName: apiToken?.name ?? null,
  });

  logger.info("图片生成请求完成", {
    targetModel,
    routingLayer,
    latencyMs: Math.round(totalLatency),
  });
});

export default router;

// Provider 注册表——ApiType → Adapter 映射 + DB 查询解析
import type { ApiType } from "../types/index.js";
import type { ProviderAdapter } from "./base.js";
import { OpenAIAdapter } from "./openai.js";
import { AnthropicAdapter } from "./anthropic.js";
import { GenericAdapter } from "./generic.js";
import { getDbPool } from "../cache/db.js";
import { decrypt } from "../utils/crypto.js";
import { AppError } from "../middleware/errorHandler.js";

const adapters: Record<ApiType, ProviderAdapter> = {
  openai: new OpenAIAdapter(),
  anthropic: new AnthropicAdapter(),
  "openai-compatible": new GenericAdapter(),
};

export function getAdapter(apiType: ApiType): ProviderAdapter {
  return adapters[apiType];
}

export interface ResolvedProvider {
  adapter: ProviderAdapter;
  baseUrl: string;
  apiKey: string;
  modelId: string;
  providerName: string;
  providerConfig: {
    id: string;
    name: string;
    apiType: ApiType;
    enabled: boolean;
  };
  modelConfig: {
    id: string;
    contextWindow: number;
    inputCost: number;
    outputCost: number;
    defaultParams: Record<string, unknown>;
    supportsThinking: boolean;
    defaultThinking: Record<string, unknown>;
    features: string[];
  };
}

/**
 * 根据 "provider-name/model-id" 格式解析 Provider 和 Model 配置。
 * 返回解密后的 API Key、对应的适配器以及完整配置。
 */
export async function resolveProvider(targetModel: string): Promise<ResolvedProvider> {
  const slashIdx = targetModel.indexOf("/");
  if (slashIdx === -1) {
    throw new AppError(400, "invalid_request_error", "model_not_found", `模型格式错误，应为 "provider/model": ${targetModel}`);
  }

  const providerName = targetModel.slice(0, slashIdx);
  const modelId = targetModel.slice(slashIdx + 1);

  const pool = getDbPool();
  const result = await pool.query<{
    p_id: string;
    p_name: string;
    p_base_url: string;
    p_api_key: string;
    p_api_type: string;
    m_id: string;
    m_model_id: string;
    m_context_window: number;
    m_input_cost: number;
    m_output_cost: number;
    m_default_params: Record<string, unknown>;
    m_supports_thinking: boolean;
    m_default_thinking: Record<string, unknown>;
    m_features: string[];
  }>(
    `SELECT
       p.id         AS p_id,
       p.name       AS p_name,
       p."baseUrl"  AS p_base_url,
       p."apiKey"   AS p_api_key,
       p."apiType"  AS p_api_type,
       m.id         AS m_id,
       m."modelId"  AS m_model_id,
       m."contextWindow" AS m_context_window,
       m."inputCost"     AS m_input_cost,
       m."outputCost"    AS m_output_cost,
       m."defaultParams" AS m_default_params,
       m."supportsThinking" AS m_supports_thinking,
       m."defaultThinking"  AS m_default_thinking,
       m.features        AS m_features
     FROM providers p
     JOIN models m ON m."providerId" = p.id
     WHERE p.name = $1
       AND m."modelId" = $2
       AND p.enabled = true
       AND m.enabled = true
     LIMIT 1`,
    [providerName, modelId],
  );

  if (result.rows.length === 0) {
    throw new AppError(404, "invalid_request_error", "model_not_found", `模型未找到或已禁用: ${targetModel}`);
  }

  const row = result.rows[0];
  const apiType = row.p_api_type as ApiType;

  const validApiTypes: readonly ApiType[] = ["openai", "anthropic", "openai-compatible"];
  if (!validApiTypes.includes(apiType)) {
    throw new AppError(500, "server_error", "internal_error", `不支持的 API 类型: ${apiType}`);
  }

  let decryptedKey: string;
  try {
    decryptedKey = decrypt(row.p_api_key);
  } catch {
    throw new AppError(500, "server_error", "all_providers_failed", "Provider 密钥解密失败");
  }

  return {
    adapter: getAdapter(apiType),
    baseUrl: row.p_base_url,
    apiKey: decryptedKey,
    modelId: row.m_model_id,
    providerName: row.p_name,
    providerConfig: {
      id: row.p_id,
      name: row.p_name,
      apiType,
      enabled: true,
    },
    modelConfig: {
      id: row.m_id,
      contextWindow: row.m_context_window,
      inputCost: row.m_input_cost,
      outputCost: row.m_output_cost,
      defaultParams: row.m_default_params ?? {},
      supportsThinking: row.m_supports_thinking ?? false,
      defaultThinking: row.m_default_thinking ?? {},
      features: row.m_features ?? [],
    },
  };
}

// 共享类型定义——与 contracts/database-schema.prisma 和 contracts/api-contracts.md 对齐

// --- 多模态内容类型 (ISSUE-V5-16) ---

export interface TextContentPart {
  type: "text";
  text: string;
}

export interface ImageUrlContentPart {
  type: "image_url";
  image_url: { url: string; detail?: "auto" | "low" | "high" };
}

export interface InputAudioContentPart {
  type: "input_audio";
  input_audio: { data: string; format: "wav" | "mp3" };
}

export type ContentPart = TextContentPart | ImageUrlContentPart | InputAudioContentPart;

/** 消息内容：纯文本字符串，或 OpenAI 兼容的多模态内容块数组 */
export type MessageContent = string | ContentPart[];

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: MessageContent;
  name?: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[] | null;
  user?: string;
}

export interface ChatCompletionChoice {
  index: number;
  message: ChatMessage;
  finish_reason: "stop" | "length" | "tool_calls" | null;
}

export interface ChatCompletionUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage: ChatCompletionUsage;
}

export interface StreamChunkChoice {
  index: number;
  delta: Partial<ChatMessage>;
  finish_reason: "stop" | "length" | "tool_calls" | null;
}

export interface ChatCompletionChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: StreamChunkChoice[];
}

// --- 错误响应 ---

export type ErrorType =
  | "invalid_request_error"
  | "authentication_error"
  | "rate_limit_error"
  | "server_error"
  | "upstream_error";

export type ErrorCode =
  | "invalid_api_key"
  | "token_revoked"
  | "model_not_found"
  | "invalid_messages"
  | "all_providers_failed"
  | "upstream_timeout"
  | "upstream_disconnected"
  | "rate_limited"
  | "internal_error";

export interface ApiError {
  error: {
    message: string;
    type: ErrorType;
    code: ErrorCode;
  };
}

// --- 路由决策 ---

export type RoutingLayer =
  | "L0_EXACT_CACHE"
  | "L0.5_SEMANTIC_CACHE"
  | "L1_RULE"
  | "L2_SEMANTIC"
  | "L3_ARCH_ROUTER"
  | "L3_FALLBACK"
  | "DIRECT";

// --- 图片生成类型 (ISSUE-V5-16) ---

export interface ImageGenerationRequest {
  prompt: string;
  model?: string;
  n?: number;
  size?: string;
  quality?: string;
  response_format?: "url" | "b64_json";
  style?: string;
  user?: string;
}

export interface ImageGenerationDataItem {
  url?: string;
  b64_json?: string;
  revised_prompt?: string;
}

export interface ImageGenerationResponse {
  created: number;
  data: ImageGenerationDataItem[];
}

export interface RouteDecisionResult {
  matched: boolean;
  layer: RoutingLayer;
  targetModel: string | null;
  confidence: number;
  ruleId?: string;
  /** L1 命中时来自规则的 fallback 链（优先于全局模型列表） */
  fallbackChain?: string[];
  /** L1 命中时来自规则的 thinking 策略 */
  thinkingStrategy?: "auto" | "enabled" | "disabled";
  routeName?: string;
  latencyMs: number;
}

// --- 规则引擎 ---

export type ConditionType =
  | "keywords"
  | "tokenCount"
  | "taskType"
  | "maxCost"
  | "maxLatency"
  | "providerHealth"
  | "hasModality";

export interface RuleConditionItem {
  type: ConditionType;
  keywords?: string[];
  minTokens?: number;
  maxTokens?: number;
  taskTypes?: string[];
  maxCostPerMillion?: number;
  maxLatencyMs?: number;
  providerName?: string;
  healthStatus?: "green" | "yellow" | "red";
  modalities?: string[];
}

export interface RuleConditions {
  combinator: "AND" | "OR";
  items: RuleConditionItem[];
}

export interface Rule {
  id: string;
  name: string;
  priority: number;
  enabled: boolean;
  conditions: RuleConditions;
  targetModel: string;
  fallbackChain: string[];
  thinkingStrategy: "auto" | "enabled" | "disabled";
  description: string | null;
  hitCount: number;
  lastHitAt: Date | null;
}

// --- Provider ---

export type ApiType = "openai" | "anthropic" | "openai-compatible";

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  apiType: ApiType;
  enabled: boolean;
}

export interface ModelConfig {
  id: string;
  providerId: string;
  modelId: string;
  alias: string | null;
  contextWindow: number;
  inputCost: number;
  outputCost: number;
  defaultParams: Record<string, unknown>;
  features: string[];
  enabled: boolean;
}

// --- 熔断器 ---

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerData {
  state: "open" | "half-open";
  triggered_by: "429" | "5xx" | "timeout";
  consecutive_failures: number;
  opened_at: number;
  until: number;
}

// --- 语义路由响应 ---

export interface SemanticRouteResponse {
  matched: boolean;
  layer: "L2_SEMANTIC" | "L3_ARCH_ROUTER" | "L3_FALLBACK";
  target_model: string | null;
  confidence: number;
  route_name?: string | null;
  latency_ms: number;
}

// --- 语义缓存响应 ---

export interface SemanticCacheCheckResponse {
  hit: boolean;
  cached_response: ChatCompletionResponse | null;
  similarity: number;
  latency_ms: number;
}

# API 契约

> 本文档定义所有子项目之间及对外的 HTTP API 接口。变更权限：仅架构师 Agent。

---

## 一、Proxy 对外 API（:8080）

客户端（OpenClaw 等）调用的公共端点。

### POST /v1/chat/completions

OpenAI Chat Completions API 完全兼容端点。**无应用层限流**（SSE 长连接兼容；建议在网关/反代层做 per-IP 或连接数限制）。

**请求头**：
```
Authorization: Bearer <api-token>
Content-Type: application/json
```

**请求体**：
```jsonc
{
  "model": "auto",           // 固定 "auto"，由路由器决策实际模型
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."},
    // 多模态 content 亦可为 ContentPart 数组（V5-16）：
    {"role": "user", "content": [
      {"type": "text", "text": "What is in this image?"},
      {"type": "image_url", "image_url": {"url": "data:image/png;base64,...", "detail": "auto"}},
      {"type": "input_audio", "input_audio": {"data": "base64...", "format": "wav"}}
    ]}
  ],
  "stream": true,            // 可选，默认 false
  "temperature": 0.7,        // 可选
  "max_tokens": 4096,        // 可选
  "top_p": 1,                // 可选
  "frequency_penalty": 0,    // 可选
  "presence_penalty": 0,     // 可选
  "stop": null,              // 可选
  "user": "user-id",         // 可选
  "thinking": {              // 可选 — 思考/推理模式（V5-18）
    "enabled": true,         // 是否启用 thinking 模式
    "budget_tokens": 8192    // 可选，思考 token 预算（Provider 支持时生效）
  }
}
```

**非流式响应**（`stream: false`）：
```jsonc
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "deepseek/deepseek-coder-v3",  // 实际路由到的模型（非 "auto"）
  "choices": [{
    "index": 0,
    "message": {"role": "assistant", "content": "..."},
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 100,
    "completion_tokens": 200,
    "total_tokens": 300
  }
}
```

**流式响应**（`stream: true`）：
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":1234567890,"model":"deepseek/deepseek-coder-v3","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}

data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":1234567890,"model":"deepseek/deepseek-coder-v3","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}

data: [DONE]
```

**错误响应**（统一格式，所有子项目必须遵守）：
```jsonc
{
  "error": {
    "message": "人类可读错误描述",      // 不暴露堆栈、内部 URL、API Key
    "type": "invalid_request_error",   // 类型枚举见下表
    "code": "model_not_found"          // 错误码枚举见下表
  }
}
```

**错误类型枚举**：

| type | 触发场景 |
|------|---------|
| `invalid_request_error` | 请求参数校验失败 |
| `authentication_error` | Token 无效或已撤销 |
| `rate_limit_error` | 触发速率限制 |
| `server_error` | 内部错误（不暴露详情） |
| `upstream_error` | Provider 返回错误 |

**错误码枚举**：

| code | HTTP 状态码 | 说明 |
|------|-----------|------|
| `invalid_api_key` | 401 | Token 无效 |
| `token_revoked` | 401 | Token 已撤销 |
| `model_not_found` | 404 | 请求的模型不存在 |
| `invalid_messages` | 400 | messages 格式错误 |
| `all_providers_failed` | 502 | 所有 Provider（含 fallback）均失败 |
| `upstream_timeout` | 504 | Provider 响应超时 |
| `upstream_disconnected` | 502 | Provider 中途断开 |
| `rate_limited` | 429 | 速率限制 |
| `internal_error` | 500 | 内部错误（server_error 时使用） |

### POST /v1/images/generations

OpenAI Images API 兼容端点（V5-16 图片生成）。系统级开关 `enable_image_generation` 可禁用。

**请求头**：同 `/v1/chat/completions`

**请求体**：
```jsonc
{
  "prompt": "A cute cat wearing a hat",   // 必填
  "model": "openai/dall-e-3",             // 可选，不填时自动选 features 含 "image-generation" 的模型
  "n": 1,                                  // 可选，默认 1
  "size": "1024x1024",                     // 可选
  "quality": "standard",                   // 可选 "standard" | "hd"
  "response_format": "url",               // 可选 "url" | "b64_json"
  "style": "vivid",                        // 可选 "vivid" | "natural"
  "user": "user-id"                        // 可选
}
```

**响应**：
```jsonc
{
  "created": 1234567890,
  "data": [
    {
      "url": "https://...",
      "revised_prompt": "A cute cat..."
    }
  ]
}
```

**错误码**：

| code | HTTP | 说明 |
|------|------|------|
| `image_generation_disabled` | 404 | 系统级开关已关闭 |
| `no_image_capable_model` | 400 | 未找到支持图片生成的模型 |
| `model_not_image_capable` | 400 | 指定模型不支持图片生成（features 缺少 "image-generation"） |
| `provider_not_support_image` | 501 | Provider adapter 不支持图片生成（如 Anthropic） |
| `upstream_error` | 502 | Provider 返回错误 |

**路由层**：
- `model` 有值 → `DIRECT`
- `model` 无值 → `L3_FALLBACK`（自动选模型）

**日志**：`request_logs.modalities = ["image-generation"]`，`routingLayer` 为 `DIRECT` 或 `L3_FALLBACK`

### GET /v1/models

返回已配置且启用的模型列表。**应用层限流**：30 req/min per API Token（Redis 滑动窗口，超限返回 `429 rate_limited`；SEC-003）。

**响应**：
```jsonc
{
  "object": "list",
  "data": [
    {
      "id": "auto",
      "object": "model",
      "created": 1234567890,
      "owned_by": "smart-router"
    },
    {
      "id": "openai/gpt-4o",
      "object": "model",
      "created": 1234567890,
      "owned_by": "openai",
      // V5 扩展字段（V2-11 / V5-16 / V5-18）
      "capabilities": {       // 仅包含 true 的能力
        "vision": true,
        "thinking": true
      },
      "context_window": 128000
    }
    // ...其余已启用模型
  ]
}
```

> **V5 元数据**：`capabilities` 对象仅包含值为 `true` 的能力键（`vision`、`audio`、`image_generation`、`thinking`），无能力时省略整个字段；`context_window` 为模型上下文窗口大小（整数 token 数）。`auto` 条目不含 `capabilities` 与 `context_window`。

### GET /health

**无鉴权**（监控探针使用）。**应用层限流**：6 req/min per IP（Redis 滑动窗口，超限返回 `429 rate_limited`；SEC-003）。建议在网关层将 `/health` 限制为内网访问。

**HTTP 状态**：**503** 仅当 **Redis 或 PostgreSQL** 不可用（代理无法读规则/缓存/熔断等核心状态）；**Router / Ollama** 不可达时仍为 **200**，通过 `services.router` / `services.ollama` 为 `"unavailable"` 表示软依赖降级（**AUDIT-011**）。

**响应**：
```jsonc
{
  "status": "ok",          // "ok" | "degraded"
  "version": "1.0.0",
  "uptime": 123456,
  "services": {
    "redis": "ok",
    "postgres": "ok",
    "router": "unavailable", // 软依赖：L2/L3 不可用时仍可服务
    "ollama": "unavailable" // 可以 unavailable，L3 降级
  }
}
```

---

## 二、Proxy ↔ Router 内部 API（:8001）

proxy 调用 router 的内部端点。**仅限 Docker 内网访问**，无需认证。

### POST /route/semantic

L2 语义路由决策。

**请求**：
```jsonc
{
  "messages": [{"role": "user", "content": "帮我写一个快速排序"}],
  "estimated_tokens": 150
}
```

**响应**（命中）：
```jsonc
{
  "matched": true,
  "layer": "L2_SEMANTIC",
  "target_model": "deepseek/deepseek-coder-v3",
  "confidence": 0.92,
  "route_name": "code_tasks",
  "latency_ms": 35
}
```

**响应**（未命中 / 超时）：
```jsonc
{
  "matched": false,
  "layer": "L2_SEMANTIC",
  "target_model": null,
  "confidence": 0.0,
  "route_name": null,
  "latency_ms": 55
}
```

### POST /route/arch-router

L3 Arch-Router AI 决策（调用宿主机 Ollama）。

**请求**：同 `/route/semantic`

**响应**（命中）：
```jsonc
{
  "matched": true,
  "layer": "L3_ARCH_ROUTER",
  "target_model": "openai/gpt-4o",
  "confidence": 0.78,
  "latency_ms": 120
}
```

**响应**（Ollama 不可用 / 超时）：
```jsonc
{
  "matched": false,
  "layer": "L3_FALLBACK",
  "target_model": null,
  "confidence": 0.0,
  "latency_ms": 140
}
```

### POST /cache/semantic/check

L0.5 语义缓存查询。

**`model` 标签（ISSUE-V4-02 / 集体决策 D1）**：**空字符串 `""`** 表示与 `model: auto` 对齐的语义缓存命名空间；Proxy 检查请求与 Router 写入/查询须使用同一约定。

**请求**：
```jsonc
{
  "messages": [{"role": "user", "content": "什么是快速排序？"}],
  "model": "deepseek/deepseek-coder-v3",
  "threshold": 0.95
}
```
（亦允许 `"model": ""` 表示 auto 命名空间。）

**响应**（命中）：
```jsonc
{
  "hit": true,
  "cached_response": { /* 完整的 OpenAI 响应对象 */ },
  "similarity": 0.97,
  "latency_ms": 12
}
```

**响应**（未命中）：
```jsonc
{
  "hit": false,
  "cached_response": null,
  "similarity": 0.0,
  "latency_ms": 15
}
```

### POST /cache/semantic/write

写入语义缓存（异步调用，proxy 不等待响应）。

**请求**：
```jsonc
{
  "messages": [{"role": "user", "content": "什么是快速排序？"}],
  "model": "deepseek/deepseek-coder-v3",
  "response": { /* 完整的 OpenAI 响应对象 */ },
  "ttl_seconds": 86400
}
```

**响应**：`201 Created`（无响应体）

### GET /health

**响应**：
```jsonc
{
  "status": "ok",
  "encoder_ready": true,
  "ollama_available": true,
  "ollama_url": "http://host.docker.internal:11434",
  "arch_router_model": "fauxpaslife/arch-router:1.5b",
  "arch_router_model_available": true
}
```
（`ollama_url` / `arch_router_model` / `arch_router_model_available` 供 Dashboard「本地路由模型」引导与状态展示。）

### GET /health/semantic

验证 FastEmbed encoder 是否可用；并探测 RediSearch 向量索引 **`semantic_idx`** 是否可访问（**ISSUE-V4-01**）。

**响应**：
```jsonc
{
  "status": "ok",
  "model": "BAAI/bge-small-zh-v1.5",
  "dimension": 384,
  "latency_ms": 5,
  "semantic_index_ready": true
}
```
（`semantic_index_ready: false` 表示索引不存在或 `FT.INFO` 失败，L0.5 可能不可用。）

---

## 三、Dashboard API Routes（:3000/api）

Next.js API Routes，供 Dashboard 前端调用。需登录态（Better Auth session）。

### Provider 管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/providers` | 列表（不含 apiKey）；Query `includeModels=1` 或 `true` 时在每条记录中附带 `models[]`（向导等） |
| POST | `/api/providers` | 新建（含连通性测试） |
| PUT | `/api/providers/:id` | 更新 |
| DELETE | `/api/providers/:id` | 删除（级联删除关联 models） |
| GET | `/api/providers/:id/reveal-key` | 返回明文 API Key |
| POST | `/api/providers/:id/test` | 测试连通性（轻量 `GET …/models`）；对 Coding Plan 等域名若模型列表返回 404/405 仍可能 `success: true` 并附 `message` 说明 |
| GET | `/api/providers/health` | 所有 Provider 健康状态（见下「[Provider 健康聚合](#get-apiprovidershealth)」） |

<a id="get-apiprovidershealth"></a>

**GET /api/providers/health 响应**（200）：
```jsonc
{
  "providers": [
    {
      "providerId": "clxxx",
      "name": "OpenAI",
      "enabled": true,
      "baseUrl": "https://api.openai.com/v1",
      "apiType": "openai",
      "updatedAt": "2026-03-22T12:00:00.000Z",
      "health": {
        "status": "green",
        "success_rate": 0.98,
        "p95_latency_ms": 450,
        "is_circuit_open": false,
        "circuit_until": null,
        "updated_at": 1234567890
      }
    }
  ]
}
```
（`health` 来自 Redis `provider:<id>:health`；无键时为 `null`。）

### 模型管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/providers/:id/models` | 指定 Provider 下的模型列表 |
| POST | `/api/providers/:id/models` | 在指定 Provider 下新建模型 |
| GET | `/api/providers/:id/upstream-models` | 从上游拉取可用模型（`GET …/v1/models`；OpenAI/兼容：`Authorization: Bearer`；Anthropic：`x-api-key` + `anthropic-version`）；响应 `{ models: Array<{ id: string; owned_by?: string; created?: number }> }`（V2-11 扩展元数据），可选 `hint`（如 `coding*.dashscope.aliyuncs.com` 等网关对 `GET /v1/models` 返回 404/405 时返回空列表并附说明，聊天仍可用）；超时 15s；**速率限制 5 次/分钟**（Redis 滑动窗口，超限返回 `429`）|
| PUT | `/api/models/:id` | 更新模型配置；支持 `features: string[]`（如 `["vision","audio"]`）更新模型能力标签（V5-16） |
| DELETE | `/api/models/:id` | 删除模型 |
| POST | `/api/providers/:id/models/import` | （规划中）批量导入模型 |

### 规则管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/rules` | 规则列表（按 priority 降序） |
| POST | `/api/rules` | 新建规则 → 写 DB + 发布 Redis `rules:updated` |
| PUT | `/api/rules/:id` | 更新规则 |
| DELETE | `/api/rules/:id` | 删除规则 |
| PUT | `/api/rules/reorder` | 批量更新优先级（拖拽排序） |
| GET | `/api/rules/export` | 导出为 JSON/YAML |
| POST | `/api/rules/import` | 导入 JSON/YAML 文件 |
| POST | `/api/rules/bulk` | 批量操作：`{ "action": "enable_all" \| "disable_all" \| "delete_all" }` → `{ "affected": number }`；**ISSUE-V5-02 / V5-04** |
| POST | `/api/rules/wizard` | AI 问卷向导生成规则；**模型引用与 LLM 输出治理**见下「[规则生成](#issue-v3-15-rule-generation)」 |
| POST | `/api/rules/generate-from-text` | 自然语言生成规则；同上 |

<a id="issue-v3-15-rule-generation"></a>

### 规则生成（NL / AI 问卷向导）（ISSUE-V3-15）

`POST /api/rules/wizard` 与 `POST /api/rules/generate-from-text` 共用下列契约；实现可拆共享模块，但**行为须一致**。

#### 模型标识格式（硬约束）

- 生成规则 JSON 中的 `targetModel`、`fallbackChain`（及任何承载「路由目标模型」的字段）必须使用 **`Provider名称/modelId`**：**单一路径分隔符为正斜杠 `/`**，与数据库及代理层可解析的复合键一致。
- **禁止**将 **`provider-model`**、**`provider_model`** 或混用连字符/下划线等非系统标准形式作为**可执行**模型引用落库或下发；若 LLM 返回此类字符串，**服务端须 normalize（若可唯一映射）后再验白名单，否则剔除或判无效**。

#### 白名单（硬约束）

- 上述模型引用**必须**属于当前租户上下文的 **「已启用 Provider + 已启用模型」允许列表**；**不得**仅依赖提示词让 LLM「自觉」只选列表内模型。
- **禁止**将**供应商不存在、拼写错误或非预期**的模型名（例如幻觉或错误拼接的 ID）作为**已校验**结果静默返回；**解析 JSON 成功 ≠ ID 合法**。

#### 服务端校验与重整理（硬约束）

- **在响应返回前端之前**（含仅预览、未点保存的场景），服务端必须对 LLM 结构化结果执行：
  1. **校验**：格式是否为 `Provider/modelId`、是否命中允许列表、是否与 DB 记录一致；
  2. **重整理**：对 `fallbackChain` 等列表**移除**非法项，或按产品策略**替换**为合法 ID；主目标非法时 **400/422** 或返回可编辑草稿并附 **`warnings` / `error`**（实现时定稿 HTTP 码与 body 形状）；
  3. 可选：对可自动纠正的笔误（如分隔符）先 **normalize** 再验白名单。
- **不得**将未通过上述步骤的模型 ID 作为**可立即用于路由**的规则内容返回或保存。

#### 提示词

- 提示词负责注入**完整允许列表**并书面强调 **`Provider/modelId`** 与仅选已配置模型；**不得替代**本节「服务端校验与重整理」。

#### 请求体扩展（ISSUE-V3-16）

- 可选字段 **`locale`**：`"zh"` \| `"en"`，与 Dashboard 界面语言一致；缺省按 **`zh`**。服务端据此选择 **system / user** 提示词语言。
- **`locale: en`** 时，系统提示与用户补充说明须要求 LLM 输出**英文**规则标题与描述（`name`、`nameEn`、`description`、`descriptionEn` 均以英文撰写，与 **ISSUE-V5-06** 一致）。

#### `conditions` 形状（ISSUE-V5-05）

- 服务端在返回前端前须对每条规则的 **`conditions`** 做规范化：保证存在 **`combinator`**（缺省 `AND`）与 **`items` 数组**（缺省 `[]`）；避免 LLM 省略 `items` 时前端访问 `.items.length` 崩溃。

#### 生成模式（ISSUE-V5-03）

- 可选字段 **`mode`**：`"json"` \| `"structured"`，缺省为 **`json`**。
  - **`json`**：与历史行为一致，要求 LLM 输出可解析的 JSON（`response_format: json_object`），再走 `extractJsonFromLlmResponse` 与 **白名单 sanitize**。
  - **`structured`**（**精确规则模式**）：不要求 JSON；LLM 输出**键值块**（块之间用单独一行 `---` 分隔），服务端 `parseStructuredRulesFromLlm` 映射为规则对象后，**同样**执行 **sanitize** 与白名单校验。
- 成功响应可带 **`generationMode`**：`"json"` \| `"structured"`，与本次实际路径一致，便于前端展示。

#### 响应扩展（建议）

- 成功路径可返回 **`warnings: string[]`**（或等价结构），列明被剔除/替换的引用等，便于 UI 提示；**不得**在无 `warnings` 时让用户误以为所有 LLM 输出均已原样可用。

#### 追踪

- 需求与验收口径：**`docs/ISSUE-LOG.md` → ISSUE-V3-15**。与规则保存侧通用校验（如 **ISSUE-V4-04**）重叠时，**生成链路以本节为验收口径**并与之一致。

### 统计 & 日志

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/stats/overview` | KPI 总览（今日请求数/花费/节省/缓存命中率/思维模式请求/多模态请求）；多模态统计含 `multimodalRequests` 与 `multimodalRate`（V5-16）；Token 使用分布 `tokenDistribution`（V5-17） |
| GET | `/api/stats/cost` | 成本统计（`days` 查询参数 1～90，默认 7）：实际/假设成本、节省、日趋势等 |
| GET | `/api/stats/logs` | 请求日志分页查询；支持 `?modality=vision` 按模态筛选（V5-16）；支持 `?apiTokenId=` 按 Token 筛选（V5-17）；返回含 `modalities: string[]`、`apiTokenId`、`apiTokenName` 字段 |
| GET | `/api/stats/logs/export` | 导出 CSV；含 `apiTokenName` 列（V5-17） |
| GET | `/api/stats/fallback` | Fallback 趋势 |
| GET | `/api/stats/circuit-breakers` | 当前熔断状态 |
| GET | `/api/stats/rules-hit` | 规则命中频率统计；支持 `?apiTokenId=` 按 Token 筛选（V5-17）：传入时 hitCount / avgLatencyMs / lastHitAt 均从 `request_logs` 聚合，而非 `rules` 表全局值 |
| GET | `/api/stats/latency-percentiles` | 按 `routingLayer` 聚合近 N 小时 `request_logs.latencyMs` 的 P50/P95/P99；查询参数 **`hours`**（默认 24，1～168）；**`format=json`**（默认）或 **`format=csv`** 导出（**ISSUE-PL-05**） |

### 设置

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/settings/cache` | 缓存配置 |
| PUT | `/api/settings/cache` | 更新缓存 TTL |
| POST | `/api/settings/cache/clear` | 清空缓存（精确+语义） |
| GET | `/api/settings/local-router-model` | 本地路由模型（L3）配置与状态（表单项来自 DB，状态来自 Router /health） |
| PUT | `/api/settings/local-router-model` | 保存 Ollama 地址与 Arch-Router 模型名（写 DB + Redis，Router 从 Redis 读取） |
| POST | `/api/settings/local-router-model/test` | 探测**当前表单**中的 Ollama URL 与模型名（**不落库**）；Dashboard 服务端请求 `GET {ollama}/api/tags`，与 Router 容器网络可能不同；响应含 `perspective: "dashboard"` |
| GET | `/api/settings/proxy-runtime` | Proxy 运行时配置镜像：`semanticCacheCheckTimeoutMs`、`fallbackOnInvalidL1Target`、`routingEnableL2`、`routingEnableL3`（**ISSUE-V4-03 / V4-04 / V5-09**） |
| PUT | `/api/settings/proxy-runtime` | 写 `system_config` + 发布 Redis `proxy_config:updated`；请求体字段可选：`semanticCacheCheckTimeoutMs`（10～200）、`fallbackOnInvalidL1Target`（boolean）、`routingEnableL2`（boolean）、`routingEnableL3`（boolean）。关闭 L2/L3 后 Proxy **跳过**对应 Router 调用，未命中时更快进入默认模型回退（`L3_FALLBACK`） |
| GET | `/api/settings/semantic-route` | L2 语义路由相似度阈值：`semanticRouteThreshold`（**ISSUE-V4-06**） |
| PUT | `/api/settings/semantic-route` | 写 `system_config` + 发布 Redis `router_config:updated`；请求体 `{ "semanticRouteThreshold": number }`（0.5～0.99） |
| POST | `/api/settings/suggest-task-type` | 请求体 `{ "sampleText": string }`，转发 Router `POST /route/semantic` 并将 `route_name` 映射为 L1 `taskType` 建议（**ISSUE-V4-05** 阶段 2，非热路径） |

**system_config 键（节选）**：`semantic_cache_check_timeout_ms` → `{ "ms": number }`；`fallback_on_invalid_l1_target` → `{ "enabled": boolean }`；`routing_enable_l2` / `routing_enable_l3` → `{ "enabled": boolean }`（默认均为启用；**ISSUE-V5-09**）；`semantic_route_threshold` → `{ "value": number }`。优先级：**对应 env 变量优先于 DB**（与集体决策 D2/D3 一致）；L2/L3 开关另支持 **`ROUTING_ENABLE_L2` / `ROUTING_ENABLE_L3`**（Proxy 容器 env）。

**PUT /api/settings/local-router-model 请求体**：
```jsonc
{
  "ollamaUrl": "http://host.docker.internal:11434",
  "archRouterModel": "fauxpaslife/arch-router:1.5b"
}
```
响应：`200` + `{ "ok": true }`。校验：`ollamaUrl` 为合法 URL，两字段均必填。

**POST /api/settings/local-router-model/test 请求体**：与 PUT 相同字段 `ollamaUrl`、`archRouterModel`。响应示例：`{ "ok": true, "perspective": "dashboard", "ollama_available": true, "arch_router_model_available": true, "message": "..." }`；失败时 `ok: false` + `error`（HTTP 仍为 200，便于前端统一解析）。

### API Token 管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/tokens` | 有效 Token 列表（`revokedAt == null`）；每项含 `canReveal`（是否存有加密的可解密副本） |
| POST | `/api/tokens` | 创建 Token；响应含 `fullToken`（明文）；若用户已开启「允许再次复制」则额外 `storedForReveal: true` 并写入 `tokenCipher` |
| DELETE | `/api/tokens/:id` | 撤销 Token（软删除） |
| POST | `/api/tokens/:id/reveal` | 会话用户且未撤销且存在 `tokenCipher` 时返回 `{ "fullToken": "..." }` |

### 系统设置（API Token 偏好）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/settings/token-reveal` | `{ "allowApiTokenReveal": boolean }` |
| PUT | `/api/settings/token-reveal` | 请求体 `{ "allow": boolean }`，响应同 GET |

### 系统设置（规则生成模型 + 采样温度，ISSUE-V3-12 / V3-17）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/settings/rule-generation-model` | `{ "useDefault": boolean, "targetModel": string \| null, "temperature": number }`；`useDefault=true` 时表示使用 `findCheapestModel()` 等价逻辑；**`temperature`** 范围 **0～2**，未单独配置时默认 **0.2** |
| PUT | `/api/settings/rule-generation-model` | 请求体至少包含下列之一：① **`temperature`**（0～2，写入 `rule_generation_temperature`）；② **`useDefault`**（与 **`targetModel`** 组合，语义同前）。可同时提交 **`useDefault` + `targetModel` + `temperature`** 一次保存；仅更新温度时可只传 **`{ "temperature": 0.2 }`** |

持久化：

- `system_config.key = rule_generation_target_model`，`value = { "targetModel": "<Provider名称/modelId>" }`（可选，与 `useDefault` 互斥语义不变）。
- `system_config.key = rule_generation_temperature`，`value = { "temperature": number }`（ISSUE-V3-17）。

NL/问卷调用 LLM 时 **`temperature`** 来自 GET 解析结果（与设置页「采样温度」一致）。

### 熔断器手动操作

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/circuit-breakers/:model/reset` | 手动重置熔断器；`:model` 为 **`Provider名称/modelId`**（路径段需 URL 编码，如 `OpenAI%2Fgpt-4`），删除 Redis `circuit:<model>` 与 `circuit:fail_count:<model>` |

**POST /api/circuit-breakers/:model/reset 响应**（200）：
```jsonc
{ "ok": true, "model": "OpenAI/gpt-4", "deletedKeys": 2 }
```
（`deletedKeys` 为 `DEL` 成功删除的键数量。）

---

## 四、多模态与生成类能力（V5-16）

### Content 类型

`POST /v1/chat/completions` 的 `messages[].content` 支持两种形态：
- **字符串**：传统纯文本（向后兼容）
- **ContentPart 数组**：OpenAI 多模态 content-parts 格式

```jsonc
// ContentPart 类型（discriminated union on "type"）
{ "type": "text", "text": "..." }
{ "type": "image_url", "image_url": { "url": "...", "detail": "auto" } }
{ "type": "input_audio", "input_audio": { "data": "base64...", "format": "wav" } }
```

### 模型能力标签（`features`）

Model 表 `features String[]` 字段存储模型能力标签：
- `"vision"` — 支持图片/视觉输入
- `"audio"` — 支持音频输入

Dashboard 模型管理 UI 提供 "Supports Vision" / "Supports Audio" 复选框，映射到 `features` 数组。

### 规则条件 `hasModality`

路由规则条件新增 `hasModality` 类型，匹配请求中检测到的模态：

```jsonc
{ "type": "hasModality", "modalities": ["vision"] }
```

`modalities` 合法值：`"vision"`、`"audio"`。请求入口同步检测 `detectedModalities`，规则引擎检查交集。

### 能力软门控

Fallback 链中优先选择具有匹配 `features` 的模型（如 vision 请求优先路由到 `features` 含 `"vision"` 的模型），无能力模型排后但不硬拒。

### 请求日志 `modalities`

`request_logs` 表新增 `modalities TEXT[]`（默认 `["text"]`），记录每次请求包含的模态类型。

### Provider 多模态适配

- **OpenAI / Generic**：content-parts 数组原样透传
- **Anthropic**：`image_url` → Anthropic `source: { type: "base64"|"url" }` 格式转换；`input_audio` 降级为文本 `"[audio content]"`（Anthropic 暂不支持音频直传）

---

## 五、API Token 维度 — 统计与请求日志（V5-17）

### 请求日志 Token 字段

`request_logs` 表新增两个可空字段（反规范化存储，无外键）：

- `apiTokenId TEXT` — 发起请求的 API Token ID
- `apiTokenName TEXT` — 发起请求的 API Token 名称（便于展示与筛选）
- 索引：`request_logs_apiTokenId_idx` ON `("apiTokenId")`

Proxy 鉴权成功后从 `api_tokens` 表获取 `id` 和 `name`，通过 `res.locals.apiToken` 传递给路由处理器，写入 `emitLog` → `request_logs`。

### Redis 认证缓存格式（向后兼容）

- **新格式**：`JSON.stringify({ id, name })`（60s TTL）
- **旧格式**：`"1"`（向后兼容解析，token info 为 null）

### 统计 API

- `GET /api/stats/overview` 响应新增 `tokenDistribution: { name: string; count: number }[]` — 今日 Top 10 Token 使用分布
- `GET /api/stats/logs` 支持 `?apiTokenId=<id>` 按 Token 筛选；返回含 `apiTokenId`、`apiTokenName`
- `GET /api/stats/logs/export` CSV 新增 `apiTokenName` 列

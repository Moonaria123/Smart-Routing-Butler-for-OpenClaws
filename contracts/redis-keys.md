# Redis Key 契约

> 本文档定义所有子项目共享的 Redis Key 前缀、数据格式和 TTL。变更权限：仅架构师 Agent。
> Redis 镜像：`redis/redis-stack:latest`（含 RediSearch 向量检索模块）。

---

## Key 总览

| Key 模式 | 数据类型 | 写入方 | 读取方 | TTL | 用途 |
|---------|---------|--------|--------|-----|------|
| `exact:<sha256>` | String (JSON) | proxy | proxy | 用户配置（默认 86400s） | 精确响应缓存 |
| `semantic:<uuid>` | Hash + Vector | router | router | 用户配置（默认 86400s） | 语义响应缓存 |
| `circuit:<provider>/<model>` | String (JSON) | proxy | proxy, dashboard | 60s | 熔断状态 |
| `circuit:fail_count:<provider>/<model>` | String (int) | proxy | proxy | 无（成功/熔断时 DEL） | 5xx/timeout 连续失败计数（INCR） |
| `apitoken:cache:<sha256>` | String (`1`) | proxy | proxy | 60s | API Token 校验正例缓存 |
| `provider:<id>:health` | String (JSON) | dashboard | dashboard | 300s | Provider 健康状态 |
| `session:<id>:state` | String (JSON) | proxy | proxy | 600s (10min) | 会话状态 |
| `session:<id>:recommended_model` | String | proxy | proxy | 600s (10min) | Hook 推荐模型 |
| `stats:cache_exact_hits` | String (int) | proxy | dashboard | 永久 | 精确缓存命中计数 |
| `stats:cache_semantic_hits` | String (int) | router | dashboard | 永久 | 语义缓存命中计数 |
| `stats:fallback:<YYYYMMDDHH>` | String (int) | proxy | dashboard | 7天 (604800s) | 每小时 fallback 计数 |
| `rules:updated` | Pub/Sub channel | dashboard | proxy | N/A | 规则更新事件 |
| `proxy_config:updated` | Pub/Sub channel | dashboard | proxy | N/A | Proxy 运行时配置变更（L0.5 超时、L1 fallback 开关，**ISSUE-V4-03**） |
| `router_config:updated` | Pub/Sub channel | dashboard | router | N/A | Router L2 阈值等热更新（**ISSUE-V4-06**） |
| `api_tokens:invalidate` | Pub/Sub channel | dashboard | proxy | N/A | API Token 撤销，Payload 含 `tokenHash` |
| `rl:models:<tokenId>` | String (int) | proxy | proxy | 用户配置（默认 60s） | SEC-003 应用层限流：`GET /v1/models` 每 API Token 滑动窗口计数（INCR） |
| `rl:health:<ip>` | String (int) | proxy | proxy | 用户配置（默认 60s） | SEC-003 应用层限流：`GET /health` 每 IP 滑动窗口计数（INCR） |
| `config:ollama_url` | String | dashboard | router | 无 | Ollama 基地址（Dashboard 内配置，覆盖 env） |
| `config:arch_router_model` | String | dashboard | router | 无 | L3 Arch-Router 模型名（如 fauxpaslife/arch-router:1.5b） |

---

## Key 详细定义

### exact:\<sha256\>

精确匹配缓存。Key 为 `SHA-256(model + JSON.stringify(messages))`。

```jsonc
// 值：完整的 OpenAI Chat Completion 响应对象（JSON 字符串）
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "model": "deepseek/deepseek-coder-v3",
  "choices": [/* ... */],
  "usage": {/* ... */},
  "_cached_at": 1234567890  // 写入时间戳（毫秒）
}
```

### circuit:\<provider\>/\<model\>

熔断器状态。

```jsonc
{
  "state": "open",               // "open"（熔断中）| "half-open"（探测中）
  "triggered_by": "429",         // "429" | "5xx" | "timeout"
  "consecutive_failures": 3,     // 连续失败次数
  "opened_at": 1234567890,       // 熔断触发时间（毫秒）
  "until": 1234567950            // 冷却结束时间（毫秒）
}
```

**写入逻辑**（proxy 负责）：
- `429` → 立即写入，TTL 60s
- `5xx` / `timeout` → 递增 `consecutive_failures`，达到 3 次时写入，TTL 60s
- TTL 到期 → 自动变为 `half-open`（发 1 个探测请求）
- 探测成功 → 删除 key；探测失败 → 重新写入，TTL 60s

### provider:\<id\>:health

Provider 健康状态（Dashboard 后台定时任务写入）。

```jsonc
{
  "status": "green",       // "green" | "yellow" | "red"
  "success_rate": 0.98,    // 最近 5 分钟成功率
  "p95_latency_ms": 450,   // 最近 5 分钟 P95 延迟
  "is_circuit_open": false, // 是否处于熔断状态
  "circuit_until": null,    // 熔断结束时间（如有）
  "updated_at": 1234567890
}
```

### session:\<id\>:state

会话状态（SessionState）。

```jsonc
{
  "rolling_summary": "用户在讨论快速排序的实现...", // 200-500 tokens 滚动摘要
  "recent_turns": [                                // 最近 K 轮对话
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."}
  ],
  "turn_count": 15,
  "current_model": "deepseek/deepseek-coder-v3",
  "updated_at": 1234567890
}
```

### rules:updated（Pub/Sub）

规则更新事件频道。

```
PUBLISH rules:updated '{"event":"updated","ruleId":"clxxx","timestamp":1234567890}'
PUBLISH rules:updated '{"event":"deleted","ruleId":"clxxx","timestamp":1234567890}'
PUBLISH rules:updated '{"event":"reordered","timestamp":1234567890}'
```

**订阅方**：proxy 层所有 Node.js 进程
**收到后动作**：从 PostgreSQL 重新加载全部规则到内存

### config:ollama_url / config:arch_router_model

Dashboard 内配置的 L3 本地路由参数，Router 优先从 Redis 读取（未设置时使用环境变量）。

- `config:ollama_url`：Ollama 基地址，如 `http://host.docker.internal:11434`
- `config:arch_router_model`：模型名，如 `fauxpaslife/arch-router:1.5b`
- 值：普通字符串，无 TTL
- 写入方：Dashboard（PUT /api/settings/local-router-model）
- 读取方：Router（health、L3 路由）

---

## 语义缓存向量索引

由 Router Agent 在服务启动时创建（幂等操作）。

```
索引名称：semantic_idx
Key 前缀：semantic:
向量字段：embedding（FLOAT32, 384维, COSINE距离）
文本字段：model（TAG）, messages_hash（TAG）
JSON字段：response（原始 JSON 字符串）
```

创建命令（Python / redis-py）：
```python
FT.CREATE semantic_idx ON HASH PREFIX 1 semantic:
  SCHEMA
    embedding VECTOR FLAT 6 TYPE FLOAT32 DIM 384 DISTANCE_METRIC COSINE
    model TAG
    messages_hash TAG
    response TEXT NOINDEX
```

---

## 操作约束

| 规则 | 说明 |
|------|------|
| 禁止 `KEYS *` | 使用 `SCAN` 替代 |
| 批量删除 | 使用 Pipeline，禁止循环单条删除 |
| 计数器递增 | 使用 `INCR` / `INCRBY`，原子操作 |
| Pub/Sub | 消息为 JSON 字符串，必须包含 `event` 和 `timestamp` 字段 |

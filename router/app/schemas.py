# Pydantic v2 数据模型——所有 API 请求/响应的 Schema 定义
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field  # noqa: I001

# ── 通用 ──


class MessageItem(BaseModel):
    """单条对话消息。"""

    role: Literal["system", "user", "assistant"]
    content: str


# ── 语义路由 ──


class SemanticRouteRequest(BaseModel):
    """L2 语义路由请求。"""

    messages: list[MessageItem]
    estimated_tokens: int


class SemanticRouteResponse(BaseModel):
    """L2/L3 路由决策响应。"""

    matched: bool
    layer: Literal["L2_SEMANTIC", "L3_ARCH_ROUTER", "L3_FALLBACK"]
    target_model: str | None
    confidence: float
    route_name: str | None = None
    latency_ms: int


# ── 语义缓存 ──


class SemanticCacheCheckRequest(BaseModel):
    """语义缓存查询请求。"""

    messages: list[MessageItem]
    model: str
    threshold: float = Field(default=0.95, ge=0.0, le=1.0)


class SemanticCacheCheckResponse(BaseModel):
    """语义缓存查询响应。"""

    hit: bool
    cached_response: dict[str, Any] | None
    similarity: float
    latency_ms: int


class SemanticCacheWriteRequest(BaseModel):
    """语义缓存写入请求。"""

    messages: list[MessageItem]
    model: str
    response: dict[str, Any]
    ttl_seconds: int = Field(default=86400, ge=1)


# ── 健康检查 ──


class HealthResponse(BaseModel):
    """基础健康检查响应。"""

    status: str
    encoder_ready: bool
    ollama_available: bool
    ollama_url: str = ""
    arch_router_model: str = ""
    arch_router_model_available: bool = False


class SemanticHealthResponse(BaseModel):
    """语义编码器健康检查响应。"""

    status: str
    model: str
    dimension: int
    latency_ms: int
    semantic_index_ready: bool = False

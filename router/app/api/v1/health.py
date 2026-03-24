# 健康检查端点——验证编码器、Ollama、Redis 可用性
from __future__ import annotations

import asyncio
import logging
import time

import httpx
from fastapi import APIRouter, Request

from app.cache.semantic_cache import INDEX_NAME
from app.core.config import settings
from app.core.encoder import encode_text, is_encoder_ready
from app.core.ollama_config import get_ollama_config
from app.schemas import HealthResponse, SemanticHealthResponse

logger = logging.getLogger(__name__)
router = APIRouter()


def _model_in_tags(tags_body: dict[str, object], model_name: str) -> bool:
    """检查 Ollama /api/tags 返回的列表中是否包含指定模型。"""
    raw_models = tags_body.get("models")
    models = raw_models if isinstance(raw_models, list) else []
    prefix = model_name.split(":", maxsplit=1)[0] + ":"
    for m in models:
        name = m.get("name") if isinstance(m, dict) else None
        if name and (name == model_name or name.startswith(prefix)):
            return True
    return False


async def _check_ollama(
    client: httpx.AsyncClient,
    ollama_url: str,
    arch_router_model: str,
) -> tuple[bool, bool]:
    """测试 Ollama 可达性与 Arch-Router 模型是否已拉取。返回 (ollama_ok, model_ok)。"""
    try:
        resp = await client.get(
            f"{ollama_url.rstrip('/')}/api/tags",
            timeout=httpx.Timeout(connect=1.0, read=2.0, write=1.0, pool=1.0),
        )
        if resp.status_code != 200:
            return False, False
        data = resp.json()
        model_available = _model_in_tags(data, arch_router_model)
        return True, model_available
    except Exception:
        return False, False


@router.get("/health", response_model=HealthResponse)
async def health_check(http_request: Request) -> HealthResponse:
    """基础健康检查：编码器、Ollama、L3 模型拉取状态（Redis/env）。"""
    encoder_ready = is_encoder_ready()
    client: httpx.AsyncClient = http_request.app.state.http_client
    redis = http_request.app.state.redis
    ollama_url, arch_router_model = await get_ollama_config(redis)
    ollama_available, arch_router_model_available = await _check_ollama(
        client, ollama_url, arch_router_model
    )

    if encoder_ready:
        status = "ok"
    else:
        status = "degraded"

    return HealthResponse(
        status=status,
        encoder_ready=encoder_ready,
        ollama_available=ollama_available,
        ollama_url=ollama_url,
        arch_router_model=arch_router_model,
        arch_router_model_available=arch_router_model_available,
    )


@router.get("/health/semantic", response_model=SemanticHealthResponse)
async def semantic_health_check(http_request: Request) -> SemanticHealthResponse:
    """语义编码器健康检查：执行测试编码并返回模型信息；含 RediSearch 索引探测（ISSUE-V4-01）。"""
    start = time.perf_counter()
    redis = http_request.app.state.redis
    index_ready = False
    try:
        await redis.ft(INDEX_NAME).info()
        index_ready = True
    except Exception:
        logger.warning("RediSearch 索引 %s 探测失败或未创建", INDEX_NAME)

    try:
        # CPU 密集操作放到线程池，避免阻塞事件循环
        loop = asyncio.get_running_loop()
        test_embedding = await loop.run_in_executor(
            None, encode_text, "health check test"
        )
        dimension = len(test_embedding)
        elapsed = int((time.perf_counter() - start) * 1000)
        return SemanticHealthResponse(
            status="ok",
            model=settings.fastembed_model,
            dimension=dimension,
            latency_ms=elapsed,
            semantic_index_ready=index_ready,
        )
    except Exception:
        elapsed = int((time.perf_counter() - start) * 1000)
        logger.exception("语义健康检查失败")
        return SemanticHealthResponse(
            status="error",
            model=settings.fastembed_model,
            dimension=0,
            latency_ms=elapsed,
            semantic_index_ready=index_ready,
        )

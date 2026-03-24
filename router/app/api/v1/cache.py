# 语义缓存 API 端点——查询和写入 Redis 向量缓存
from __future__ import annotations

import time

from fastapi import APIRouter, Request, Response

from app.cache.semantic_cache import check_cache, write_cache
from app.schemas import (
    SemanticCacheCheckRequest,
    SemanticCacheCheckResponse,
    SemanticCacheWriteRequest,
)

router = APIRouter()


@router.post("/cache/semantic/check", response_model=SemanticCacheCheckResponse)
async def cache_check(
    body: SemanticCacheCheckRequest,
    request: Request,
) -> SemanticCacheCheckResponse:
    """L0.5 语义缓存查询：根据消息向量相似度检索缓存响应。"""
    start = time.perf_counter()
    redis_client = request.app.state.redis

    messages_dicts = [{"role": m.role, "content": m.content} for m in body.messages]

    hit, cached_response, similarity = await check_cache(
        redis_client=redis_client,
        messages=messages_dicts,
        model=body.model,
        threshold=body.threshold,
    )

    elapsed = int((time.perf_counter() - start) * 1000)
    return SemanticCacheCheckResponse(
        hit=hit,
        cached_response=cached_response,
        similarity=round(similarity, 4),
        latency_ms=elapsed,
    )


@router.post("/cache/semantic/write", status_code=201)
async def cache_write(
    body: SemanticCacheWriteRequest,
    request: Request,
    response: Response,
) -> None:
    """写入语义缓存：将响应及其向量存入 Redis。"""
    redis_client = request.app.state.redis

    messages_dicts = [{"role": m.role, "content": m.content} for m in body.messages]

    await write_cache(
        redis_client=redis_client,
        messages=messages_dicts,
        model=body.model,
        response=body.response,
        ttl_seconds=body.ttl_seconds,
    )

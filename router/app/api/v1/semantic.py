# L2 语义路由端点——基于 semantic-router 分类用户意图
from __future__ import annotations

import asyncio
import logging
import time

import numpy as np
from fastapi import APIRouter

from app.core.config import settings
from app.core.encoder import encode_text
from app.core.routes import ALL_ROUTES, get_target_model
from app.core.semantic_settings import get_semantic_similarity_threshold
from app.schemas import SemanticRouteRequest, SemanticRouteResponse

logger = logging.getLogger(__name__)
router = APIRouter()

_route_embeddings: dict[str, list[list[float]]] | None = None


def init_route_embeddings() -> dict[str, list[list[float]]]:
    """预计算所有路由 utterance 的 embedding 向量。"""
    global _route_embeddings  # noqa: PLW0603
    if _route_embeddings is not None:
        return _route_embeddings

    logger.info("正在预计算路由 utterance 向量...")
    result: dict[str, list[list[float]]] = {}
    for route in ALL_ROUTES:
        embeddings: list[list[float]] = []
        if route.utterances:
            for utterance in route.utterances:
                emb = encode_text(utterance)
                embeddings.append(emb)
        result[route.name] = embeddings
    _route_embeddings = result
    logger.info("路由 utterance 向量预计算完成，共 %d 个路由", len(result))
    return result


def _cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    """计算两个向量的余弦相似度。"""
    a = np.array(vec_a, dtype=np.float32)
    b = np.array(vec_b, dtype=np.float32)
    dot = float(np.dot(a, b))
    norm_a = float(np.linalg.norm(a))
    norm_b = float(np.linalg.norm(b))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (norm_a * norm_b)


def _classify_sync(text: str) -> tuple[str | None, float]:
    """同步执行语义分类，返回 (路由名, 置信度)。"""
    route_embeddings = init_route_embeddings()
    query_embedding = encode_text(text)

    best_route: str | None = None
    best_score: float = 0.0

    for route_name, embeddings in route_embeddings.items():
        for emb in embeddings:
            score = _cosine_similarity(query_embedding, emb)
            if score > best_score:
                best_score = score
                best_route = route_name

    threshold = get_semantic_similarity_threshold()
    if best_score < threshold:
        return None, best_score

    return best_route, best_score


@router.post("/route/semantic", response_model=SemanticRouteResponse)
async def semantic_route(request: SemanticRouteRequest) -> SemanticRouteResponse:
    """L2 语义路由：根据用户消息内容分类到预定义路由。"""
    start = time.perf_counter()
    timeout_s = settings.semantic_route_timeout_ms / 1000.0

    user_content = ""
    for msg in reversed(request.messages):
        if msg.role == "user":
            user_content = msg.content
            break

    if not user_content:
        elapsed = int((time.perf_counter() - start) * 1000)
        return SemanticRouteResponse(
            matched=False,
            layer="L2_SEMANTIC",
            target_model=None,
            confidence=0.0,
            route_name=None,
            latency_ms=elapsed,
        )

    try:
        loop = asyncio.get_running_loop()
        route_name, confidence = await asyncio.wait_for(
            loop.run_in_executor(None, _classify_sync, user_content),
            timeout=timeout_s,
        )
    except TimeoutError:
        elapsed = int((time.perf_counter() - start) * 1000)
        logger.warning("语义路由超时 (%dms)", elapsed)
        return SemanticRouteResponse(
            matched=False,
            layer="L2_SEMANTIC",
            target_model=None,
            confidence=0.0,
            route_name=None,
            latency_ms=elapsed,
        )
    except Exception:
        elapsed = int((time.perf_counter() - start) * 1000)
        logger.exception("语义路由异常")
        return SemanticRouteResponse(
            matched=False,
            layer="L2_SEMANTIC",
            target_model=None,
            confidence=0.0,
            route_name=None,
            latency_ms=elapsed,
        )

    elapsed = int((time.perf_counter() - start) * 1000)
    matched = route_name is not None
    target_model = get_target_model(route_name) if matched else None

    return SemanticRouteResponse(
        matched=matched,
        layer="L2_SEMANTIC",
        target_model=target_model,
        confidence=round(confidence, 4),
        route_name=route_name,
        latency_ms=elapsed,
    )

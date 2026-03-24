# L3 Arch-Router 端点——调用宿主机 Ollama 进行 AI 路由决策（Ollama 地址与模型名从 Redis 或 env 读取）
from __future__ import annotations

import json
import logging
import time

import httpx
from fastapi import APIRouter, Request

from app.core.config import settings
from app.core.ollama_config import get_ollama_config
from app.core.routes import ROUTE_MODEL_MAP
from app.schemas import SemanticRouteRequest, SemanticRouteResponse

logger = logging.getLogger(__name__)
router = APIRouter()

SYSTEM_PROMPT = (
    "You are a router that classifies user queries into categories. "
    "Available categories: code_tasks, data_analysis, content_creation, "
    "daily_chat, translation, math_reasoning, long_document, other. "
    "Respond with JSON: {\"category\": \"<category_name>\", \"confidence\": <0.0-1.0>}"
)


def _parse_arch_response(
    response_text: str,
    route_map: dict[str, str],
) -> tuple[str | None, float]:
    """解析 Arch-Router 返回的 JSON，提取类别和置信度。"""
    try:
        text = response_text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            text = "\n".join(lines)
        start_idx = text.find("{")
        end_idx = text.rfind("}") + 1
        if start_idx == -1 or end_idx == 0:
            return None, 0.0
        json_str = text[start_idx:end_idx]
        data: dict[str, object] = json.loads(json_str)
        category = str(data.get("category", ""))
        confidence = float(data.get("confidence", 0.0))  # type: ignore[arg-type]
        if category in route_map:
            return category, min(max(confidence, 0.0), 1.0)
        return None, 0.0
    except (json.JSONDecodeError, ValueError, TypeError):
        return None, 0.0


@router.post("/route/arch-router", response_model=SemanticRouteResponse)
async def arch_router_route(
    http_request: Request,
    body: SemanticRouteRequest,
) -> SemanticRouteResponse:
    """L3 Arch-Router：调用 Ollama 本地模型进行路由决策。"""
    start = time.perf_counter()

    user_content = ""
    for msg in reversed(body.messages):
        if msg.role == "user":
            user_content = msg.content
            break

    if not user_content:
        elapsed = int((time.perf_counter() - start) * 1000)
        return SemanticRouteResponse(
            matched=False,
            layer="L3_FALLBACK",
            target_model=None,
            confidence=0.0,
            latency_ms=elapsed,
        )

    redis = http_request.app.state.redis
    ollama_url_base, arch_router_model = await get_ollama_config(redis)
    ollama_url = f"{ollama_url_base.rstrip('/')}/api/chat"
    payload = {
        "model": arch_router_model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
        "stream": False,
        "options": {"temperature": 0.1},
    }

    # 拆分超时：read 与 Proxy L3 上限（默认 140ms）对齐，见 ISSUE-V4-07
    read_s = max(0.01, min(2.0, settings.arch_router_timeout_ms / 1000.0))
    arch_timeout = httpx.Timeout(connect=0.05, read=read_s, write=0.05, pool=0.05)
    client: httpx.AsyncClient = http_request.app.state.http_client

    try:
        resp = await client.post(ollama_url, json=payload, timeout=arch_timeout)
        resp.raise_for_status()
        result: dict[str, object] = resp.json()
    except httpx.TimeoutException:
        elapsed = int((time.perf_counter() - start) * 1000)
        logger.warning("Arch-Router 调用超时 (%dms)", elapsed)
        return SemanticRouteResponse(
            matched=False,
            layer="L3_FALLBACK",
            target_model=None,
            confidence=0.0,
            latency_ms=elapsed,
        )
    except Exception:
        elapsed = int((time.perf_counter() - start) * 1000)
        logger.warning("Arch-Router 调用失败", exc_info=True)
        return SemanticRouteResponse(
            matched=False,
            layer="L3_FALLBACK",
            target_model=None,
            confidence=0.0,
            latency_ms=elapsed,
        )

    message_obj = result.get("message", {})
    if isinstance(message_obj, dict):
        response_text = str(message_obj.get("content", ""))
    else:
        response_text = ""

    route_map: dict[str, str] = getattr(
        http_request.app.state,
        "route_model_map",
        ROUTE_MODEL_MAP,
    )
    category, confidence = _parse_arch_response(response_text, route_map)
    elapsed = int((time.perf_counter() - start) * 1000)

    if category is None:
        logger.info(
            "l3_arch_router_done matched=0 confidence=%s latency_ms=%s",
            confidence,
            elapsed,
        )
        return SemanticRouteResponse(
            matched=False,
            layer="L3_FALLBACK",
            target_model=None,
            confidence=confidence,
            latency_ms=elapsed,
        )

    target_model = route_map.get(category)
    logger.info(
        "l3_arch_router_done matched=1 category=%s confidence=%s latency_ms=%s",
        category,
        confidence,
        elapsed,
    )
    return SemanticRouteResponse(
        matched=True,
        layer="L3_ARCH_ROUTER",
        target_model=target_model,
        confidence=round(confidence, 4),
        # route_name 超出 API 契约定义，作为调试扩展字段保留
        route_name=category,
        latency_ms=elapsed,
    )

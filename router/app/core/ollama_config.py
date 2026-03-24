# 从 Redis 读取 Ollama / Arch-Router 配置，未设置时回退到环境变量
from __future__ import annotations

from typing import TYPE_CHECKING

from app.core.config import settings

if TYPE_CHECKING:
    from redis.asyncio import Redis

CONFIG_OLLAMA_URL = "config:ollama_url"
CONFIG_ARCH_ROUTER_MODEL = "config:arch_router_model"


async def get_ollama_config(redis: Redis) -> tuple[str, str]:
    """返回 (ollama_url, arch_router_model)，优先从 Redis 读取，否则用 env。"""
    ollama_url = settings.ollama_url
    arch_router_model = settings.arch_router_model
    try:
        url_b = await redis.get(CONFIG_OLLAMA_URL)
        if url_b is not None:
            ollama_url = url_b.decode("utf-8") if isinstance(url_b, bytes) else str(url_b)
        model_b = await redis.get(CONFIG_ARCH_ROUTER_MODEL)
        if model_b is not None:
            if isinstance(model_b, bytes):
                arch_router_model = model_b.decode("utf-8")
            else:
                arch_router_model = str(model_b)
    except Exception:
        pass
    out_url = ollama_url.strip() or settings.ollama_url
    out_model = arch_router_model.strip() or settings.arch_router_model
    return out_url, out_model

# FastAPI 应用入口——lifespan 管理编码器、Redis、向量索引、httpx 客户端初始化
from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from urllib.parse import urlparse

import asyncpg
import httpx
import redis.asyncio as aioredis
from fastapi import FastAPI

from app.api.v1 import arch_router, cache, health, semantic
from app.api.v1.semantic import init_route_embeddings
from app.cache.semantic_cache import create_vector_index
from app.core.config import settings
from app.core.encoder import init_encoder
from app.core.route_model_map import load_route_model_map_from_db
from app.core.semantic_settings import (
    load_semantic_threshold_from_db,
    set_semantic_similarity_threshold,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


async def _listen_router_config(
    redis_client: aioredis.Redis,
    pool: asyncpg.Pool | None,
) -> None:
    """订阅 router_config:updated，热更新 L2 阈值（ISSUE-V4-06）。"""
    pubsub = redis_client.pubsub()
    await pubsub.subscribe("router_config:updated")
    try:
        async for raw in pubsub.listen():
            if raw is None or raw.get("type") != "message":
                continue
            t = await load_semantic_threshold_from_db(pool)
            set_semantic_similarity_threshold(t)
            logger.info("已重载 L2 语义相似度阈值: %s", t)
    except asyncio.CancelledError:
        await pubsub.unsubscribe("router_config:updated")
        await pubsub.close()
        raise


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """应用生命周期：启动时初始化资源，关闭时清理连接。"""
    logger.info("路由引擎启动中...")

    init_encoder()
    logger.info("FastEmbed 编码器就绪")

    init_route_embeddings()
    logger.info("路由 utterance 向量预计算完成")

    redis_client = aioredis.from_url(
        settings.redis_url,
        decode_responses=False,
    )  # type: ignore[no-untyped-call]
    app.state.redis = redis_client

    # 日志中屏蔽 Redis 凭据，仅打印 scheme://host:port
    parsed = urlparse(settings.redis_url)
    safe_url = f"{parsed.scheme}://{parsed.hostname}:{parsed.port}"
    logger.info("Redis 连接就绪: %s", safe_url)

    try:
        await create_vector_index(redis_client)
    except Exception:
        logger.warning("Redis 向量索引创建失败（Redis 可能未就绪）", exc_info=True)

    # 共享 httpx 客户端，复用连接池；各端点按需覆盖超时
    http_client = httpx.AsyncClient(
        timeout=httpx.Timeout(connect=2.0, read=5.0, write=2.0, pool=2.0),
    )
    app.state.http_client = http_client

    db_pool: asyncpg.Pool | None = None
    try:
        db_pool = await asyncpg.create_pool(
            settings.database_url,
            min_size=1,
            max_size=5,
        )
    except Exception:
        logger.warning("PostgreSQL 连接失败，L3 使用硬编码 ROUTE_MODEL_MAP", exc_info=True)
    app.state.db_pool = db_pool
    route_model_map = await load_route_model_map_from_db(db_pool)
    app.state.route_model_map = route_model_map
    logger.info("L3 路由模型映射已加载，共 %d 条", len(route_model_map))

    st = await load_semantic_threshold_from_db(db_pool)
    set_semantic_similarity_threshold(st)
    logger.info("L2 语义相似度阈值: %s", st)

    config_listener = asyncio.create_task(_listen_router_config(redis_client, db_pool))

    logger.info("路由引擎启动完成，端口: %d", settings.port)

    yield

    config_listener.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await config_listener

    await http_client.aclose()
    if getattr(app.state, "db_pool", None) is not None:
        await app.state.db_pool.close()
    await redis_client.aclose()
    logger.info("路由引擎已关闭")


app = FastAPI(
    title="Smart Router — 路由引擎",
    description="语义路由、Arch-Router AI 决策、语义缓存服务",
    version="1.1.0",
    lifespan=lifespan,
)

# 路由引擎仅 Docker 内部服务间通信，不直接面向浏览器，无需 CORS 中间件

app.include_router(health.router, tags=["健康检查"])
app.include_router(semantic.router, tags=["语义路由"])
app.include_router(arch_router.router, tags=["Arch-Router"])
app.include_router(cache.router, tags=["语义缓存"])

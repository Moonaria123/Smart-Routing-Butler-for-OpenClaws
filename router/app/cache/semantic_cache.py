# Redis 语义缓存——向量索引创建、缓存查询和写入
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import uuid
from collections.abc import Awaitable
from typing import Any, cast

import numpy as np
import redis.asyncio as aioredis
from redis.commands.search.field import TagField, VectorField
from redis.commands.search.indexDefinition import IndexDefinition, IndexType
from redis.commands.search.query import Query

from app.core.config import settings
from app.core.encoder import encode_text

logger = logging.getLogger(__name__)

INDEX_NAME = "semantic_idx"
KEY_PREFIX = "semantic:"
VECTOR_DIM = settings.vector_dimension
STATS_HITS_KEY = "stats:cache_semantic_hits"


async def create_vector_index(redis_client: aioredis.Redis) -> None:
    """幂等创建 Redis 向量索引，已存在则跳过。"""
    try:
        await redis_client.ft(INDEX_NAME).info()  # type: ignore[no-untyped-call]
        logger.info("语义缓存向量索引 '%s' 已存在", INDEX_NAME)
    except Exception:
        logger.info("正在创建语义缓存向量索引 '%s'...", INDEX_NAME)
        # response 由 hset 写入 HASH，不作为索引字段；no_index TextField 会触发 redis-py ValueError
        schema = (
            VectorField(
                "embedding",
                "FLAT",
                {
                    "TYPE": "FLOAT32",
                    "DIM": VECTOR_DIM,
                    "DISTANCE_METRIC": "COSINE",
                },
            ),
            TagField("model"),
            TagField("messages_hash"),
        )
        definition = IndexDefinition(  # type: ignore[no-untyped-call]
            prefix=[KEY_PREFIX],
            index_type=IndexType.HASH,
        )
        await redis_client.ft(INDEX_NAME).create_index(  # type: ignore[no-untyped-call]
            schema,
            definition=definition,
        )
        logger.info("语义缓存向量索引创建完成")


def _compute_messages_hash(messages: list[dict[str, str]], model: str) -> str:
    """计算 messages + model 的 SHA-256 哈希值。"""
    content = json.dumps({"model": model, "messages": messages}, sort_keys=True)
    return hashlib.sha256(content.encode()).hexdigest()


def _extract_user_content(messages: list[dict[str, str]]) -> str:
    """提取所有 user 消息内容拼接用于 embedding。"""
    parts: list[str] = []
    for msg in messages:
        if msg.get("role") == "user":
            parts.append(msg.get("content", ""))
    return " ".join(parts) if parts else ""


async def _find_existing_key(
    redis_client: aioredis.Redis,
    messages_hash: str,
    model: str,
) -> str | None:
    """查找已存在的相同 hash+model 缓存条目，用于去重更新。"""
    try:
        escaped_model = model.replace("/", "\\/")
        result: list[object] = await redis_client.execute_command(  # type: ignore[no-untyped-call]
            "FT.SEARCH", INDEX_NAME,
            f"@messages_hash:{{{messages_hash}}} @model:{{{escaped_model}}}",
            "NOCONTENT", "LIMIT", "0", "1",
        )
        raw_count = result[0]
        count = int(raw_count) if isinstance(raw_count, (int, str)) else 0
        if result and count > 0:
            return str(result[1])
    except Exception:
        logger.debug("缓存去重查找失败，将创建新条目", exc_info=True)
    return None


async def check_cache(
    redis_client: aioredis.Redis,
    messages: list[dict[str, str]],
    model: str,
    threshold: float = 0.95,
) -> tuple[bool, dict[str, Any] | None, float]:
    """查询语义缓存，返回 (命中, 缓存响应, 相似度)。"""
    user_content = _extract_user_content(messages)
    if not user_content:
        return False, None, 0.0

    # CPU 密集操作放到线程池，避免阻塞事件循环
    loop = asyncio.get_running_loop()
    embedding = await loop.run_in_executor(None, encode_text, user_content)
    embedding_bytes = np.array(embedding, dtype=np.float32).tobytes()

    query = (
        Query("(@model:{$model})=>[KNN 1 @embedding $vec AS score]")
        .sort_by("score")
        .return_fields("score", "response", "messages_hash")
        .dialect(2)
    )

    params: dict[str, Any] = {
        "model": model.replace("/", "\\/"),
        "vec": embedding_bytes,
    }

    try:
        results = await redis_client.ft(INDEX_NAME).search(  # type: ignore[no-untyped-call]
            query, query_params=params
        )
    except Exception:
        logger.warning("语义缓存查询失败", exc_info=True)
        return False, None, 0.0

    if not results.docs:
        return False, None, 0.0

    doc = results.docs[0]
    cosine_distance = float(doc.score)
    similarity = 1.0 - cosine_distance

    if similarity >= threshold:
        try:
            cached_response: dict[str, Any] = json.loads(doc.response)
        except (json.JSONDecodeError, AttributeError):
            return False, None, similarity

        await redis_client.incr(STATS_HITS_KEY)
        return True, cached_response, similarity

    return False, None, similarity


async def write_cache(
    redis_client: aioredis.Redis,
    messages: list[dict[str, str]],
    model: str,
    response: dict[str, Any],
    ttl_seconds: int = 86400,
) -> None:
    """将响应写入语义缓存。"""
    user_content = _extract_user_content(messages)
    if not user_content:
        return

    # CPU 密集操作放到线程池，避免阻塞事件循环
    loop = asyncio.get_running_loop()
    embedding = await loop.run_in_executor(None, encode_text, user_content)
    embedding_bytes = np.array(embedding, dtype=np.float32).tobytes()
    messages_hash = _compute_messages_hash(
        [{"role": m["role"], "content": m["content"]} for m in messages],
        model,
    )

    # 查重：相同 hash+model 的条目直接更新，避免无限增长
    existing_key = await _find_existing_key(redis_client, messages_hash, model)
    key = existing_key if existing_key else f"{KEY_PREFIX}{uuid.uuid4()}"

    mapping: dict[str, str | bytes] = {
        "embedding": embedding_bytes,
        "model": model,
        "messages_hash": messages_hash,
        "response": json.dumps(response, ensure_ascii=False),
    }

    await cast(Awaitable[int], redis_client.hset(key, mapping=mapping))
    if ttl_seconds > 0:
        await cast(Awaitable[bool], redis_client.expire(key, ttl_seconds))

    action = "更新" if existing_key else "新增"
    logger.debug("语义缓存已%s: %s (TTL=%ds)", action, key, ttl_seconds)

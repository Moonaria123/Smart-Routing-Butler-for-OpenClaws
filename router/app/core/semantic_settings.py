# L2 语义路由阈值——env > DB > 默认值，供 ISSUE-V4-06 运行时读取
from __future__ import annotations

import json
import os

import asyncpg

from app.core.config import settings

_semantic_similarity_threshold: float = settings.semantic_similarity_threshold


def get_semantic_similarity_threshold() -> float:
    return _semantic_similarity_threshold


def set_semantic_similarity_threshold(value: float) -> None:
    global _semantic_similarity_threshold  # noqa: PLW0603
    _semantic_similarity_threshold = value


def _default_threshold() -> float:
    return float(settings.semantic_similarity_threshold)


def _parse_stored_threshold(raw: object) -> float | None:
    if isinstance(raw, (int, float)):
        return float(raw)
    if isinstance(raw, dict) and "value" in raw:
        v = raw["value"]
        if isinstance(v, (int, float)):
            return float(v)
    if isinstance(raw, str):
        try:
            data = json.loads(raw)
            if isinstance(data, dict) and "value" in data:
                return float(data["value"])
        except (json.JSONDecodeError, TypeError, ValueError):
            return None
    return None


async def load_semantic_threshold_from_db(pool: asyncpg.Pool | None) -> float:
    """env 优先，其次 DB `semantic_route_threshold`，最后默认。"""
    env = os.getenv("SEMANTIC_SIMILARITY_THRESHOLD")
    if env is not None and env.strip() != "":
        return float(env.strip())
    if pool is None:
        return _default_threshold()
    row = await pool.fetchrow(
        'SELECT value FROM system_config WHERE key = $1 LIMIT 1',
        "semantic_route_threshold",
    )
    if row is None:
        return _default_threshold()
    parsed = _parse_stored_threshold(row["value"])
    return parsed if parsed is not None else _default_threshold()

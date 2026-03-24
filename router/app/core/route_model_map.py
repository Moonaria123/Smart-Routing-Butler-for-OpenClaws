# L3 Arch-Router 类别 → 目标模型映射——代码默认值可被 system_config.l3_route_model_map 覆盖
from __future__ import annotations

import json
import logging

import asyncpg

from app.core.routes import ROUTE_MODEL_MAP

logger = logging.getLogger(__name__)

CONFIG_KEY = "l3_route_model_map"


async def load_route_model_map_from_db(pool: asyncpg.Pool | None) -> dict[str, str]:
    """合并 ROUTE_MODEL_MAP 与数据库中的 JSON 覆盖项（若存在）。"""
    merged: dict[str, str] = dict(ROUTE_MODEL_MAP)
    if pool is None:
        return merged
    try:
        row = await pool.fetchrow(
            'SELECT value FROM system_config WHERE "key" = $1 LIMIT 1',
            CONFIG_KEY,
        )
        if row is None or row["value"] is None:
            return merged
        raw: object = row["value"]
        data: dict[object, object] | None
        if isinstance(raw, str):
            parsed = json.loads(raw)
            data = parsed if isinstance(parsed, dict) else None
        elif isinstance(raw, dict):
            data = raw
        else:
            data = None
        if data is not None:
            for k, v in data.items():
                merged[str(k)] = str(v)
    except Exception:
        logger.warning("加载 L3 路由模型映射失败，使用代码内默认值", exc_info=True)
    return merged

# FastEmbed 编码器全局单例——启动时初始化一次
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import numpy as np
from fastembed import TextEmbedding

from app.core.config import settings

if TYPE_CHECKING:
    from numpy.typing import NDArray

logger = logging.getLogger(__name__)

_encoder: TextEmbedding | None = None


def init_encoder() -> TextEmbedding:
    """启动时调用，初始化 FastEmbed 编码器单例。"""
    global _encoder  # noqa: PLW0603
    if _encoder is None:
        logger.info("正在初始化 FastEmbed 编码器: %s", settings.fastembed_model)
        _encoder = TextEmbedding(model_name=settings.fastembed_model)
        logger.info("FastEmbed 编码器初始化完成")
    return _encoder


def get_encoder() -> TextEmbedding:
    """获取已初始化的编码器实例，未初始化时抛出异常。"""
    if _encoder is None:
        raise RuntimeError("编码器尚未初始化，请先调用 init_encoder()")
    return _encoder


def encode_text(text: str) -> list[float]:
    """将文本编码为向量，返回 float 列表。"""
    encoder = get_encoder()
    embeddings: list[NDArray[np.float32]] = list(encoder.embed([text]))
    return embeddings[0].tolist()  # type: ignore[no-any-return]


def is_encoder_ready() -> bool:
    """检查编码器是否已初始化。"""
    return _encoder is not None

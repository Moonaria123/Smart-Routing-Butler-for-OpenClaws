# 环境变量配置——使用 pydantic-settings 加载
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """路由引擎全局配置，从环境变量读取。"""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    redis_url: str = "redis://redis:6379"
    ollama_url: str = "http://host.docker.internal:11434"
    arch_router_model: str = "fauxpaslife/arch-router:1.5b"
    database_url: str = "postgresql://user:pass@postgres:5432/routerdb"
    fastembed_model: str = "BAAI/bge-small-zh-v1.5"
    port: int = 8001

    semantic_route_timeout_ms: int = 55
    arch_router_timeout_ms: int = 140
    semantic_similarity_threshold: float = 0.85
    cache_similarity_threshold: float = 0.95
    vector_dimension: int = 384


settings = Settings()

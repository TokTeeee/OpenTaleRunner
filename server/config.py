"""服务端配置 — 所有配置通过环境变量注入"""
import os, sys
from dataclasses import dataclass, field


@dataclass
class Settings:
    port: int = int(os.getenv("SERVICE_PORT", "8000"))
    data_dir: str = os.getenv("SERVICE_DATA_DIR", "./data")
    jwt_secret: str = os.getenv("SERVICE_JWT_SECRET", "")
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = int(os.getenv("SERVICE_JWT_EXPIRE_HOURS", "72"))
    llm_api_key: str = os.getenv("SERVICE_LLM_KEY", "")
    llm_endpoint: str = os.getenv("SERVICE_LLM_ENDPOINT", "https://api.deepseek.com/chat/completions")
    llm_model: str = os.getenv("SERVICE_LLM_MODEL", "deepseek-chat")
    llm_temperature: float = float(os.getenv("SERVICE_LLM_TEMPERATURE", "0.7"))
    llm_max_tokens: int = int(os.getenv("SERVICE_LLM_MAX_TOKENS", "2048"))
    db_path: str = os.getenv("SERVICE_DB_PATH", "./data/aeslan.db")
    storybook_path: str = os.getenv("STORYBOOK_PATH", "./data/storybook.json")
    ghost_npc_ttl: int = 2 * 24 * 3600
    chronicle_aggregate_min_logs: int = int(os.getenv("CHRONICLE_AGGREGATE_MIN_LOGS", "1"))
    cors_origins: list[str] = field(default_factory=lambda: [
        o.strip() for o in os.getenv("SERVICE_CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",") if o.strip()
    ])
    rate_limit: int = int(os.getenv("SERVICE_RATE_LIMIT", "60"))
    rate_window: int = int(os.getenv("SERVICE_RATE_WINDOW", "60"))

    def __post_init__(self):
        if not self.jwt_secret:
            print("ERROR: SERVICE_JWT_SECRET environment variable is required.")
            print("  Example: export SERVICE_JWT_SECRET=$(openssl rand -hex 32)")
            sys.exit(1)


settings = Settings()

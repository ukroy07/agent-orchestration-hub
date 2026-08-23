from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List
import json


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # App
    APP_NAME: str = "AgentHub"
    DEBUG: bool = False
    FRONTEND_URL: str = "http://localhost:5173"

    # Database
    # Postgres in production: postgresql+asyncpg://...
    # Local zero-infra dev: sqlite+aiosqlite:///./agenthub.db (see README)
    DATABASE_URL: str

    # Redis
    # Real Redis in production: redis://localhost:6379/0
    # Local zero-infra dev: memory:// (in-process fakeredis, see README)
    REDIS_URL: str = "redis://localhost:6379/0"

    # Logging
    LOG_LEVEL: str = "INFO"
    # SQLAlchemy's statement echo, kept separate from DEBUG on purpose: it
    # emits a multi-line block per query and drowns out the agent log lines
    # that are the point of the terminal output.
    SQL_ECHO: bool = False

    # JWT
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Refresh-token cookie. Defaults suit local dev over http://localhost;
    # a real deployment sets COOKIE_SECURE=True. COOKIE_SAMESITE stays "lax"
    # unless the frontend is on a genuinely different site, because lax is
    # what stops a cross-site POST to /auth/refresh from carrying the cookie
    # - switch it to "none" and you need CSRF tokens (see README).
    COOKIE_SECURE: bool = False
    COOKIE_SAMESITE: str = "lax"
    COOKIE_DOMAIN: str = ""

    # Session (required by Authlib/Starlette to hold OAuth state + nonce)
    SESSION_SECRET_KEY: str = "change-me-session-secret"

    # OAuth - Google
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/auth/google/callback"

    # LLM - both providers are optional at import time so the app can boot
    # (and serve auth/tasks/health) before a key is configured. The agents
    # raise a clear error at first use instead; see agents/llm.py.
    LLM_PROVIDER: str = "auto"          # auto | google | openai
    LLM_MODEL: str = ""                 # blank = the provider's default below
    OPENAI_API_KEY: str = ""
    GOOGLE_API_KEY: str = ""            # Gemini (AI Studio) key

    # CORS - kept as a raw str field deliberately. pydantic-settings tries to
    # JSON-decode any List-typed env value at the *source* layer, before any
    # field_validator runs - so a plain comma-separated string in .env would
    # raise SettingsError on startup rather than being caught and reparsed.
    # Parsing it ourselves in a property sidesteps that entirely and accepts
    # both syntaxes.
    CORS_ORIGINS: str = "http://localhost:5173"

    @property
    def cors_origins_list(self) -> List[str]:
        raw = self.CORS_ORIGINS.strip()
        if raw.startswith("["):
            return json.loads(raw)
        return [origin.strip() for origin in raw.split(",") if origin.strip()]

    @property
    def llm_provider_resolved(self) -> str:
        """Which provider the agents will actually use. "auto" picks whichever
        key is present, preferring Google - so a .env with only GOOGLE_API_KEY
        set needs no other change. Returns "none" when neither is configured."""
        if self.LLM_PROVIDER != "auto":
            return self.LLM_PROVIDER
        if self.GOOGLE_API_KEY:
            return "google"
        if self.OPENAI_API_KEY:
            return "openai"
        return "none"


settings = Settings()

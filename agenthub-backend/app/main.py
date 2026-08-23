from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
from starlette.middleware.sessions import SessionMiddleware

from app.config import settings
from app.core.logging import setup_logging

# Before anything else imports `logging` and grabs a handler - in particular
# before uvicorn's loggers are touched - so every line in the terminal comes
# out in one format.
setup_logging(level=settings.LOG_LEVEL, sql_echo=settings.SQL_ECHO)

from app.database import engine, Base  # noqa: E402 - must follow setup_logging
import app.models  # noqa: F401 - populates Base.metadata for create_all/Alembic
from app.agents.llm import DEFAULT_MODELS
from app.api.routes import admin, auth, oauth, tasks, websocket, health

app = FastAPI(title=settings.APP_NAME, version="1.0.0", description="Multi-agent AI collaboration platform")

# Required by Authlib to store OAuth state/nonce between the redirect to
# Google and the callback - unrelated to our own JWT auth.
app.add_middleware(SessionMiddleware, secret_key=settings.SESSION_SECRET_KEY)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(oauth.router)
app.include_router(tasks.router)
app.include_router(websocket.router)
app.include_router(admin.router)


@app.on_event("startup")
async def on_startup():
    log = logger.bind(agent="system")
    backend = "SQLite" if settings.DATABASE_URL.startswith("sqlite") else "PostgreSQL"
    broker = "fakeredis (in-process)" if settings.REDIS_URL.startswith("memory://") else "Redis"
    provider = settings.llm_provider_resolved
    model = settings.LLM_MODEL or DEFAULT_MODELS.get(provider, "unset")

    log.info("{} starting up", settings.APP_NAME)
    log.info("database : {}", backend)
    log.info("events   : {}", broker)
    if provider == "none":
        log.warning("llm      : not configured - set GOOGLE_API_KEY or OPENAI_API_KEY in .env")
    else:
        log.info("llm      : {} / {}", provider, model)
    if not settings.GOOGLE_CLIENT_ID:
        log.debug("google oauth not configured - email/password login only")

    # Dev convenience only - in a real deploy, `alembic upgrade head` owns
    # the schema and this should be removed.
    if settings.DEBUG:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        log.debug("schema synced via create_all (DEBUG=True)")

    # Deliberately no host/port here - uvicorn logs the real bind address on
    # the next line, and hardcoding one just prints a lie when --port differs.
    log.success("ready - interactive API docs at /docs")


@app.on_event("shutdown")
async def on_shutdown():
    logger.bind(agent="system").info("shutting down")

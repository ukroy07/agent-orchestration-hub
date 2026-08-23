from sqlalchemy import event
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import settings

IS_SQLITE = settings.DATABASE_URL.startswith("sqlite")

# SQLite is the zero-infra local dev path only (see README "Zero-infra local
# dev"); Postgres remains the default and the only supported deployment
# target. `timeout` is aiosqlite's busy-wait before raising "database is
# locked" - the background agent workflow writes an agent_logs row per event
# while request handlers read, so the two do collide briefly under SQLite's
# single-writer lock.
_engine_kwargs = (
    {"connect_args": {"check_same_thread": False, "timeout": 30}}
    if IS_SQLITE
    else {"pool_pre_ping": True}
)

engine = create_async_engine(settings.DATABASE_URL, echo=settings.SQL_ECHO, **_engine_kwargs)

if IS_SQLITE:
    @event.listens_for(engine.sync_engine, "connect")
    def _sqlite_pragmas(dbapi_connection, connection_record):
        # WAL lets the reader (HTTP requests) and the writer (the agent
        # workflow) work concurrently instead of blocking each other, and
        # foreign keys are OFF by default in SQLite - without this the
        # ondelete="CASCADE" declared on every FK would silently do nothing.
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    """FastAPI dependency: one session per request, committed/rolled back automatically."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

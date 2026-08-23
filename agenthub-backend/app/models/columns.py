"""Column types that render natively on Postgres but still work on SQLite.

Postgres is the target: `UUIDType` emits a real `UUID` column and `JSONType`
emits `JSONB` there, so the schema Alembic manages is exactly what it was
when these were imported straight from `sqlalchemy.dialects.postgresql`. The
only difference is that the same models now also run on SQLite (CHAR(32) and
TEXT-backed JSON) for the zero-infra local dev mode - importing the
postgresql dialect types directly made that impossible, since they raise on
any other backend.

Don't reach for `sqlalchemy.dialects.postgresql.UUID/JSONB` in a new model -
use these instead, or that model will be the one that breaks SQLite dev.
"""

import uuid
from datetime import timezone

from sqlalchemy import JSON, DateTime, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.types import TypeDecorator


class UUIDType(TypeDecorator):
    """UUID column that also accepts a plain `str` on the way in.

    The coercion is not cosmetic. `postgresql.UUID` let you bind a string
    (the driver parsed it), and several call sites rely on that - the agent
    workflow is handed `str(task.id)` because it crosses a background-task
    boundary, and `get_current_user` compares against the JWT's `sub` claim,
    which is a string by definition. SQLAlchemy's cross-dialect `Uuid` is
    stricter and calls `value.hex` directly, so without this every one of
    those queries would fail with `'str' object has no attribute 'hex'` on
    SQLite while continuing to work on Postgres - exactly the kind of
    dev/prod split the dev mode is supposed to avoid.
    """

    impl = Uuid(as_uuid=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if isinstance(value, str):
            return uuid.UUID(value)
        return value


# JSONB on Postgres, plain JSON on everything else.
JSONType = JSON().with_variant(JSONB(), "postgresql")


class TZDateTime(TypeDecorator):
    """Timestamp column that is timezone-aware on the way in *and* out.

    Postgres `timestamptz` round-trips an aware datetime unchanged, but
    SQLite has no timezone-aware storage at all - it drops the offset on
    write and hands back a naive datetime on read. Any later comparison
    against `datetime.now(timezone.utc)` then dies with "can't compare
    offset-naive and offset-aware datetimes"; `RefreshToken.expires_at` in
    `/auth/refresh` is the one that hits it first.

    So: normalize to UTC on write, re-attach UTC on read if the driver
    dropped it. Postgres behaviour is unchanged (it already returns aware
    values, so the read hook is a no-op there) - this exists purely so the
    "every timestamp is timezone-aware" invariant in CLAUDE.md holds on
    every backend instead of only on the one we deploy to.
    """

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None and value.tzinfo is None:
            # The codebase only ever writes datetime.now(timezone.utc), so a
            # naive value here already means UTC; label it rather than guess.
            return value.replace(tzinfo=timezone.utc)
        if value is not None:
            return value.astimezone(timezone.utc)
        return value

    def process_result_value(self, value, dialect):
        if value is not None and value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value

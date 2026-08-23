# CLAUDE.md — agenthub-backend

Context for Claude Code (or any future session of Claude) working in this
repo. Read this before making changes.

## What this is

FastAPI backend for AgentHub. JWT + Google OAuth auth, a 4-agent LangGraph
orchestrator, WebSocket streaming via Redis pub/sub with a replay buffer.
Sister repo `agenthub-frontend` is the React client — they're deployed as
separate services and only talk over HTTP/WebSocket, never share code.

## Before touching anything

```bash
python -m venv orchestration-venv && source orchestration-venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # SECRET_KEY + one LLM key (GOOGLE_API_KEY or OPENAI_API_KEY)
uvicorn app.main:app --reload --port 8000
```

The `.env.example` defaults are the **zero-infra dev mode**: SQLite
(`sqlite+aiosqlite:///./agenthub.db`) and in-process fakeredis
(`memory://`), so nothing above needs Docker, Postgres, or Redis. For the
production-shaped stack, point `DATABASE_URL`/`REDIS_URL` at real services
and run `docker compose up -d db redis && alembic upgrade head` first.
Postgres is still the deployment target — SQLite is a dev convenience, and
Alembic only ever targets Postgres.

Sanity check after any change: `python -c "from app.main import app"` — this
catches import-time wiring errors (bad route registration, circular
imports, missing env vars) in a second, before you get to Alembic or
uvicorn. This project's history has several bugs that only a real running
server caught (see "Landmines" below) — prefer testing against the real
`docker compose up -d db redis` stack over trusting that code "looks right."

## Architecture

```
Request → route (api/routes/) → service (services/) → model (models/)
                                        ↓
                              agents/orchestrator.py (LangGraph)
                                        ↓
                         emit() closure: persist to agent_logs
                                       + publish to Redis (live)
                                       + push to Redis list (replay buffer)
```

- **`agents/orchestrator.py`** builds the LangGraph state machine. Nodes MUST
  be wrapped as real `async def` closures (see `_make_node`) — a lambda that
  returns a coroutine is not itself a coroutine function, and LangGraph's
  `iscoroutinefunction` check will silently misdetect it as sync. This bit us
  once already; don't "simplify" it back to a lambda.
- **`services/agent_service.py`** owns the `emit()` closure that every agent
  calls. It does three things per event: DB write (audit trail), Redis
  publish (live), Redis list push (replay buffer for late subscribers). If
  you add a new event type, it flows through this automatically — you don't
  need to touch the WebSocket route.
- **`services/connection_manager.py`** subscribes to the Redis channel
  *before* reading the replay buffer, on purpose — reversing that order
  reopens the exact race it exists to close. See the docstring before
  changing the ordering.
- **Every timestamp column is `TZDateTime`** (from `models/columns.py`), and
  every default uses `datetime.now(timezone.utc)`, never bare
  `datetime.utcnow()`. Mixing naive and aware datetimes is a real asyncpg
  `DataError` on write, not a lint nitpick — it happened during the initial
  build (see git history / the `RefreshToken.expires_at` fix) — and a
  `TypeError` on *read* under SQLite, which has no timezone-aware storage
  and hands back naive values. `TZDateTime` normalizes both directions so
  the invariant holds on either backend.
- **Every JWT carries a `jti`**. Without it, two tokens minted for the same
  user in the same second are byte-identical (JWT `exp` has only second
  precision) and collide on `refresh_tokens.token`'s unique constraint. Also
  bit us once already.

## Conventions

- Routes stay thin: auth/ownership checks + calling a service function.
  Business logic lives in `services/`, not in `api/routes/`.
- Admin endpoints go in `api/routes/admin.py`, whose router already carries
  `Depends(require_admin)` - don't create a second admin router without it,
  and don't move the dependency down onto individual endpoints, or the next
  route someone adds ships unguarded.
- Anything the admin surface returns must stay **metrics only** - no task
  titles, descriptions, agent thoughts or results. Add the field to
  `schemas/admin.py` as well as the service, or it silently won't reach the
  client (which is the safety net working, not a bug).
- Log with `logger.bind(agent="<name>").info(...)`, never `print()`. The
  `agent` field drives the coloured column in `core/logging.py`; without it
  a line still prints, just uncoloured and labelled `app`. Agent events are
  already logged centrally from `emit()` — don't add a second log call
  inside an agent for something `emit()` will carry anyway.
- Every `tasks/{id}...` route re-checks `Task.user_id == current_user.id` in
  its own query rather than trusting a prior check — see existing routes for
  the pattern.
- New agents go in `agents/`, get wired into `orchestrator.py`'s graph, and
  should call `emit()` at least on start ("thinking") and on handoff — the
  frontend's agent-status derivation depends on seeing those event names.
  Get the chat model from `agents/llm.py::get_llm(temperature)` — don't
  import a provider class directly, or that agent stops following
  `LLM_PROVIDER` and reintroduces landmine 9.
- Alembic migrations are real, not stubs — always
  `alembic revision --autogenerate` then read the generated file before
  applying it; autogenerate misses some changes (renames look like
  drop+add).

## Landmines already hit once (don't reintroduce)

1. `CORS_ORIGINS` as a `List[str]` pydantic-settings field throws
   `SettingsError` on a plain comma-separated `.env` value — pydantic-settings
   tries to JSON-decode complex-typed fields at the source layer, before any
   validator runs. It's a raw `str` field with a `cors_origins_list` property
   instead. Don't change the field back to `List[str]`.
2. LangGraph node closures must be real `async def`, not lambdas (see above).
3. Timestamp columns must be timezone-aware (see above).
4. JWTs need a `jti` (see above).
5. Redis pub/sub alone drops anything published before a client subscribes —
   this is why the replay buffer in `agent_service.py` /
   `connection_manager.py` exists. Don't remove it as "simplification."
6. A code_review task's revise-loop must route back to `coder`, not `writer`
   — they see completely different context. Check `should_revise()` in
   `orchestrator.py` if you touch the graph's conditional edges.
7. Models must use `UUIDType`/`JSONType` from `models/columns.py`, never
   `sqlalchemy.dialects.postgresql.UUID`/`JSONB` directly — the dialect
   types raise on any non-Postgres backend, which is what makes the SQLite
   dev mode possible at all. They render identically on Postgres (`UUID`,
   `JSONB`), so this costs nothing there.
8. `UUIDType` coerces `str` → `uuid.UUID` on bind, on purpose. The
   postgresql dialect type accepted strings; SQLAlchemy's cross-dialect
   `Uuid` calls `value.hex` and blows up. Real call sites depend on this —
   the agent workflow receives `str(task.id)` across the background-task
   boundary, and `get_current_user` compares against the JWT `sub` claim,
   which is a string by definition. Remove the coercion and those queries
   fail on SQLite while still passing on Postgres.
9. Chat models are built lazily via `agents/llm.py::get_llm()`, never at
   agent-module import time. `app.main` imports the agents transitively at
   startup, so a module-level `ChatOpenAI(...)` turns a bad API key into a
   boot failure (health check included) instead of a task failure the UI can
   show. Don't hoist it back to module scope.
10. `memory://` (fakeredis) holds its data inside the API process, so it only
    works with a single uvicorn worker. Don't add `--workers N` to a dev
    command without also switching to real Redis.
11. Never put loguru colour markup (`<red>...</red>`) inside a log
    *message*. Messages carry LLM output and task descriptions, and a stray
    `<` in that text is parsed as a malformed tag and raises at log time.
    Colour comes from the format callable in `core/logging.py`, which
    applies it to the record's fields instead — that's why it's a callable
    and not a static format string.
12. `SQL_ECHO` is a separate setting from `DEBUG` on purpose. Wiring the
    engine's `echo` back to `DEBUG` buries every agent log line under
    multi-line SQL blocks, which defeats the point of the terminal output.
13. The JWT's `active_role` is **session state, not an authorization
    grant**. It records which role this session signed in as; whether the
    account actually holds that role is re-read from `users.roles` on every
    request in `get_principal`. Don't "optimise" the DB read away by
    trusting the claim - an access token lives ACCESS_TOKEN_EXPIRE_MINUTES,
    so a revoked admin would keep working for that long. The row is already
    loaded to authenticate the caller; the role check is free.
14. `record_login()` is called from register/login/OAuth callback but
    deliberately *not* from `/auth/refresh`. A refresh is one session
    continuing; counting it would turn "sign-ins" into "requests" and make
    every dashboard number meaningless.
15. Timestamp columns must be `TZDateTime`, not `DateTime(timezone=True)`.
    Postgres round-trips an aware datetime fine, so a plain `DateTime`
    column looks correct right up until SQLite returns it naive and
    `/auth/refresh`'s `expires_at < now(timezone.utc)` raises "can't compare
    offset-naive and offset-aware datetimes". This one was found by running
    the dev stack, not by reading the code — which is the general lesson.
16. The refresh token lives in an HttpOnly cookie and must never be returned
    in a response body. That's the whole defence: a body value has to be
    stored somewhere JavaScript can read, and any XSS then buys a permanent
    session instead of a few minutes. `TokenResponse` has no refresh field -
    keep it that way, and don't add a `refresh_token` query/body parameter
    "for convenience" or testing.
17. `/auth/refresh` detects reuse. A revoked-but-presented token revokes
    every session for that user, because a replay and a theft are
    indistinguishable. Don't downgrade that to "just reject this one
    request" - the detection is the only signal a stolen token gives you.
18. Registration grants nothing. `/auth/register` creates a `pending`
    account with no roles and returns no tokens; login refuses until an
    admin approves. Google OAuth goes through the same gate - a first-time
    Google sign-in creates a pending account rather than a usable one, or
    OAuth becomes a way around approval.
19. Login derives the session role from the account (`_default_role`) and
    never from the request. `UserLogin` has no `role` field on purpose: an
    account holding admin always signs in as admin, so a client cannot ask
    for a downgraded session at the door - not through the UI and not
    through a hand-rolled POST. Moving to the workspace is the explicit
    `/auth/switch-role` call instead, which is logged and mints a new
    token. Re-adding a `role` field to login reopens exactly this bug.

## Dependency pins worth knowing

The version pins in `requirements.txt` are load-bearing on Python 3.14 —
several are the *first* release of their line that runs there at all:

- `sqlalchemy==2.0.52` — earlier 2.0.x (2.0.36 included) crash at model
  import with `TypeError: descriptor '__getitem__' requires a
  'typing.Union' object`, from 3.14's typing changes.
- `pydantic==2.13.4` — first line shipping cp314 wheels for `pydantic-core`;
  older pins try to compile Rust from source and fail without a toolchain.
- `asyncpg==0.31.0` — same story, first release with cp314 wheels.
- `bcrypt==4.0.1` — pinned *down* deliberately. Its wheels are abi3 so it
  installs fine on 3.14, and passlib 1.7.4 breaks its backend detection on
  bcrypt ≥ 4.1.

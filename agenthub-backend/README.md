# AgentHub — Backend

FastAPI microservice powering AgentHub: JWT + Google OAuth authentication,
a 4-agent LangGraph orchestrator (Researcher, Writer, Critic, Coder), and
real-time WebSocket streaming of every agent thought, handoff, and score.

## Stack

FastAPI · SQLAlchemy 2 (async) · PostgreSQL · Alembic · Redis · LangGraph ·
LangChain (Gemini or OpenAI) · Authlib (OAuth) · python-jose (JWT) · loguru

Runs on Python 3.11–3.14. For local dev without any of that infrastructure,
see "Zero-infra local dev" below.

## Architecture in one paragraph

A task is created via REST and immediately returned to the caller with
`status: running`; the actual multi-agent workflow executes in a FastAPI
background task. Every agent action calls a single `emit()` closure that does
three things: writes a row to `agent_logs` (the permanent audit trail),
publishes to a Redis pub/sub channel (live delivery), and pushes onto a
short-lived Redis list (a replay buffer, so a client that connects even a
few hundred milliseconds late — which is normal, not an edge case — still
gets the full history before continuing live). The WebSocket endpoint
subscribes to the channel *before* reading the buffer, so nothing published
in that narrow window is dropped, and de-duplicates by sequence number.

## Local setup

```bash
python -m venv orchestration-venv
source orchestration-venv/bin/activate        # Windows: orchestration-venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env             # then set SECRET_KEY and one LLM key
```

Then pick one of the two ways to run it.

### Zero-infra local dev (no Docker, no Postgres, no Redis)

The defaults in `.env.example` are already set for this:

```
DATABASE_URL=sqlite+aiosqlite:///./agenthub.db
REDIS_URL=memory://
```

```bash
uvicorn app.main:app --reload --port 8000
```

That's it — the tables are created on startup (the `DEBUG=True`
`Base.metadata.create_all` hook), and `memory://` swaps Redis for
[fakeredis](https://pypi.org/project/fakeredis/) running inside the API
process. Neither substitution is a stub: the live agent stream needs pub/sub
*plus* the `rpush`/`lrange` replay buffer, and fakeredis implements all of
it — verified with a client connecting a second late and still receiving
every event from sequence 1.

Two things to know before leaning on this mode:

- **Single worker only.** fakeredis lives inside *this* process, so a second
  uvicorn worker gets its own empty copy and sees none of the first one's
  events. Anything past `--workers 1` needs real Redis.
- **Alembic is the Postgres path.** The migrations target Postgres; under
  SQLite the startup `create_all` owns the schema. Delete `agenthub.db` to
  reset it.

### Full stack (Postgres + Redis — matches production)

Point `.env` at real services (the commented-out URLs in `.env.example`) and
bring the dependencies up:

```bash
docker compose up -d db redis    # just the dependencies
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

Visit `http://localhost:8000/docs` for interactive API docs.

### Everything in Docker

```bash
docker compose up --build
```

This runs Postgres, Redis, and the API together, running migrations
automatically before the server starts.

## Environment variables

See `.env.example` for the full list with comments. The ones you can't skip:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://...` (must use the asyncpg driver), or `sqlite+aiosqlite:///./agenthub.db` for zero-infra dev |
| `REDIS_URL` | `redis://...`, or `memory://` for zero-infra dev (single worker only) |
| `SECRET_KEY` | JWT signing key. Generate with `python -c "import secrets; print(secrets.token_urlsafe(32))"` |
| `SESSION_SECRET_KEY` | Separate key for OAuth state (Authlib/Starlette SessionMiddleware) — must differ from `SECRET_KEY` |
| `GOOGLE_API_KEY` **or** `OPENAI_API_KEY` | One of the two is required for the agents to actually run. See below. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional — Google *login*, unrelated to the Gemini key above. From [Google Cloud Console](https://console.cloud.google.com/apis/credentials); redirect URI must exactly match `GOOGLE_REDIRECT_URI` |

### Choosing an LLM provider

The agents don't hard-code a provider. `app/agents/llm.py` builds the chat
model from config, so all four agents follow one setting:

| Setting | Effect |
|---|---|
| `GOOGLE_API_KEY=...` | Gemini ([AI Studio key](https://aistudio.google.com/apikey)), default model `gemini-3.5-flash-lite` |
| `OPENAI_API_KEY=...` | OpenAI, default model `gpt-4o` |
| `LLM_PROVIDER` | `auto` (default — uses whichever key is set, Google wins if both are), or force `google` / `openai` |
| `LLM_MODEL` | Override the default model for the chosen provider |

**Free-tier quota is the thing that will bite you.** Gemini's free tier
meters requests *per model per day*, and one AgentHub task costs 3-6 LLM
calls (researcher, writer, critic, plus a revision round). On
`gemini-3.7-flash` the free allowance is 20 requests/day - about four tasks
before every run fails with a `429 ... generate_content_free_tier_requests`.
That's why the default is a lite model. Switching `LLM_MODEL` also switches
which daily bucket you're spending from.

Google also retires models for *new* API keys, returning
`404 ... is no longer available to new users` with the replacement named in
the message. If that happens, put the suggested model in `LLM_MODEL` and
bump `DEFAULT_MODELS` in `app/agents/llm.py`.

The model is built lazily, on first agent use. That's deliberate: a missing
or invalid key surfaces as a normal task failure — written to `agent_logs`
and streamed to the UI like any other agent error — instead of an import-time
crash that would take the whole app, health check included, down with it.


## Terminal logging

Everything the server prints goes through loguru, in one colorized format
(`app/core/logging.py`):

```
01:27:37.944 | INFO    | system     | task 9d023aa2 started (general)
01:27:38.000 | INFO    | researcher | [thinking] Analyzing task: ...
01:27:41.230 | INFO    | researcher | [handoff] -> writer
01:27:42.566 | INFO    | critic     | [thinking] Evaluating the draft ...
01:27:43.571 | INFO    | critic     | [evaluation] score 100/100 - approved
01:27:43.586 | SUCCESS | system     | task 9d023aa2 completed - score 100/100
```

The agent column is coloured per agent, using the same palette as the
frontend's flow canvas — so a workflow reads the same way in the terminal as
it does in the browser. uvicorn, SQLAlchemy, Authlib and `warnings.warn` are
all intercepted into the same stream, so there's one format on screen rather
than four.

Agent events are logged from the `emit()` closure in
`services/agent_service.py` — the single place every event already passes
through — so a new event type appears in the terminal without wiring
anything up.

| Setting | Effect |
|---|---|
| `LOG_LEVEL` | `INFO` (default). `DEBUG` adds model construction and schema sync. |
| `SQL_ECHO` | `False` (default). `True` logs every SQL statement — deliberately *not* tied to `DEBUG`, since it's a multi-line block per query and buries the agent lines. |

To log from new code, bind the agent so the colour and column come out right:

```python
from loguru import logger
logger.bind(agent="critic").info("re-scoring after revision {}", n)
```

## Auth flows

### Token handling

The refresh token is an **HttpOnly cookie**; the access token is returned in
the response body and held **in memory** by the client. Nothing
authentication-related is written to `localStorage`.

That split is the point. A token in web storage is readable by every script
on the origin, so a single XSS hole - ours, a dependency, a browser
extension - hands over a *persistent* session. Here, the worst an injected
script can take is an access token that dies in
`ACCESS_TOKEN_EXPIRE_MINUTES`, and it cannot read the refresh cookie at all.

| Property | How |
|---|---|
| Not script-readable | `HttpOnly`, `Path=/auth` (not attached to ordinary API calls) |
| CSRF | `SameSite=lax` - browsers do not attach lax cookies to cross-site POSTs |
| Rotation | Every refresh mints a new token and revokes the old one; single use |
| Reuse detection | Presenting an already-revoked token revokes **every** session for that user |
| Transport | `COOKIE_SECURE=True` in any real deployment |

**Reuse detection** is the part worth understanding. Rotation alone tells you
nothing when a token is actually stolen - both the thief and the real client
hold a valid-looking copy. When a revoked token comes back, one of them
replayed it and there is no way to tell which, so the whole family is
revoked and everyone signs in again. That turns silent indefinite access
into one forced login.

If you deploy the frontend and API on genuinely different sites and have to
set `COOKIE_SAMESITE=none`, you lose the CSRF property above and need to add
a CSRF token to the refresh endpoint.

Because the access token lives in memory, a page reload starts with nothing -
the client calls `POST /auth/refresh` once on boot to trade the cookie for a
fresh token. The refresh token carries the session's `active_role` so a
reload comes back as the role you signed in with, rather than silently
dropping an admin into the workspace.

### Registration is a request, not a grant

`POST /auth/register` creates an account with `approval_status=pending`, no
roles, and **returns no tokens** - there is nothing to sign into yet. Login
refuses with 403 until an admin approves. Google OAuth goes through the same
gate: a first-time Google sign-in creates a pending account, or OAuth would
be a way around approval.

| Route | Behaviour |
|---|---|
| `POST /auth/register` | 202, pending. Body carries `requested_role` (`user` or `admin`) |
| `POST /auth/login` | No role in the body. The server derives it: admin if the account holds it |
| `POST /auth/refresh` | **No body.** Reads the cookie, rotates it, returns a new access token |
| `POST /auth/switch-role` | Re-issues the session under another role the account already holds |
| `POST /auth/logout` | Revokes the token and clears the cookie |

**Google OAuth**: `GET /auth/google/login` -> Google -> `GET
/auth/google/callback` -> the backend upserts the user and redirects to
`{FRONTEND_URL}/oauth/callback?code=...` with a one-time exchange code. The
code resolves to a *user id*, not to tokens: the session is minted when the
frontend calls `POST /auth/oauth/exchange`, so no refresh token is ever
written to Redis or placed in a URL. The code is deleted on first use and
expires after 60 seconds either way.

## Roles and the admin dashboard

Two roles, stored as a comma-separated `users.roles` column: **user**
(create and run tasks, see only your own) and **admin** (the platform
dashboard and the approval queue). An account can hold both.

**Sign-in does not offer a choice.** The session role is derived from the
account: hold admin and you sign in as admin, full stop. Login is not a
place to pick a lesser identity - if it were, the account's privilege level
would be decided by whoever is typing. Reaching the workspace from an admin
account is a deliberate `POST /auth/switch-role`, which re-checks
membership, logs the change, and mints a new token.

An **active session role** is separate from what the account holds.
`require_admin` demands both: the account has `admin`, *and* this session
signed in as admin. So a dual-role user working in the workspace cannot
reach the admin API at all - and neither can anything riding that session.

### Creating the first admin

The admin API can promote people, but it takes an admin to call it - so the
first one is made out of band:

```bash
python -m scripts.set_role you@example.com admin        # admin only
python -m scripts.set_role you@example.com user,admin   # both
python -m scripts.set_role --list                       # who exists, roles, status
```

Granting roles also marks the account approved - roles without approval
would leave it unable to sign in, which just looks broken.

Sign out and back in afterwards: the frontend reads the role from the login
response, so an open session still thinks it's a plain user.

### Endpoints

| Route | Returns |
|---|---|
| `GET /admin/stats` | Platform totals: users, sign-ins, task counts and success rate, score distribution, 14-day activity, per-agent event counts, per-user rollup |
| `GET /admin/users` | Account roster with task counts, average score, sign-in count, last seen |
| `GET /admin/registrations` | Accounts awaiting a decision, oldest first |
| `POST /admin/registrations/{id}/approve` | Grant roles. The grant need not match the request - an admin request can be approved as plain user |
| `POST /admin/registrations/{id}/reject` | Deny access and revoke any sessions |
| `PATCH /admin/users/{id}/roles` | Change roles. Refuses to remove your *own* admin role |
| `PATCH /admin/users/{id}/active` | Activate/deactivate. Refuses to deactivate yourself |

Taking a role away revokes that account's refresh tokens, and
`get_principal` re-reads roles per request - so a revoked admin loses the
console on their very next call rather than when their token happens to
expire.

Two properties worth keeping:

- **What the account holds is read from the database, never from the JWT.**
  The token's `active_role` records which role the session chose; whether the
  account actually has it is re-checked against the row on every request. A
  role baked into a token as a *grant* would keep working for the token's
  full lifetime after a demotion.
- **`require_admin` is attached to the router, not to each endpoint.** A new
  route added to `api/routes/admin.py` is admin-only by default; forgetting
  the dependency locks a door rather than opening one.

### Metrics only, by design

`services/admin_service.py` returns counts, scores, statuses and timestamps.
It never returns task titles, descriptions, agent thoughts, or generated
results - an admin can see that a user ran twelve `code_review` tasks
averaging 91/100 and cannot read what any of them said. The response models
in `schemas/admin.py` are the second half of that guarantee: a field added to
the service payload but not to the schema never reaches a client.

## Database migrations

The schema is managed entirely through Alembic — there's no
`create_all()` in production paths (the `Base.metadata.create_all` in
`main.py`'s startup hook only runs when `DEBUG=True`, for quick local
iteration without waiting on a migration).

```bash
alembic revision --autogenerate -m "describe your change"
alembic upgrade head
```

## Testing notes

This was built and verified against a real local Postgres + Redis, not just
unit tests against mocks — including catching and fixing three real bugs
along the way (a naive/timezone-aware datetime mismatch on `RefreshToken`,
a JWT collision when two tokens were minted for the same user within the
same second, and the Redis pub/sub race described above).

The zero-infra dev mode was then verified the same way, against a running
server rather than by inspection:

- register → login → create task → poll status → read the audit trail, over HTTP
- a WebSocket client connecting a deliberate 1.5s **late** still received
  every event from sequence 1, in order, with no duplicates (the replay
  buffer, on fakeredis)
- human override in both directions — `POST /tasks/{id}/override` and a
  message sent up the socket — arriving live on an already-connected client
  (pub/sub, on fakeredis)
- the React client driven through the browser: login, dashboard, and the live
  task view rendering the flow canvas and thought stream, no console errors

That pass caught one real bug the code review hadn't: `/auth/refresh` 500'd
under SQLite, because SQLite has no timezone-aware storage and returned
`RefreshToken.expires_at` naive, which can't be compared to
`datetime.now(timezone.utc)`. Fixed centrally in the `TZDateTime` column
type rather than at the call site, so the "every timestamp is aware"
invariant now holds on both backends.

The one thing still unverified end-to-end is a **successful** LLM completion:
the Gemini call reaches `generativelanguage.googleapis.com` and comes back
`API_KEY_INVALID` with the placeholder key, so everything up to and including
the provider handshake is exercised — but a real generation, and therefore
the writer→critic revision loop, needs a valid key.

## Roadmap / known simplifications

- **Human override** is recorded in the audit trail and broadcast live, but
  doesn't yet interrupt a LangGraph run already in flight — an agent
  mid-`ainvoke()` finishes that call before any injected instruction takes
  effect on the next node. Wiring it into LangGraph's `interrupt`/checkpoint
  support is the natural next step.
- **Single-process WebSocket fan-out** via Redis pub/sub already works
  correctly across multiple backend replicas (that's why it's Redis and not
  an in-memory dict) — this was a deliberate choice, not a limitation.
- **BYOK** (`users.byo_api_key`) has a column but no wired-up code path yet
  to use it instead of the server's key. `app/agents/llm.py` is where it
  would hook in — `get_llm()` is already the single place a chat model gets
  built, but it's cached per-temperature and would need to become
  per-user-key.

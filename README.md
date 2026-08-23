# AgentHub — Agent Orchestration Hub

Give AgentHub a task and watch four AI agents — Researcher, Writer, Critic,
Coder — work it in real time: every thought, handoff, and quality score
streamed to the browser as it happens, logged as a permanent audit trail,
and open to human override mid-run.

Two independently deployable services, no shared code — they talk only over
HTTP and WebSocket:

| Folder | What it is | Docs |
|---|---|---|
| [`agenthub-backend/`](agenthub-backend) | FastAPI · LangGraph orchestrator · Postgres · Redis pub/sub | [README](agenthub-backend/README.md) |
| [`agenthub-frontend/`](agenthub-frontend) | React 18 · Vite · Tailwind · Zustand · React Flow | [README](agenthub-frontend/README.md) |

## Run it locally

Nothing to install beyond Python and Node — the default `.env` runs on
SQLite and an in-process Redis stand-in, so there's no Docker, Postgres, or
Redis to set up. (Both are dev conveniences; Postgres and real Redis remain
the deployment target, and `docker compose up --build` in the backend folder
brings up that full stack instead.)

**Terminal 1 — backend on :8000**

```bash
cd agenthub-backend
python -m venv orchestration-venv && source orchestration-venv/bin/activate   # Windows: orchestration-venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

**Terminal 2 — frontend on :5173**

```bash
cd agenthub-frontend
npm install
cp .env.example .env
npm run dev
```

Then open http://localhost:5173 and register an account.

### One thing you have to fill in

The agents need an LLM key. Put **one** of these in
`agenthub-backend/.env` and restart the backend:

```
GOOGLE_API_KEY=...     # Gemini - https://aistudio.google.com/apikey
OPENAI_API_KEY=...     # or OpenAI
```

Without it the app still runs — you can register, log in, and create tasks —
but every task fails at the first agent with a clear error in the thought
stream. `LLM_PROVIDER` (`auto` by default) and `LLM_MODEL` let you pin a
specific provider or model; see the
[backend README](agenthub-backend/README.md#choosing-an-llm-provider).

## Roles

**Platform user** creates, runs and evaluates agent tasks, and sees only
their own. **Platform admin** gets the dashboard at `/admin`: sign-ins, tasks
run, success rate, the Critic's score distribution, 14-day activity,
per-agent event counts, an account roster, and the approval queue.

Sign-up asks which access you want. It creates a **pending** account and
grants nothing — nobody can sign in until an admin approves, and the admin
decides what to grant (someone asking for admin can be approved as a plain
user). Google sign-in goes through the same gate.

An account can hold both roles. Sign-in does not offer a choice — an account
with admin access always signs in as admin. Getting to the workspace is a
deliberate "Switch to user" in the navbar, which only accounts holding both
roles ever see. While in that mode the admin console is closed to them, the
same as for any other user.

The first admin is made from the command line — nothing auto-promotes:

```bash
python -m scripts.set_role you@example.com user,admin
```

Admins see counts and scores only. Task descriptions, agent thoughts and
generated results stay private to the account that ran them.

## How it works

```
POST /tasks/  ──► task row (status: running), returned immediately
                     │
                     └─► background task: LangGraph state machine
                              │
                     researcher ─► writer ─┐         (general/research task)
                     coder ────────────────┤
                                           ▼
                                        critic ──► score + approve/revise
                                           │          │
                                           │          └─► loops back (max 2)
                                           ▼
                                          done
```

Every agent step calls one `emit()` closure that writes a row to
`agent_logs`, publishes to Redis, and appends to a short-lived replay
buffer. The WebSocket endpoint subscribes *before* reading that buffer and
de-duplicates by sequence number — so a client that connects late still gets
the run from event 1, with nothing lost or doubled.

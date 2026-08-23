# CLAUDE.md — agenthub-frontend

Context for Claude Code (or any future session of Claude) working in this
repo. Read this before making changes.

## What this is

React/Vite client for AgentHub. Sister repo `agenthub-backend` (FastAPI) is
the API and WebSocket source — this app has no server-side code of its own,
it's a pure SPA that talks to that backend over HTTP + WebSocket.

## Before touching anything

```bash
npm install
cp .env.example .env   # VITE_API_URL / VITE_WS_URL - defaults assume localhost:8000
npm run dev
```

The backend must be running for anything beyond the landing page to work —
auth, tasks, and the live view all depend on it. `npm run build` alone
(no backend needed) is the fastest way to catch syntax/import errors.

## Architecture

```
pages/          route-level components (one per URL)
components/ui/  hand-rolled primitives (Button, Input, Card, Badge) - no
                component library, everything themed off tailwind.config.js
components/agents/   the live-collaboration UI (flow canvas, thought
                      stream, override panel)
store/          Zustand - authStore (JWT + OAuth), taskStore (tasks + live
                agent state derived from streamed events)
hooks/useAgentStream.js   the WebSocket connection
services/api.js           axios instance, attaches JWT, refreshes on 401
```

Events reach `taskStore.agentEvents` from **two** sources, and always
overlap: `fetchTaskLogs` (REST `/tasks/{id}/logs`, needed for tasks older
than the backend's 1-hour replay buffer) and the WebSocket, whose own replay
buffer also starts at sequence 1. `mergeEvents` de-duplicates and orders by
the backend's per-task `sequence` — don't append to `agentEvents` without
going through it, and don't drop `sequence` from the REST mapping in
`fetchTaskLogs`, or every event renders twice in the thought stream. (It
did, until it was caught in the browser.) `addAgentEvent` bails out early on
a sequence it has already seen rather than merely skipping the append —
re-running the derivations below on a duplicate walks `agentStates`
backwards.

`taskStore.agentStates` (idle/active/done per agent) is *derived* from the
raw event stream in `addAgentEvent` — there's no separate "set agent status"
action. If you add a new agent or a new event type on the backend, check
that derivation logic still makes sense; it currently keys off `event.event`
being `thinking`/`action` (→ active) or `handoff`/`evaluation` (→ done).

## Conventions

- No component library. New UI primitives go in
  `components/ui/primitives.jsx`, styled with the Tailwind tokens in
  `tailwind.config.js` (`base.*`, `ink.*`, `agent.*`, `trust.*`) — don't
  reach for an arbitrary hex value if a token already fits.
- Every agent-related color (nodes, thought-stream icons, badges) pulls from
  the same 4-color `agent.*` map. If you add a 5th agent on the backend, add
  its color to `tailwind.config.js` AND to the `AGENT_COLORS`/`AGENT_META`
  objects in `AgentNode.jsx` / `ThoughtStream.jsx` — Tailwind classes and
  inline SVG/style colors are both used, so both need updating.
- Chart fills use the `chart.*` tokens, not `agent.*`. They're the same hues
  re-stepped into the OKLCH dark-mode lightness band: `agent.*` is tuned for
  thin bright marks on near-black and glares as a large filled area, and its
  lightness spread fails the categorical-palette checks. The `chart.*` values
  were produced and validated with the dataviz palette validator (CVD
  separation dE 16.0 deutan, normal-vision 21.1, in-band lightness) - if you
  change one, re-run that check rather than eyeballing it. Two steps land
  just under 3:1 contrast, which is why every chart mark also carries a
  visible number or label; don't remove those and leave colour alone
  carrying the meaning.
- **Never put a token in `localStorage` or `sessionStorage`.** The access
  token lives in a module variable in `services/api.js`; the refresh token
  is an HttpOnly cookie this code cannot read at all. Persisting either
  re-opens the XSS exposure the backend change closed. Same for the user
  object: a cached user is a cached *role*, so the session is rebuilt from
  the cookie on every load instead (`authStore.bootstrap`).
- Routing waits for `authStore.bootstrapped`. The boot-time refresh is
  async, so rendering routes before it resolves bounces an authenticated
  user to `/login` for a frame.
- The login form has no role selector, and `authStore.login` sends no role.
  The server derives it from the account. Adding a picker back would let an
  admin start a downgraded session at the door, which was a real bug.
  `ROLE_OPTIONS` in `constants/roles.js` is for the sign-up *request* only.
- `ProtectedRoute` and `AdminRoute` branch on the **active session role**,
  not on what the account holds - matching the server, where `require_admin`
  wants an active admin session. An admin signed in as a user is a user.
- `AdminRoute` is navigation UX, not a security boundary. It hides a page;
  the `/admin/*` endpoints re-check the role against the database on every
  request. Never move a check *out* of the backend because the route guard
  already covers it.
- `App.jsx` is a `min-h-screen` flex column: Navbar, then `<main class="flex
  flex-1 flex-col">`, then Footer. That is what keeps the footer at the
  bottom of short pages without floating over long ones. Pages must size
  themselves with `flex-1`, **not** `min-h-[calc(100vh-57px)]` - that math
  only subtracted the navbar and started overflowing the moment a footer
  existed. Add another piece of global chrome and the flex version keeps
  working while the arithmetic version silently breaks again.
- A page root rendered inside `<main>` needs **`w-full`** alongside
  `mx-auto max-w-*`. `main` is a flex column, and auto left/right margins on
  a flex item suppress the default `align-items: stretch` - so `mx-auto
  max-w-6xl` alone collapses the page to fit-content (measured: 76px instead
  of 1152px), which squashes headers until buttons overlap their own text.
  This is exactly what happened when the footer was added. Nested `mx-auto`
  elements inside a card are fine; only the direct child of `main` is a flex
  item.
- The result preview's "is it truncated" check uses a **MutationObserver**,
  not only a ResizeObserver. `Markdown` is lazily imported, so the first
  measurement runs against a Suspense placeholder and always says "not
  truncated"; something has to re-measure once the real content lands.
  ResizeObserver alone does not cover it - the clipping box is height-capped,
  so it stops resizing at exactly the moment content grows past it, and RO
  callbacks are delivered on animation frames, which a backgrounded tab does
  not produce. Mutation callbacks are microtasks and fire regardless. Remove
  the MutationObserver and the "Show more" pill silently stops appearing.
- Agent results are markdown - render them through `components/ui/Markdown.jsx`,
  never as plain text. Raw output shows `### Heading` and ```` ```python ````
  as literal characters. Two things there are deliberate: raw HTML is NOT
  enabled (no `rehype-raw`), because this text comes from a language model and
  rendering its tags would make model output an injection vector; and `code`
  is styled as inline with the `pre` wrapper resetting it, because
  react-markdown v9 dropped the `inline` prop and sniffing for a `language-*`
  class mis-styles fences opened without a language. Math goes through KaTeX,
  and `escapeCurrency` runs first: remark-math reads any `$...$` pair as a
  formula, so "costs $5 and the upgrade is $10" rendered "5 and the upgrade
  is" as italic maths variables until dollars followed by a digit were
  escaped. Import it via `LazyMarkdown` - loading KaTeX eagerly put ~400KB on
  every page including the sign-in form.
- On the task page the result card is aligned to the thought stream with
  `lg:h-0 lg:min-h-full` on the right column, not by a fixed height. Telling
  a card to "fill the remaining space" in a column that is itself sized by
  its content is circular - the card grows, the column grows with it, and
  nothing is constrained (it reached 2181px that way). Contributing zero
  height and stretching to the grid row makes the row depend only on the left
  column. It is gated on `truncated` so a short result cannot spill past a
  height it never asked for, and on `lg:` so the stacked mobile layout keeps
  the plain `max-h-[420px]` clamp.
- The footer's version string comes from `package.json` via the
  `__APP_VERSION__` define in `vite.config.js`. Bump the version there only -
  hardcoding it in the component gives you two places to change and one that
  goes stale. `constants/app.js` holds the developer profile links.
- Tailwind's default spacing scale skips from `4` to `5` (no `4.5`) — this
  bit the build once already (a class that silently generated nothing, so
  an icon fell back to its unstyled default size). If a class doesn't seem
  to apply, check it's actually in the default scale before assuming
  something else is wrong.
- `tailwind.config.js` is loaded as a JS module by the build - a bare
  hyphenated key (`pulse-ring:`) parses as subtraction, not a string key.
  Always quote keyframe/variant names with hyphens (`'pulse-ring':`). This
  broke the build once with a confusing error attributed to `index.css`
  rather than the actual config file - if a CSS build error looks like it's
  pointing at the wrong file, check `tailwind.config.js` for a syntax issue
  before trusting the reported filename.

## Known simplification (see backend CLAUDE.md for the full picture)

The backend accepts an optional client-supplied `id` in `POST /tasks/`
specifically so this app *could* generate the task's UUID, open its
WebSocket subscription, and only then create the task — closing the
"task created before socket connects" race at the root. This app doesn't
do that yet; it relies entirely on the backend's replay buffer (which is
fully sufficient - tested with a live client connecting a full second late
with zero data loss) rather than avoiding the race in the first place. If
you wire this up: generate the id in `taskStore.createTask`, pass it through
`NewTaskModal`, and navigate to `/task/{id}` *before* the POST resolves
rather than after.

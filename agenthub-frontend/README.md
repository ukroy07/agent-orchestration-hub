# AgentHub — Frontend

React client for AgentHub. Watches the backend's 4 agents collaborate live
over WebSocket, rendered as an animated node graph plus a scrolling thought
stream, with a human-override panel and Google/password auth.

## Stack

React 18 · Vite · Tailwind CSS · Zustand · React Router · React Flow
(`@xyflow/react`) · react-use-websocket

No component library (shadcn, MUI, etc.) — every UI primitive in
`src/components/ui/primitives.jsx` is hand-rolled on the design tokens in
`tailwind.config.js`, so there's nothing to configure or theme-fight.

## Setup

```bash
npm install
cp .env.example .env      # point VITE_API_URL / VITE_WS_URL at your backend
npm run dev                # http://localhost:5173
```

Needs the backend running (see `../agenthub-backend/README.md`) — this app
makes no sense standalone, it's a client for that API.

## Build

```bash
npm run build      # outputs to dist/
npm run preview    # serve the production build locally
```

## Design system

Dark "mission-control" palette — each agent gets its own signal color
instead of one generic accent (`agent.researcher` cyan, `agent.writer`
amber, `agent.critic` coral, `agent.coder` violet), defined once in
`tailwind.config.js` under `theme.colors`. Space Grotesk for display type,
Inter for body, JetBrains Mono for scores/timestamps/logs — loaded in
`index.html`. Change the palette there, not per-component.

## Where things live

| Concern | File |
|---|---|
| JWT storage + refresh, OAuth exchange | `src/store/authStore.js` |
| Task CRUD + live agent state derived from events | `src/store/taskStore.js` |
| WebSocket connection | `src/hooks/useAgentStream.js` |
| The node-graph visualization | `src/components/agents/AgentFlowCanvas.jsx` |
| Axios instance + auto-refresh-on-401 | `src/services/api.js` |

## Auth flow notes

- Password auth stores `access_token` / `refresh_token` / `user` in
  `localStorage`. `src/services/api.js`'s response interceptor catches a 401,
  refreshes once (de-duplicated if several requests 401 at the same moment),
  and retries — falls back to `/login` if the refresh itself fails.
- Google OAuth: `authStore.startGoogleLogin()` does a full-page redirect to
  the backend (`/auth/google/login`), which redirects to Google, which
  redirects back to the backend, which redirects to
  `/oauth/callback?code=...` on *this* app. `OAuthCallback.jsx` exchanges
  that one-time code for real tokens via `POST /auth/oauth/exchange`. Never
  wire the code itself into `authStore` as if it were a token — it isn't one.

## Known simplification

There's an inherent gap between "task created" (REST responds) and "socket
subscribed" (a new page has to mount first). The backend closes this with a
short-lived replay buffer, so no events are lost — but a *tighter* fix would
have this app generate the task's UUID client-side and open the WebSocket
before firing the create request, closing the gap at the root instead of
recovering after it. Backend already accepts an optional client-supplied
`id` in `POST /tasks/` for exactly this; the frontend doesn't take advantage
of it yet.

import { create } from 'zustand'
import api from '../services/api'

const IDLE_AGENTS = { researcher: 'idle', writer: 'idle', critic: 'idle', coder: 'idle' }

// Every event reaches this store twice over. `fetchTaskLogs` pulls the full
// history over REST (needed for a task older than the backend's 1-hour
// replay buffer), and the WebSocket's own replay buffer also starts at
// sequence 1 - so opening a task shows each opening event once from each
// source. The backend stamps a per-task `sequence` on every event precisely
// so this is de-duplicable; connection_manager.py drops repeats the same way
// server-side. Sort by it too: the REST fetch and the socket race, and
// whichever lands second must not append its copy after the other's tail.
const mergeEvents = (existing, incoming) => {
  const seen = new Map()
  for (const event of [...existing, ...incoming]) {
    if (event.sequence == null) continue // shouldn't happen; keep it out of the map rather than collide on undefined
    if (!seen.has(event.sequence)) seen.set(event.sequence, event)
  }
  const unsequenced = [...existing, ...incoming].filter((e) => e.sequence == null)
  return [...seen.values()].sort((a, b) => a.sequence - b.sequence).concat(unsequenced)
}

const AGENTS = ['researcher', 'writer', 'critic', 'coder']

// The same event arrives in two shapes. Over the WebSocket a workflow-level
// event is `{type: 'workflow_started'}`, while the REST log row for it comes
// back as `{type: 'agent_event', event: 'workflow_started'}` - the backend
// stores `event.event || event.type` in one `event_type` column. So read the
// kind from `event` first and fall back to `type`, or replayed history
// silently derives nothing.
const kindOf = (event) => event.event || event.type

// agentStates/latestScore/isWorkflowRunning are a *fold over the whole event
// list*, not an incremental update applied as each event lands. They have to
// be: `fetchTaskLogs` writes REST history straight into agentEvents without
// going through addAgentEvent, so anything incremental would skip every event
// that reached us over REST first - which is most of them on a task you just
// opened. That regression looked like agent nodes stuck on "standing by"
// while the thought stream was visibly moving.
const deriveFromEvents = (events, prev) => {
  const agentStates = { ...IDLE_AGENTS }
  let latestScore = null
  let isWorkflowRunning = false
  let currentTask = prev.currentTask

  for (const event of events) {
    const kind = kindOf(event)

    if (AGENTS.includes(event.agent)) {
      if (kind === 'thinking' || kind === 'action') agentStates[event.agent] = 'active'
      else if (kind === 'handoff' || kind === 'evaluation') agentStates[event.agent] = 'done'
    }

    if (kind === 'evaluation' && event.metadata?.score != null) latestScore = event.metadata.score

    if (kind === 'workflow_started') isWorkflowRunning = true

    if (kind === 'workflow_complete' || kind === 'workflow_error') {
      isWorkflowRunning = false
      const status = kind === 'workflow_complete' ? 'completed' : 'failed'
      if (currentTask) {
        currentTask = {
          ...currentTask,
          status,
          // Only the live socket frame carries result/score; the replayed log
          // row doesn't, and must not blank out what GET /tasks/{id} loaded.
          ...(event.result != null ? { result: event.result } : {}),
          ...(event.score ?? latestScore) != null ? { quality_score: event.score ?? latestScore } : {},
        }
      }
    }
  }

  const tasks = currentTask
    ? prev.tasks.map((t) => (t.id === currentTask.id ? { ...t, status: currentTask.status } : t))
    : prev.tasks

  return { agentStates, latestScore, isWorkflowRunning, currentTask, tasks }
}

export const useTaskStore = create((set, get) => ({
  tasks: [],
  currentTask: null,
  agentEvents: [],
  agentStates: { ...IDLE_AGENTS },
  latestScore: null,
  isWorkflowRunning: false,

  fetchTasks: async () => {
    const { data } = await api.get('/tasks/')
    set({ tasks: data })
    return data
  },

  fetchTask: async (taskId) => {
    const { data } = await api.get(`/tasks/${taskId}`)
    set({ currentTask: data })
    return data
  },

  fetchTaskLogs: async (taskId) => {
    // Replays history for a task you're re-opening rather than one you just
    // created, so the thought stream isn't empty on refresh.
    const { data } = await api.get(`/tasks/${taskId}/logs`)
    const replayed = data.map((log) => ({
      id: log.id,
      type: 'agent_event',
      agent: log.agent_name,
      event: log.event_type,
      content: log.content,
      metadata: log.event_metadata,
      timestamp: log.created_at,
      sequence: log.sequence,
    }))
    // Merge rather than replace - the socket may already have delivered some
    // of these, and on a fast-failing task it usually has - then re-derive,
    // since these events never pass through addAgentEvent.
    set((s) => {
      const agentEvents = mergeEvents(s.agentEvents, replayed)
      return { agentEvents, ...deriveFromEvents(agentEvents, s) }
    })
    return replayed
  },

  createTask: async (title, description, taskType = 'general') => {
    const { data } = await api.post('/tasks/', { title, description, task_type: taskType })
    set((s) => ({ tasks: [data, ...s.tasks] }))
    return data
  },

  deleteTask: async (taskId) => {
    await api.delete(`/tasks/${taskId}`)
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== taskId) }))
  },

  setCurrentTask: (task) => set({
    currentTask: task, agentEvents: [], agentStates: { ...IDLE_AGENTS }, latestScore: null, isWorkflowRunning: task?.status === 'running',
  }),

  addAgentEvent: (event) => {
    set((s) => {
      const agentEvents = mergeEvents(s.agentEvents, [{ ...event, id: `${Date.now()}-${Math.random()}` }])
      // Same length means it was a duplicate sequence we already hold, so
      // nothing changed - return the identical object so subscribers don't
      // re-render.
      if (agentEvents.length === s.agentEvents.length) return s
      return { agentEvents, ...deriveFromEvents(agentEvents, s) }
    })
  },
}))

import { useCallback } from 'react'
import useWebSocket, { ReadyState } from 'react-use-websocket'
import { useTaskStore } from '../store/taskStore'
import { getAccessToken } from '../services/api'

const WS_BASE = (import.meta.env.VITE_WS_URL || 'ws://localhost:8000')

export function useAgentStream(taskId) {
  const addAgentEvent = useTaskStore((s) => s.addAgentEvent)
  // Read from the in-memory holder, not localStorage - the token is not
  // stored there any more (see services/api.js).
  const accessToken = getAccessToken()

  const socketUrl = taskId && accessToken ? `${WS_BASE}/ws/${taskId}?token=${accessToken}` : null

  const { sendMessage, readyState } = useWebSocket(socketUrl, {
    onMessage: (event) => {
      try {
        addAgentEvent(JSON.parse(event.data))
      } catch {
        // ignore malformed frames rather than crashing the stream
      }
    },
    shouldReconnect: () => true,
    reconnectAttempts: 8,
    reconnectInterval: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  })

  const sendOverride = useCallback(
    (instruction, targetAgent) => {
      sendMessage(JSON.stringify({ type: 'override', instruction, target_agent: targetAgent || null }))
    },
    [sendMessage]
  )

  return { sendOverride, isConnected: readyState === ReadyState.OPEN, readyState }
}

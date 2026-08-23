import React, { useEffect, useRef } from 'react'
import { Search, PenLine, ShieldCheck, Code2, User, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useTaskStore } from '../../store/taskStore'

const AGENT_META = {
  researcher: { color: '#4FD1E8', icon: Search, label: 'Researcher' },
  writer: { color: '#F0B84D', icon: PenLine, label: 'Writer' },
  critic: { color: '#F0654D', icon: ShieldCheck, label: 'Critic' },
  coder: { color: '#9D7BF5', icon: Code2, label: 'Coder' },
  human: { color: '#4ADE9E', icon: User, label: 'You' },
  system: { color: '#8891A6', icon: AlertTriangle, label: 'System' },
}

function EventRow({ event }) {
  if (event.type === 'workflow_complete') {
    return (
      <div className="flex items-start gap-2.5 rounded-md border border-trust/25 bg-trust/5 px-3 py-2">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-trust" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-trust">Task complete</p>
          {event.score != null && <p className="mt-0.5 font-mono text-xs text-ink-400">Final quality score: {event.score}/100</p>}
        </div>
      </div>
    )
  }
  if (event.type === 'workflow_error') {
    return (
      <div className="flex items-start gap-2.5 rounded-md border border-agent-critic/25 bg-agent-critic/5 px-3 py-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-agent-critic" aria-hidden="true" />
        <p className="text-sm text-agent-critic">{event.content}</p>
      </div>
    )
  }
  if (event.type === 'workflow_started') {
    return <p className="px-1 font-mono text-xs text-ink-600">{event.content}</p>
  }

  const meta = AGENT_META[event.agent] || AGENT_META.system
  const Icon = meta.icon
  const score = event.metadata?.score

  return (
    <div className="flex items-start gap-2.5">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ background: `${meta.color}1F` }}>
        <Icon className="h-3.5 w-3.5" style={{ color: meta.color }} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: meta.color }}>{meta.label}</span>
          {event.timestamp && <span className="font-mono text-[11px] text-ink-600">{new Date(event.timestamp).toLocaleTimeString()}</span>}
          {score != null && (
            <span className="font-mono text-[11px] text-ink-400">score {score}/100</span>
          )}
        </div>
        <p className="mt-0.5 text-sm leading-relaxed text-ink-300">{event.content}</p>
        {event.to && event.to !== 'complete' && (
          <p className="mt-0.5 font-mono text-[11px] text-ink-600">→ passing to {event.to}</p>
        )}
      </div>
    </div>
  )
}

export default function ThoughtStream() {
  const agentEvents = useTaskStore((s) => s.agentEvents)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [agentEvents.length])

  if (agentEvents.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-ink-600">Submit a task to watch the agents work in real time.</p>
  }

  return (
    <div className="flex max-h-[420px] flex-col gap-3 overflow-y-auto p-4">
      {agentEvents.map((event) => (
        <EventRow key={event.id} event={event} />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}

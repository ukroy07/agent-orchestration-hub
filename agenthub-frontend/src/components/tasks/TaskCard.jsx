import React from 'react'
import { Link } from 'react-router-dom'
import { Trash2, ArrowUpRight } from 'lucide-react'
import { Card, Badge } from '../ui/primitives'

const STATUS_TONE = { pending: 'neutral', running: 'running', completed: 'success', failed: 'danger' }

export default function TaskCard({ task, onDelete }) {
  return (
    <Card className="group flex flex-col gap-3 p-4 transition-colors hover:border-base-600">
      <div className="flex items-start justify-between gap-2">
        <Link to={`/task/${task.id}`} className="min-w-0 flex-1">
          <h3 className="truncate font-display text-sm font-semibold text-ink-100 group-hover:text-agent-researcher transition-colors">
            {task.title}
          </h3>
        </Link>
        <button
          onClick={(e) => { e.preventDefault(); onDelete(task.id) }}
          className="shrink-0 rounded-md p-1 text-ink-600 hover:bg-agent-critic/10 hover:text-agent-critic transition-colors"
          aria-label={`Delete task ${task.title}`}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <p className="line-clamp-2 text-sm text-ink-400">{task.description}</p>

      <div className="mt-auto flex items-center justify-between pt-1">
        <Badge tone={STATUS_TONE[task.status] || 'neutral'}>{task.status}</Badge>
        {task.quality_score != null && (
          <span className="font-mono text-xs text-ink-400">{task.quality_score}/100</span>
        )}
      </div>

      <Link
        to={`/task/${task.id}`}
        className="flex items-center justify-center gap-1 rounded-md border border-base-700 py-2 text-xs font-medium text-ink-300 hover:border-agent-researcher hover:text-agent-researcher transition-colors"
      >
        Open <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
      </Link>
    </Card>
  )
}

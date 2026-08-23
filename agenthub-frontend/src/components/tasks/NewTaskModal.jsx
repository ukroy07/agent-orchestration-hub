import React, { useMemo, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { Button, Input, Notice } from '../ui/primitives'

const TASK_TYPES = [
  { value: 'general', label: 'General', hint: 'Researcher → Writer → Critic' },
  { value: 'code_review', label: 'Code', hint: 'Coder → Critic' },
]

export default function NewTaskModal({ open, onClose, onCreate, existingTitles = [] }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [taskType, setTaskType] = useState('general')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  // A duplicate title is a warning, not a failure - the user did nothing
  // wrong and the task they wanted already exists. Shown in amber rather
  // than the red used for "something broke".
  const [duplicate, setDuplicate] = useState('')

  // Checked as they type, against the task list the dashboard already
  // loaded - so the clash is called out before they fill in a description
  // and press the button, instead of after a round trip. Normalised the same
  // way the server does (trimmed, case-insensitive), or the two would
  // disagree and the inline hint would look wrong.
  const taken = useMemo(
    () => new Set(existingTitles.map((t) => (t || '').trim().toLowerCase())),
    [existingTitles],
  )
  const trimmedTitle = title.trim()
  const isDuplicate = trimmedTitle.length > 0 && taken.has(trimmedTitle.toLowerCase())

  if (!open) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim() || !description.trim()) return
    if (isDuplicate) return
    setSubmitting(true)
    setError('')
    setDuplicate('')
    try {
      const task = await onCreate(title.trim(), description.trim(), taskType)
      setTitle('')
      setDescription('')
      onClose(task)
    } catch (err) {
      const detail = err.response?.data?.detail
      if (err.response?.status === 409) {
        setDuplicate(detail || 'A task with that title already exists.')
      } else {
        setError(detail || 'Could not create task. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="new-task-title">
      <div className="w-full max-w-lg rounded-lg border border-base-700 bg-base-900 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="new-task-title" className="font-display text-lg font-semibold text-ink-100">New task</h2>
          <button onClick={() => onClose(null)} className="rounded-md p-1 text-ink-600 hover:bg-base-800 hover:text-ink-100" aria-label="Close">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Input
              id="task-title"
              label="Title"
              value={title}
              onChange={(e) => { setTitle(e.target.value); if (duplicate) setDuplicate('') }}
              placeholder="Competitive landscape brief"
              aria-invalid={isDuplicate}
              aria-describedby={isDuplicate ? 'task-title-duplicate' : undefined}
              className={isDuplicate ? '!border-trust-warn' : ''}
              required
            />
            {isDuplicate && (
              <p id="task-title-duplicate" role="alert" className="flex items-center gap-1.5 text-xs text-trust-warn">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>&ldquo;{trimmedTitle}&rdquo; already exists. Pick a different title.</span>
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="task-description" className="text-sm text-ink-400">What should the agents do?</label>
            <textarea
              id="task-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Research the top 3 competitors in X space and summarize their pricing strategy..."
              rows={4}
              required
              className="resize-none rounded-md border border-base-600 bg-base-900 px-3 py-2.5 text-sm text-ink-100 placeholder:text-ink-600 outline-none focus:border-agent-researcher"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-ink-400">Task type</span>
            <div className="grid grid-cols-2 gap-2">
              {TASK_TYPES.map((t) => (
                <button
                  type="button"
                  key={t.value}
                  onClick={() => setTaskType(t.value)}
                  className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                    taskType === t.value ? 'border-agent-researcher bg-agent-researcher/10 text-ink-100' : 'border-base-600 text-ink-400 hover:border-base-600/80'
                  }`}
                >
                  <div className="font-medium">{t.label}</div>
                  <div className="font-mono text-[11px] text-ink-600">{t.hint}</div>
                </button>
              ))}
            </div>
          </div>

          {duplicate && <Notice tone="warn">{duplicate}</Notice>}
          {error && <p className="text-sm text-agent-critic">{error}</p>}

          <Button type="submit" disabled={submitting || isDuplicate} className="mt-1">
            {submitting ? 'Dispatching agents…' : 'Start task'}
          </Button>
        </form>
      </div>
    </div>
  )
}

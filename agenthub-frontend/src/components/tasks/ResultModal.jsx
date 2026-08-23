import React, { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, Copy, X } from 'lucide-react'
import Markdown from '../ui/LazyMarkdown'

/**
 * Full task result plus the metrics for that response.
 *
 * The result panel on the task page is deliberately clamped - an agent can
 * return several screens of text, and letting the card grow to fit stretched
 * the whole column and buried everything below it. This is where the full
 * text lives instead.
 */

function Metric({ label, value, accent = 'text-ink-100' }) {
  return (
    <div className="rounded-md border border-base-700 bg-base-950 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-ink-600">{label}</div>
      <div className={`mt-0.5 font-mono text-sm tabular-nums ${accent}`}>{value}</div>
    </div>
  )
}

function duration(task) {
  if (!task?.created_at || !task?.updated_at) return '—'
  const ms = new Date(task.updated_at) - new Date(task.created_at)
  if (!Number.isFinite(ms) || ms < 0) return '—'
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

/**
 * Copy that also works off localhost.
 *
 * `navigator.clipboard` is only defined in a secure context, and this dev
 * server binds with `host: true` - so opening the app at the LAN address
 * (http://192.168.x.x:5173) leaves the API undefined and a bare
 * `navigator.clipboard.writeText(...)` throws. The textarea fallback is
 * deprecated but is what still works there.
 */
async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through - permission denied or insecure context
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch { ok = false }
  ta.remove()
  return ok
}

export default function ResultModal({ open, onClose, task, eventCount }) {
  const closeRef = useRef(null)
  const bodyRef = useRef(null)
  // 'idle' | 'copied' | 'failed'. A tri-state rather than a boolean because
  // a clipboard write can genuinely be refused - no user activation, a
  // permissions policy, an insecure origin - and a button that silently does
  // nothing on click reads as broken. Say so instead.
  const [copyState, setCopyState] = useState('idle')

  // Escape to close, and stop the page behind from scrolling while the
  // dialog is up - without the lock, scrolling inside the result bleeds
  // through to the task page once it hits the end.
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  // Reset the confirmation when the dialog closes, or reopening it shows a
  // stale "Copied" from last time.
  useEffect(() => { if (!open) setCopyState('idle') }, [open])

  useEffect(() => {
    if (copyState === 'idle') return undefined
    const t = setTimeout(() => setCopyState('idle'), 1800)
    return () => clearTimeout(t)
  }, [copyState])

  if (!open || !task) return null

  const result = task.result || ''
  const words = result.trim() ? result.trim().split(/\s+/).length : 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="result-modal-title"
      // Backdrop click closes, but only when the backdrop itself was clicked -
      // without the target check, a drag that starts on the text and ends
      // outside it closes the dialog mid-selection.
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-base-700 bg-base-900">
        <div className="flex items-start justify-between gap-4 border-b border-base-700 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 id="result-modal-title" className="font-display text-base font-semibold text-ink-100">
              Result
            </h2>
            <p className="mt-0.5 truncate text-xs text-ink-400">{task.title}</p>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            className="shrink-0 rounded-md p-1 text-ink-600 transition-colors hover:bg-base-800 hover:text-ink-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 border-b border-base-700 px-4 py-3 sm:grid-cols-3 sm:px-5 lg:grid-cols-6">
          <Metric
            label="Score"
            value={task.quality_score != null ? `${task.quality_score}/100` : '—'}
            accent="text-trust"
          />
          <Metric label="Revisions" value={task.revision_count ?? 0} />
          <Metric label="Status" value={task.status} />
          <Metric label="Type" value={task.task_type} />
          <Metric label="Duration" value={duration(task)} />
          <Metric label="Events" value={eventCount ?? '—'} />
        </div>

        {/* The only scrolling region: the header and metrics stay pinned so a
            long result never pushes the score out of view. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <div ref={bodyRef}>
            <Markdown className="text-ink-200">{result}</Markdown>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-base-700 px-4 py-2 sm:px-5">
          <span className="font-mono text-[11px] text-ink-600">
            {words.toLocaleString()} words · {result.length.toLocaleString()} characters
          </span>
          {/* Deliberately the only accent-coloured control down here - the
              counts beside it are muted, so the one thing worth clicking is
              the one thing that carries colour. Turns green on success
              rather than firing a toast: the confirmation belongs where the
              click happened. */}
          <button
            onClick={async () => {
              if (await copyText(result)) {
                setCopyState('copied')
                return
              }
              // Telling someone to press Ctrl+C is useless unless something
              // is selected - so select the result for them, and the
              // suggestion becomes a real instruction.
              setCopyState('failed')
              const node = bodyRef.current
              if (node) {
                const range = document.createRange()
                range.selectNodeContents(node)
                const sel = window.getSelection()
                sel.removeAllRanges()
                sel.addRange(range)
              }
            }}
            aria-label="Copy result to clipboard"
            title="Copy result"
            className={`flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              copyState === 'copied'
                ? 'border-trust/40 bg-trust/10 text-trust'
                : copyState === 'failed'
                  ? 'border-agent-critic/40 bg-agent-critic/10 text-agent-critic'
                  : 'border-agent-researcher/40 text-agent-researcher hover:bg-agent-researcher/10'
            }`}
          >
            {copyState === 'copied'
              ? <Check className="h-3.5 w-3.5" aria-hidden="true" />
              : copyState === 'failed'
                ? <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
            <span aria-live="polite">
              {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Press Ctrl+C' : 'Copy'}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}

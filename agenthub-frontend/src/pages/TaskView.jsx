import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, ChevronDown } from 'lucide-react'
import { useTaskStore } from '../store/taskStore'
import { useAgentStream } from '../hooks/useAgentStream'
import AgentFlowCanvas from '../components/agents/AgentFlowCanvas'
import ThoughtStream from '../components/agents/ThoughtStream'
import OverridePanel from '../components/agents/OverridePanel'
import ResultModal from '../components/tasks/ResultModal'
import Markdown from '../components/ui/Markdown'
import { Card, Badge } from '../components/ui/primitives'

const STATUS_TONE = { pending: 'neutral', running: 'running', completed: 'success', failed: 'danger' }

export default function TaskView() {
  const { taskId } = useParams()
  const { currentTask, setCurrentTask, fetchTask, fetchTaskLogs, isWorkflowRunning, agentEvents } = useTaskStore()
  const { sendOverride, isConnected } = useAgentStream(taskId)
  const [resultOpen, setResultOpen] = useState(false)
  const previewRef = useRef(null)
  const [truncated, setTruncated] = useState(false)

  // Only offer "view more" when there is actually more to see - a two-line
  // result with a fade and a button under it looks broken. Measured after
  // layout rather than guessed from string length, since wrapping depends on
  // the column width.
  useLayoutEffect(() => {
    const el = previewRef.current
    if (!el) { setTruncated(false); return undefined }
    const check = () => setTruncated(el.scrollHeight > el.clientHeight + 1)
    check()
    // Re-check on resize: a result that fits on a wide screen can overflow
    // once the column narrows.
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [currentTask?.result])

  useEffect(() => {
    let cancelled = false
    setCurrentTask(null)
    fetchTask(taskId).then((task) => {
      if (cancelled) return
      setCurrentTask(task)
      // Replay history so re-opening a task doesn't show an empty stream -
      // live events from the socket append naturally after this.
      if (task.status !== 'pending') fetchTaskLogs(taskId)
    })
    return () => { cancelled = true }
  }, [taskId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="w-full mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Link to="/dashboard" className="mb-4 flex items-center gap-1.5 text-sm text-ink-400 hover:text-ink-100 transition-colors w-fit">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> All tasks
      </Link>

      <div className="mb-6">
        <h1 className="font-display text-xl font-semibold text-ink-100 sm:text-2xl">{currentTask?.title || 'Loading…'}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-400">{currentTask?.description}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone={STATUS_TONE[currentTask?.status] || 'neutral'}>
            {isWorkflowRunning ? 'agents working' : currentTask?.status || 'pending'}
          </Badge>
          {!isConnected && <span className="font-mono text-xs text-ink-600">reconnecting…</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-5 min-w-0">
          <Card className="overflow-hidden">
            <div className="border-b border-base-700 px-4 py-2.5">
              <h2 className="font-display text-sm font-semibold text-ink-100">Collaboration graph</h2>
            </div>
            <AgentFlowCanvas />
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-base-700 px-4 py-2.5">
              <h2 className="font-display text-sm font-semibold text-ink-100">Live thoughts</h2>
            </div>
            <ThoughtStream />
          </Card>
        </div>

        {/* `h-0` + `min-h-full` is what makes the alignment work. Left to
            itself the column is sized BY its content, so telling the card to
            "fill the remaining space" is circular - it grows, the column
            grows with it, and nothing is ever constrained (the card hit
            2181px that way). Contributing zero height and then stretching to
            the row instead means the row is sized purely by the left column,
            and the card has a real height to fill. Only applied when the
            result is clamped, so a short column can never have content spill
            past a height it did not ask for. */}
        <div className={`flex flex-col gap-5 ${truncated ? 'lg:h-0 lg:min-h-full' : ''}`}>
          <OverridePanel onOverride={sendOverride} isConnected={isConnected} />

          {/* The result card stretches to the bottom of the column - and so
              ends level with the thought stream, since both columns are grid
              items of the same row. Only when the result is long enough to be
              clamped: stretching a three-line result to full height would
              just be a card full of empty space. */}
          {currentTask?.result && (
            <Card className={`flex flex-col p-4 ${truncated ? 'lg:min-h-0 lg:flex-1' : ''}`}>
              <div className="mb-2 flex shrink-0 items-center justify-between">
                <h3 className="font-display text-sm font-semibold text-ink-100">Result</h3>
                {currentTask.quality_score != null && (
                  <span className="font-mono text-xs text-trust">{currentTask.quality_score}/100</span>
                )}
              </div>

              {/* Fills whatever height the column has left, so the card ends
                  exactly level with the thought stream rather than at some
                  fixed guess. The 420px cap is the stacked/mobile fallback,
                  where there is no column height to fill. Overflow is hidden
                  rather than scrollable on purpose: a second scroll region
                  inside the page is easy to trap a wheel gesture in - the
                  full text goes in the modal. */}
              <div
                ref={previewRef}
                className={`relative overflow-hidden max-h-[420px] ${
                  truncated ? 'lg:max-h-none lg:min-h-0 lg:flex-1' : ''
                }`}
              >
                <Markdown>{currentTask.result}</Markdown>

                {/* The affordance sits *on* the fade rather than in a
                    full-width bar below it: the text visibly runs out under a
                    small pill, which reads as "there is more" far better than
                    a large button competing with the content for attention.
                    The fade is pointer-events-none so it never eats the
                    click. */}
                {truncated && (
                  <>
                    <div
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-base-900 via-base-900/85 to-transparent"
                      aria-hidden="true"
                    />
                    <div className="absolute inset-x-0 bottom-0 flex justify-center pb-2">
                      <button
                        onClick={() => setResultOpen(true)}
                        className="group flex items-center gap-1.5 rounded-full border border-base-600 bg-base-800/90 px-3 py-1.5 text-xs font-medium text-ink-300 shadow-lg backdrop-blur-sm transition-colors hover:border-agent-researcher/50 hover:text-agent-researcher"
                      >
                        Show more
                        <ChevronDown className="h-3.5 w-3.5 transition-transform group-hover:translate-y-0.5" aria-hidden="true" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>

      <ResultModal
        open={resultOpen}
        onClose={() => setResultOpen(false)}
        task={currentTask}
        eventCount={agentEvents?.length}
      />
    </div>
  )
}

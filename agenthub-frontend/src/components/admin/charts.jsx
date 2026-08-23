import React, { useState } from 'react'
import { Card } from '../ui/primitives'

/**
 * Hand-rolled SVG charts, matching this project's "no component library"
 * convention. Colours come from the `chart.*` tokens in tailwind.config.js -
 * the agent hues re-stepped into the dark-mode lightness band and validated
 * as a categorical palette. Two of those steps sit just under 3:1 contrast
 * against the surface, which is why every mark here also carries a visible
 * number or a legend entry: identity and value are never colour-alone.
 */

const FILL = {
  researcher: '#0B9EB3',
  writer: '#BC8804',
  critic: '#B12812',
  coder: '#6943B8',
  human: '#00AA71',
  system: '#323A4D',
}
const GRID = '#252B3A'
const COMPLETED = '#00AA71'
const FAILED = '#B12812'
const INFLIGHT = '#323A4D'

export function StatTile({ label, value, sub, accent = 'text-ink-100' }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wide text-ink-400">{label}</div>
      <div className={`mt-1.5 font-display text-3xl font-semibold tabular-nums ${accent}`}>
        {value}
      </div>
      {sub && <div className="mt-1 font-mono text-xs text-ink-600">{sub}</div>}
    </Card>
  )
}

function Tooltip({ x, children }) {
  return (
    <div
      className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-base-600 bg-base-800 px-2.5 py-1.5 text-xs text-ink-100 shadow-lg"
      style={{ left: `${x}%` }}
    >
      {children}
    </div>
  )
}

function LegendSwatch({ color, label }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-ink-400">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} aria-hidden="true" />
      {label}
    </span>
  )
}

/** 14-day task activity, stacked by outcome. */
export function DailyActivityChart({ daily }) {
  const [hover, setHover] = useState(null)
  const W = 560
  const H = 150
  const max = Math.max(1, ...daily.map((d) => d.created))
  const slot = W / daily.length
  const barW = Math.min(26, slot - 6)     // leaves a surface gap between bars
  const scale = (n) => (n / max) * H

  return (
    <Card className="p-4">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-sm font-semibold text-ink-100">Tasks per day</h3>
        <div className="flex items-center gap-3">
          <LegendSwatch color={COMPLETED} label="completed" />
          <LegendSwatch color={FAILED} label="failed" />
          <LegendSwatch color={INFLIGHT} label="in flight" />
        </div>
      </div>
      <p className="mb-3 text-xs text-ink-600">Last {daily.length} days · peak {max} in a day</p>

      <div className="relative">
        {hover !== null && (
          <Tooltip x={((hover + 0.5) / daily.length) * 100}>
            <span className="font-mono">{daily[hover].date}</span>
            {' · '}{daily[hover].created} created
            {daily[hover].completed > 0 && <> · {daily[hover].completed} done</>}
            {daily[hover].failed > 0 && <> · {daily[hover].failed} failed</>}
          </Tooltip>
        )}
        <svg viewBox={`0 0 ${W} ${H + 22}`} className="w-full" role="img"
             aria-label={`Tasks created per day over the last ${daily.length} days`}>
          <line x1="0" y1={H} x2={W} y2={H} stroke={GRID} strokeWidth="1" />
          <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke={GRID} strokeWidth="1" strokeDasharray="3 4" />

          {daily.map((d, i) => {
            const x = i * slot + (slot - barW) / 2
            const inflight = Math.max(0, d.created - d.completed - d.failed)
            let y = H
            const segments = [
              { key: 'completed', n: d.completed, fill: COMPLETED },
              { key: 'failed', n: d.failed, fill: FAILED },
              { key: 'inflight', n: inflight, fill: INFLIGHT },
            ].filter((s) => s.n > 0)

            return (
              <g key={d.date}
                 onMouseEnter={() => setHover(i)}
                 onMouseLeave={() => setHover(null)}>
                {/* Hit target spans the full slot height so thin bars (and
                    empty days) are still hoverable. */}
                <rect x={i * slot} y="0" width={slot} height={H} fill="transparent" />
                {segments.map((s, si) => {
                  const h = Math.max(2, scale(s.n) - (si > 0 ? 2 : 0))
                  y -= h + (si > 0 ? 2 : 0)
                  return (
                    <rect key={s.key} x={x} y={y} width={barW} height={h}
                          rx={si === segments.length - 1 ? 4 : 0}
                          fill={s.fill}
                          opacity={hover === null || hover === i ? 1 : 0.45} />
                  )
                })}
              </g>
            )
          })}

          {daily.map((d, i) =>
            i % 3 === 0 ? (
              <text key={d.date} x={i * slot + slot / 2} y={H + 16}
                    textAnchor="middle" fontSize="10" fill="#5B6479" fontFamily="monospace">
                {d.date.slice(5)}
              </text>
            ) : null
          )}
        </svg>
      </div>
    </Card>
  )
}

/** Quality-score histogram. One series, so no legend - the title names it. */
export function ScoreDistribution({ distribution, avg, median }) {
  const max = Math.max(1, ...distribution.map((b) => b.count))
  return (
    <Card className="p-4">
      <h3 className="font-display text-sm font-semibold text-ink-100">Evaluation scores</h3>
      <p className="mb-4 text-xs text-ink-600">
        Critic score per completed task{avg != null && <> · average {avg} · median {median}</>}
      </p>
      <div className="flex flex-col gap-2.5">
        {distribution.map((b) => (
          <div key={b.bucket} className="flex items-center gap-3">
            <span className="w-14 shrink-0 text-right font-mono text-xs text-ink-400">{b.bucket}</span>
            <div className="h-5 flex-1 rounded-sm bg-base-800">
              <div
                className="h-5 rounded-sm"
                style={{ width: `${(b.count / max) * 100}%`, background: FILL.researcher, minWidth: b.count ? 4 : 0 }}
              />
            </div>
            <span className="w-8 shrink-0 font-mono text-xs tabular-nums text-ink-300">{b.count}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

/** Events per agent. Categorical - colour carries agent identity, and the
 *  name is spelled out beside every bar so it never has to. */
export function AgentActivity({ byAgent }) {
  const max = Math.max(1, ...byAgent.map((a) => a.events))
  return (
    <Card className="p-4">
      <h3 className="font-display text-sm font-semibold text-ink-100">Agent activity</h3>
      <p className="mb-4 text-xs text-ink-600">Logged events per agent, all tasks</p>
      <div className="flex flex-col gap-2.5">
        {byAgent.map((a) => (
          <div key={a.agent} className="flex items-center gap-3">
            <span className="w-20 shrink-0 truncate text-xs capitalize text-ink-300">{a.agent}</span>
            <div className="h-5 flex-1 rounded-sm bg-base-800">
              <div
                className="h-5 rounded-sm"
                style={{
                  width: `${(a.events / max) * 100}%`,
                  background: FILL[a.agent] || FILL.system,
                  minWidth: a.events ? 4 : 0,
                }}
              />
            </div>
            <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-ink-300">{a.events}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

/** Task types: two measures of different scale (a count and a 0-100 score),
 *  so a table rather than a dual-axis chart. */
export function TaskTypeTable({ byTaskType }) {
  return (
    <Card className="p-4">
      <h3 className="font-display text-sm font-semibold text-ink-100">By task type</h3>
      <p className="mb-3 text-xs text-ink-600">Volume and average score per workflow</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-base-700 text-left text-xs uppercase tracking-wide text-ink-600">
            <th className="pb-2 font-medium">Type</th>
            <th className="pb-2 text-right font-medium">Tasks</th>
            <th className="pb-2 text-right font-medium">Avg score</th>
          </tr>
        </thead>
        <tbody>
          {byTaskType.map((t) => (
            <tr key={t.task_type} className="border-b border-base-800 last:border-0">
              <td className="py-2 font-mono text-xs text-ink-300">{t.task_type}</td>
              <td className="py-2 text-right tabular-nums text-ink-100">{t.count}</td>
              <td className="py-2 text-right tabular-nums text-ink-300">
                {t.avg_score != null ? `${t.avg_score}/100` : '—'}
              </td>
            </tr>
          ))}
          {byTaskType.length === 0 && (
            <tr><td colSpan="3" className="py-3 text-center text-xs text-ink-600">No tasks yet</td></tr>
          )}
        </tbody>
      </table>
    </Card>
  )
}

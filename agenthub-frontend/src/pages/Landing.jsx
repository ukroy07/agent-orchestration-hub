import React from 'react'
import { Link } from 'react-router-dom'
import { Search, PenLine, ShieldCheck, ArrowRight } from 'lucide-react'
import { useAuthStore } from '../store/authStore'

const AGENTS = [
  { icon: Search, name: 'Researcher', color: '#4FD1E8', desc: 'Gathers context and structures the facts' },
  { icon: PenLine, name: 'Writer', color: '#F0B84D', desc: 'Turns findings into a real draft' },
  { icon: ShieldCheck, name: 'Critic', color: '#F0654D', desc: 'Scores it out of 100 and sends it back if it isn\u2019t good enough' },
]

export default function Landing() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  return (
    <div className="w-full mx-auto max-w-5xl px-4 py-16 sm:py-24 sm:px-6">
      <div className="text-center">
        <span className="inline-block rounded-full border border-base-600 px-3 py-1 font-mono text-xs text-ink-400">
          multi-agent orchestration, evaluated
        </span>
        <h1 className="mt-6 font-display text-4xl font-semibold leading-tight text-ink-100 sm:text-5xl">
          Watch AI agents<br />
          <span className="text-agent-researcher">research, write, and review</span><br />
          in real time.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base text-ink-400">
          Give AgentHub a task. A Researcher, Writer, and Critic hand work to each
          other live — every decision scored, logged, and yours to override.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to={isAuthenticated ? '/dashboard' : '/register'}
            className="flex items-center gap-2 rounded-md bg-agent-researcher px-5 py-3 text-sm font-semibold text-base-950 hover:bg-[#6BDBEE] transition-colors"
          >
            {isAuthenticated ? 'Go to dashboard' : 'Start free'} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          {!isAuthenticated && (
            <Link to="/login" className="rounded-md border border-base-600 px-5 py-3 text-sm font-medium text-ink-200 hover:bg-base-800 transition-colors">
              Sign in
            </Link>
          )}
        </div>
      </div>

      <div className="mt-20 grid gap-4 sm:grid-cols-3">
        {AGENTS.map(({ icon: Icon, name, color, desc }) => (
          <div key={name} className="rounded-lg border border-base-700 bg-base-900 p-5">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md" style={{ background: `${color}1A` }}>
              <Icon className="h-5 w-5" style={{ color }} aria-hidden="true" />
            </div>
            <h3 className="font-display text-sm font-semibold text-ink-100">{name}</h3>
            <p className="mt-1 text-sm text-ink-400">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

import React, { useEffect, useState } from 'react'
import { RefreshCw, ShieldCheck, User as UserIcon, Check, X, Clock } from 'lucide-react'
import { useAdminStore } from '../store/adminStore'
import { useAuthStore } from '../store/authStore'
import { Badge, Button, Card } from '../components/ui/primitives'
import {
  AgentActivity,
  DailyActivityChart,
  ScoreDistribution,
  StatTile,
  TaskTypeTable,
} from '../components/admin/charts'

function relativeTime(iso) {
  if (!iso) return 'never'
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const units = [['d', 86400], ['h', 3600], ['m', 60]]
  for (const [suffix, size] of units) {
    if (seconds >= size) return `${Math.floor(seconds / size)}${suffix} ago`
  }
  return 'just now'
}

export default function AdminDashboard() {
  const { stats, users, pending, loading, error, load, setRoles, approve, reject } = useAdminStore()
  const currentUser = useAuthStore((s) => s.user)
  const [busyId, setBusyId] = useState(null)

  useEffect(() => { load() }, [load])

  const run = async (id, fn) => {
    setBusyId(id)
    try {
      await fn()
    } catch (err) {
      window.alert(err?.response?.data?.detail || 'That action could not be completed')
    } finally {
      setBusyId(null)
    }
  }

  const toggleAdmin = (u) => run(u.id, () =>
    setRoles(u.id, u.roles.includes('admin') ? ['user'] : ['user', 'admin'])
  )

  if (error) {
    return (
      <div className="w-full mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <Card className="p-6">
          <h1 className="font-display text-lg font-semibold text-ink-100">Admin unavailable</h1>
          <p className="mt-2 text-sm text-ink-400">{error}</p>
        </Card>
      </div>
    )
  }

  if (loading || !stats) {
    return (
      <div className="w-full mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <p className="text-sm text-ink-400">Loading platform stats…</p>
      </div>
    )
  }

  const { users: u, tasks: t, quality: q, activity: a } = stats

  return (
    <div className="w-full mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink-100 sm:text-2xl">
            Platform overview
          </h1>
          <p className="mt-1 text-sm text-ink-400">
            Usage and quality across every account · updated {relativeTime(stats.generated_at)}
          </p>
        </div>
        <Button variant="ghost" onClick={load} className="!py-1.5 !px-3 text-sm">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Refresh
        </Button>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Users"
          value={u.total}
          sub={`${u.admins} admin · ${u.pending} awaiting approval`}
        />
        <StatTile
          label="Sign-ins"
          value={u.total_logins}
          sub={`${u.active_last_30d} active in 30d`}
        />
        <StatTile
          label="Tasks run"
          value={t.total}
          sub={t.success_rate != null ? `${Math.round(t.success_rate * 100)}% completed` : 'none finished yet'}
        />
        <StatTile
          label="Avg score"
          value={q.avg_score != null ? q.avg_score : '—'}
          sub={`${q.scored_tasks} scored · ${t.avg_revisions} revisions avg`}
          accent="text-trust"
        />
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        <DailyActivityChart daily={a.daily} />
        <ScoreDistribution
          distribution={q.distribution}
          avg={q.avg_score}
          median={q.median_score}
        />
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AgentActivity byAgent={a.by_agent} />
        <div className="flex flex-col gap-4">
          <TaskTypeTable byTaskType={a.by_task_type} />
          <Card className="p-4">
            <h3 className="font-display text-sm font-semibold text-ink-100">Human oversight</h3>
            <p className="mb-3 text-xs text-ink-600">How often people stepped into a run</p>
            <div className="flex items-baseline gap-6">
              <div>
                <div className="font-display text-2xl font-semibold tabular-nums text-agent-human">
                  {a.human_overrides}
                </div>
                <div className="text-xs text-ink-400">overrides sent</div>
              </div>
              <div>
                <div className="font-display text-2xl font-semibold tabular-nums text-ink-100">
                  {a.agent_events}
                </div>
                <div className="text-xs text-ink-400">agent events logged</div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {pending.length > 0 && (
        <Card className="mb-5 overflow-hidden border-trust-warn/40">
          <div className="flex items-center justify-between border-b border-base-700 px-4 py-2.5">
            <h3 className="flex items-center gap-1.5 font-display text-sm font-semibold text-ink-100">
              <Clock className="h-3.5 w-3.5 text-trust-warn" aria-hidden="true" />
              Access requests
            </h3>
            <span className="font-mono text-xs text-trust-warn">{pending.length} waiting</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-base-700 text-left text-xs uppercase tracking-wide text-ink-600">
                  <th className="px-4 py-2 font-medium">Requester</th>
                  <th className="px-4 py-2 font-medium">Requested</th>
                  <th className="px-4 py-2 font-medium">Waiting</th>
                  <th className="px-4 py-2 text-right font-medium">Decision</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((req) => (
                  <tr key={req.id} className="border-b border-base-800 last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="text-ink-100">{req.username}</div>
                      <div className="font-mono text-xs text-ink-600">{req.email}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={req.requested_role === 'admin' ? 'running' : 'neutral'}>
                        {req.requested_role}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-ink-400">
                      {relativeTime(req.created_at)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <button
                          onClick={() => run(req.id, () => approve(req.id, ['user']))}
                          disabled={busyId === req.id}
                          className="flex items-center gap-1 rounded-md border border-trust/40 px-2.5 py-1 text-xs text-trust transition-colors hover:bg-trust/10 disabled:opacity-40"
                        >
                          <Check className="h-3 w-3" aria-hidden="true" /> Approve as user
                        </button>
                        <button
                          onClick={() => run(req.id, () => approve(req.id, ['user', 'admin']))}
                          disabled={busyId === req.id}
                          className="flex items-center gap-1 rounded-md border border-agent-researcher/40 px-2.5 py-1 text-xs text-agent-researcher transition-colors hover:bg-agent-researcher/10 disabled:opacity-40"
                        >
                          <ShieldCheck className="h-3 w-3" aria-hidden="true" /> Approve as admin
                        </button>
                        <button
                          onClick={() => run(req.id, () => reject(req.id))}
                          disabled={busyId === req.id}
                          className="flex items-center gap-1 rounded-md border border-base-600 px-2.5 py-1 text-xs text-ink-400 transition-colors hover:bg-base-800 disabled:opacity-40"
                        >
                          <X className="h-3 w-3" aria-hidden="true" /> Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-base-800 px-4 py-2 text-xs text-ink-600">
            Approving as admin grants both roles, so the account can use the
            workspace as well as the console. Nobody can sign in until approved.
          </p>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-base-700 px-4 py-2.5">
          <h3 className="font-display text-sm font-semibold text-ink-100">Accounts</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-base-700 text-left text-xs uppercase tracking-wide text-ink-600">
                <th className="px-4 py-2 font-medium">User</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 text-right font-medium">Tasks</th>
                <th className="px-4 py-2 text-right font-medium">Avg score</th>
                <th className="px-4 py-2 text-right font-medium">Sign-ins</th>
                <th className="px-4 py-2 text-right font-medium">Last seen</th>
                <th className="px-4 py-2 text-right font-medium">Role</th>
              </tr>
            </thead>
            <tbody>
              {users.map((row) => (
                <tr key={row.id} className="border-b border-base-800 last:border-0">
                  <td className="px-4 py-2.5">
                    <div className="text-ink-100">{row.username}</div>
                    <div className="font-mono text-xs text-ink-600">{row.email}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {row.roles.map((r) => (
                        <Badge key={r} tone={r === 'admin' ? 'running' : 'neutral'}>
                          {r === 'admin'
                            ? <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                            : <UserIcon className="h-3 w-3" aria-hidden="true" />}
                          {r}
                        </Badge>
                      ))}
                      {row.approval_status !== 'approved' && (
                        <Badge tone="danger">{row.approval_status}</Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink-100">{row.task_count}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink-300">
                    {row.avg_score != null ? row.avg_score : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink-300">{row.login_count}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-ink-400">
                    {relativeTime(row.last_login_at)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => toggleAdmin(row)}
                      disabled={busyId === row.id || row.id === currentUser?.id}
                      title={row.id === currentUser?.id ? 'You cannot change your own role' : undefined}
                      className="rounded-md border border-base-600 px-2.5 py-1 text-xs text-ink-300 transition-colors hover:bg-base-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {row.roles.includes('admin') ? 'Revoke admin' : 'Grant admin'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="mt-4 text-xs text-ink-600">
        Admins see counts and scores only — task descriptions, agent thoughts and
        generated results stay private to the account that ran them.
      </p>
    </div>
  )
}

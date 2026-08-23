import React, { useState } from 'react'
import { UserCog } from 'lucide-react'
import { Button } from '../ui/primitives'

const AGENTS = [
  { value: '', label: 'All agents' },
  { value: 'researcher', label: 'Researcher' },
  { value: 'writer', label: 'Writer' },
  { value: 'critic', label: 'Critic' },
  { value: 'coder', label: 'Coder' },
]

export default function OverridePanel({ onOverride, isConnected }) {
  const [instruction, setInstruction] = useState('')
  const [targetAgent, setTargetAgent] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!instruction.trim()) return
    onOverride(instruction.trim(), targetAgent || null)
    setInstruction('')
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-agent-human/25 bg-agent-human/5 p-4">
      <div className="mb-3 flex items-center gap-2">
        <UserCog className="h-4 w-4 text-agent-human" aria-hidden="true" />
        <h3 className="font-display text-sm font-semibold text-ink-100">Human override</h3>
      </div>
      <select
        value={targetAgent}
        onChange={(e) => setTargetAgent(e.target.value)}
        className="mb-2 w-full rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-ink-100 outline-none focus:border-agent-human"
      >
        {AGENTS.map((a) => (
          <option key={a.value} value={a.value}>{a.label}</option>
        ))}
      </select>
      <textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder="Steer the agents - e.g. 'focus on the cost angle, not features'"
        rows={3}
        className="w-full resize-none rounded-md border border-base-600 bg-base-900 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-600 outline-none focus:border-agent-human"
      />
      <Button
        type="submit"
        disabled={!isConnected || !instruction.trim()}
        className="mt-2 w-full !bg-agent-human !text-base-950 hover:!bg-[#6EE8B3]"
      >
        {isConnected ? 'Send override' : 'Connecting…'}
      </Button>
    </form>
  )
}

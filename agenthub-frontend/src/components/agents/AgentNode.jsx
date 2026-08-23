import React from 'react'
import { Handle, Position } from '@xyflow/react'

const AGENT_COLORS = {
  researcher: '#4FD1E8',
  writer: '#F0B84D',
  critic: '#F0654D',
  coder: '#9D7BF5',
}

const STATUS_LABEL = { idle: 'Standing by', active: 'Working', done: 'Complete' }

export default function AgentNode({ data }) {
  const color = AGENT_COLORS[data.id] || '#8891A6'
  const status = data.status || 'idle'

  return (
    <div
      className="rounded-lg border px-4 py-3 text-center transition-all duration-300 font-sans"
      style={{
        minWidth: 132,
        background: status === 'idle' ? '#12161F' : `${color}14`,
        borderColor: status === 'idle' ? '#252B3A' : color,
        boxShadow: status === 'active' ? `0 0 0 1px ${color}, 0 0 20px -2px ${color}80` : 'none',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: color, width: 6, height: 6, border: 'none' }} />
      <div className="flex items-center justify-center gap-1.5">
        <span
          className={`h-1.5 w-1.5 rounded-full ${status === 'active' ? 'animate-pulse' : ''}`}
          style={{ background: status === 'idle' ? '#5B6479' : color }}
        />
        <span className="text-sm font-semibold text-ink-100">{data.label}</span>
      </div>
      <div className="mt-1 font-mono text-[11px] uppercase tracking-wide" style={{ color: status === 'idle' ? '#5B6479' : color }}>
        {STATUS_LABEL[status]}
      </div>
      <Handle type="source" position={Position.Right} style={{ background: color, width: 6, height: 6, border: 'none' }} />
    </div>
  )
}

import React, { useEffect, useMemo } from 'react'
import { ReactFlow, Background, Controls, useNodesState, useEdgesState, MarkerType } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import AgentNode from './AgentNode'
import { useTaskStore } from '../../store/taskStore'

const nodeTypes = { agentNode: AgentNode }

const BASE_NODES = [
  { id: 'researcher', type: 'agentNode', position: { x: 20, y: 140 }, data: { id: 'researcher', label: 'Researcher' } },
  { id: 'writer', type: 'agentNode', position: { x: 260, y: 40 }, data: { id: 'writer', label: 'Writer' } },
  { id: 'critic', type: 'agentNode', position: { x: 500, y: 140 }, data: { id: 'critic', label: 'Critic' } },
  { id: 'coder', type: 'agentNode', position: { x: 260, y: 240 }, data: { id: 'coder', label: 'Coder' } },
]

const EDGE_COLORS = { researcher: '#4FD1E8', writer: '#F0B84D', critic: '#F0654D', coder: '#9D7BF5' }

function buildEdges() {
  const mk = (id, source, target, opts = {}) => ({
    id, source, target,
    markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_COLORS[source] },
    style: { stroke: EDGE_COLORS[source], strokeWidth: 1.5, ...(opts.dashed ? { strokeDasharray: '4 3' } : {}) },
    animated: false,
    ...opts,
  })
  return [
    mk('r-w', 'researcher', 'writer'),
    mk('w-c', 'writer', 'critic'),
    mk('c-w', 'critic', 'writer', { dashed: true, label: 'revise' }),
    mk('cod-c', 'coder', 'critic'),
    mk('c-cod', 'critic', 'coder', { dashed: true, label: 'revise' }),
  ]
}

export default function AgentFlowCanvas() {
  const agentStates = useTaskStore((s) => s.agentStates)
  const [nodes, setNodes, onNodesChange] = useNodesState(BASE_NODES)
  const [edges, setEdges, onEdgesChange] = useEdgesState(useMemo(buildEdges, []))

  useEffect(() => {
    setNodes((nds) => nds.map((n) => ({ ...n, data: { ...n.data, status: agentStates[n.id] || 'idle' } })))
    setEdges((eds) => eds.map((e) => ({ ...e, animated: agentStates[e.source] === 'active' })))
  }, [agentStates, setNodes, setEdges])

  return (
    <div style={{ height: 340 }} className="w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
      >
        <Background color="#252B3A" gap={20} size={1} />
        <Controls showInteractive={false} className="!bg-base-900 !border-base-700 [&>button]:!bg-base-900 [&>button]:!border-base-700 [&>button]:!text-ink-300" />
      </ReactFlow>
    </div>
  )
}

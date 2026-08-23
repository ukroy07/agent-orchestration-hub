import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Radar } from 'lucide-react'
import { useTaskStore } from '../store/taskStore'
import TaskCard from '../components/tasks/TaskCard'
import NewTaskModal from '../components/tasks/NewTaskModal'
import { Button } from '../components/ui/primitives'

export default function Dashboard() {
  const { tasks, fetchTasks, createTask, deleteTask } = useTaskStore()
  const [modalOpen, setModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    fetchTasks().finally(() => setLoading(false))
  }, [fetchTasks])

  const handleClose = (createdTask) => {
    setModalOpen(false)
    if (createdTask) navigate(`/task/${createdTask.id}`)
  }

  return (
    <div className="w-full mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-100">Tasks</h1>
          <p className="mt-1 text-sm text-ink-400">Every task your agents have worked on</p>
        </div>
        <Button onClick={() => setModalOpen(true)} className="!px-3 sm:!px-4">
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">New task</span>
        </Button>
      </div>

      {loading ? (
        <p className="py-16 text-center text-sm text-ink-600">Loading…</p>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-base-700 py-20 text-center">
          <Radar className="mb-3 h-8 w-8 text-ink-600" aria-hidden="true" />
          <p className="text-sm text-ink-400">No tasks yet. Give the agents something to do.</p>
          <Button onClick={() => setModalOpen(true)} className="mt-4 !px-4">
            <Plus className="h-4 w-4" aria-hidden="true" /> New task
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onDelete={deleteTask} />
          ))}
        </div>
      )}

      <NewTaskModal
        open={modalOpen}
        onClose={handleClose}
        onCreate={createTask}
        existingTitles={tasks.map((t) => t.title)}
      />
    </div>
  )
}

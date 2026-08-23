import uuid
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select
from typing import List

from app.database import get_db
from app.models.task import Task, AgentLog
from app.models.user import User
from app.schemas.task import TaskCreate, TaskOut, AgentLogOut, AgentOverride
from app.core.dependencies import get_current_user
from app.services.agent_service import run_agent_workflow, send_human_override

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.post("/", response_model=TaskOut, status_code=201)
async def create_task(
    payload: TaskCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # One title per user. Compared case-insensitively on the trimmed value,
    # because "Fix login bug" and "fix login bug " are the same task to the
    # person typing them - matching raw strings would let the duplicate
    # through and make the rule look broken.
    #
    # Scoped to current_user: two people may each have a task called
    # "Weekly summary" without colliding.
    title = payload.title.strip()
    duplicate = (
        await db.execute(
            select(Task.id).where(
                Task.user_id == current_user.id,
                func.lower(Task.title) == title.lower(),
            )
        )
    ).scalar_one_or_none()
    if duplicate:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail='"' + title + '" already exists. Open it from your dashboard, or pick a different title.',
        )

    task = Task(
        id=payload.id or uuid.uuid4(),
        user_id=current_user.id, title=title, description=payload.description,
        task_type=payload.task_type, status="running",
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)

    # FastAPI's BackgroundTasks supports async callables natively - it awaits
    # them after the response is sent, in the same event loop.
    background_tasks.add_task(run_agent_workflow, str(task.id), payload.description, payload.task_type)
    logger.bind(agent="system").info('task {} queued: "{}"', str(task.id)[:8], payload.title)

    return task


@router.get("/", response_model=List[TaskOut])
async def list_tasks(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Task).where(Task.user_id == current_user.id).order_by(Task.created_at.desc()))
    return result.scalars().all()


@router.get("/{task_id}", response_model=TaskOut)
async def get_task(task_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Task).where(Task.id == task_id, Task.user_id == current_user.id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.get("/{task_id}/logs", response_model=List[AgentLogOut])
async def get_task_logs(task_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    owned = (await db.execute(select(Task.id).where(Task.id == task_id, Task.user_id == current_user.id))).scalar_one_or_none()
    if not owned:
        raise HTTPException(status_code=404, detail="Task not found")

    result = await db.execute(select(AgentLog).where(AgentLog.task_id == task_id).order_by(AgentLog.sequence))
    return result.scalars().all()


@router.post("/{task_id}/override", status_code=202)
async def override_task(
    task_id: uuid.UUID, payload: AgentOverride,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    owned = (await db.execute(select(Task.id).where(Task.id == task_id, Task.user_id == current_user.id))).scalar_one_or_none()
    if not owned:
        raise HTTPException(status_code=404, detail="Task not found")

    await send_human_override(str(task_id), payload.instruction, payload.target_agent)
    return {"message": "Override recorded and broadcast"}


@router.delete("/{task_id}", status_code=204)
async def delete_task(task_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Task).where(Task.id == task_id, Task.user_id == current_user.id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    await db.delete(task)
    await db.commit()
    logger.bind(agent="system").info("task {} deleted", str(task_id)[:8])

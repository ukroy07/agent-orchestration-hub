import json
import itertools
from datetime import datetime, timezone
from loguru import logger
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.core.redis_client import redis_client
from app.models.task import Task, AgentLog
from app.agents.orchestrator import run_workflow

EVENT_HISTORY_TTL_SECONDS = 3600  # replay buffer only needs to outlive a task's active run


def _channel(task_id: str) -> str:
    return f"ws:task:{task_id}"


def _history_key(task_id: str) -> str:
    return f"ws:history:{task_id}"


async def run_agent_workflow(task_id: str, description: str, task_type: str) -> None:
    """Entry point called from FastAPI BackgroundTasks. Owns its own DB
    session since the request-scoped session from the route handler is
    already closed by the time this runs."""
    sequence_counter = itertools.count(1)

    async def emit(event: dict) -> None:
        seq = next(sequence_counter)
        event = {**event, "timestamp": datetime.now(timezone.utc).isoformat(), "sequence": seq}

        # 1) Persist - this IS the audit trail. Agent-level events carry a
        # specific "event" (thinking/action/handoff/evaluation/override);
        # workflow-level events (started/complete/error) only have "type".
        event_type = event.get("event") or event.get("type", "unknown")

        # 0) Terminal. This closure is already the one place every agent
        # event passes through, so it's also the one place worth logging
        # from - a new event type shows up in the terminal for free.
        agent = event.get("agent", "system")
        log = logger.bind(agent=agent)
        content = " ".join(str(event.get("content", "")).split())
        if len(content) > 140:
            content = content[:137] + "..."
        if event_type == "evaluation":
            meta = event.get("metadata") or {}
            log.info(
                "[{}] score {}/100 - {}",
                event_type,
                meta.get("score"),
                "approved" if meta.get("approved") else "revise",
            )
        elif event_type == "handoff":
            log.info("[{}] -> {}", event_type, event.get("to", "?"))
        elif event_type == "workflow_error":
            log.error("[{}] {}", event_type, content)
        else:
            log.info("[{}] {}", event_type, content)
        async with AsyncSessionLocal() as db:
            db.add(AgentLog(
                task_id=task_id,
                agent_name=event.get("agent", "system"),
                event_type=event_type,
                content=event.get("content", ""),
                event_metadata=event.get("metadata"),
                sequence=seq,
            ))
            await db.commit()

        # 2) Publish - this is what makes it real-time. If nobody is
        # subscribed (no open WebSocket), publish is a harmless no-op; the
        # row above already guarantees nothing is lost.
        payload = json.dumps(event, default=str)
        await redis_client.publish(_channel(task_id), payload)

        # 3) Buffer - Redis pub/sub delivers only to subscribers that are
        # ALREADY connected at publish time; anything published before a
        # client subscribes is gone. Agents can emit their first few events
        # (workflow_started, "thinking"...) within milliseconds, often faster
        # than a freshly-navigated frontend can open its socket - so without
        # this buffer, a client that connects a beat late silently misses the
        # opening of every task. A short-lived list lets a new subscriber
        # replay anything it missed, then continue live from the socket.
        history_key = _history_key(task_id)
        await redis_client.rpush(history_key, payload)
        await redis_client.expire(history_key, EVENT_HISTORY_TTL_SECONDS)

    log = logger.bind(agent="system")
    log.info("task {} started ({})", task_id[:8], task_type)
    try:
        await emit({"type": "workflow_started", "content": "Agents are getting to work..."})
        final_state = await run_workflow(task_id, description, task_type, emit)

        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Task).where(Task.id == task_id))
            task = result.scalar_one_or_none()
            if task:
                task.status = "completed"
                task.result = final_state.get("final_output") or final_state.get("draft_output")
                task.quality_score = final_state.get("last_score")
                task.revision_count = final_state.get("revision_count", 0)
                task.result_metadata = {
                    "quality_score": final_state.get("last_score"),
                    "revisions": final_state.get("revision_count", 0),
                }
                await db.commit()

        log.success(
            "task {} completed - score {}/100 after {} revision(s)",
            task_id[:8], final_state.get("last_score"), final_state.get("revision_count", 0),
        )
        await emit({
            "type": "workflow_complete",
            "content": "Task complete.",
            "result": final_state.get("final_output") or final_state.get("draft_output"),
            "score": final_state.get("last_score"),
        })

    except Exception as e:  # noqa: BLE001 - we want to surface any agent failure to the UI + DB
        log.error("task {} failed: {}", task_id[:8], e)
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Task).where(Task.id == task_id))
            task = result.scalar_one_or_none()
            if task:
                task.status = "failed"
                task.result_metadata = {"error": str(e)}
                await db.commit()
        await emit({"type": "workflow_error", "agent": "system", "content": f"Workflow failed: {e}"})


async def send_human_override(task_id: str, instruction: str, target_agent: str | None) -> None:
    """Human-in-the-loop: recorded in the audit trail and broadcast, same as
    any agent event. (Injecting it into a running LangGraph mid-execution is
    the natural v2 step - see README 'Roadmap'.)"""
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(AgentLog.sequence).where(AgentLog.task_id == task_id).order_by(AgentLog.sequence.desc()).limit(1))
        last_seq = (result.scalar_one_or_none() or 0) + 1
        db.add(AgentLog(
            task_id=task_id, agent_name="human", event_type="override",
            content=instruction, event_metadata={"target_agent": target_agent}, sequence=last_seq,
        ))
        await db.commit()

    logger.bind(agent="human").info("override -> {}: {}", target_agent or "all agents", instruction)

    event = {
        "type": "agent_event", "agent": "human", "event": "override",
        "content": instruction, "target_agent": target_agent, "sequence": last_seq,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    payload = json.dumps(event, default=str)
    await redis_client.publish(_channel(task_id), payload)
    history_key = _history_key(task_id)
    await redis_client.rpush(history_key, payload)
    await redis_client.expire(history_key, EVENT_HISTORY_TTL_SECONDS)

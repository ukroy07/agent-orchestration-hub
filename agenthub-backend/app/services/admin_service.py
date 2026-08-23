"""Platform analytics for the admin dashboard.

Scope rule, enforced here rather than in the route: this module returns
**metrics only**. No task titles, descriptions, agent thoughts or generated
results ever leave these functions. An admin can see that a user ran twelve
code_review tasks averaging 91/100; they cannot read what those tasks said.
Keep it that way when adding a metric - the moment user-authored text is
returned, the privacy boundary this platform promises has moved.

Date bucketing happens in Python, not SQL, on purpose: `date_trunc` is
Postgres-only and `date()` is SQLite-only, so a SQL-side bucket would make
the dashboard work on exactly one of the two backends this app supports.
The windows involved are days of task rows, not millions.
"""

from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task import AgentLog, Task
from app.models.user import ROLE_ADMIN, STATUS_PENDING, User

TREND_DAYS = 14
ACTIVE_WINDOW_DAYS = 30
SCORE_BUCKETS = [(0, 59), (60, 74), (75, 89), (90, 100)]


def record_login(user: User) -> None:
    """Stamp a successful sign-in.

    Called from the auth routes inside their existing session, so the
    surrounding request commit picks it up - no separate transaction, and no
    login recorded if the rest of the request then fails.
    """
    user.last_login_at = datetime.now(timezone.utc)
    user.login_count = (user.login_count or 0) + 1


def _as_utc(value):
    """SQLite hands back naive datetimes for rows written before TZDateTime
    existed; treat those as UTC rather than crashing the whole dashboard on
    one legacy row."""
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _bucket_label(score: float) -> str:
    for low, high in SCORE_BUCKETS:
        if low <= score <= high:
            return "{}-{}".format(low, high)
    return "{}-{}".format(SCORE_BUCKETS[-1][0], SCORE_BUCKETS[-1][1])


async def get_platform_stats(db: AsyncSession) -> dict:
    now = datetime.now(timezone.utc)
    active_cutoff = now - timedelta(days=ACTIVE_WINDOW_DAYS)
    new_cutoff = now - timedelta(days=7)

    users = (await db.execute(select(User))).scalars().all()
    tasks = (await db.execute(select(Task))).scalars().all()

    # --- users -------------------------------------------------------------
    total_logins = sum(u.login_count or 0 for u in users)
    signed_in_ever = sum(1 for u in users if (u.login_count or 0) > 0)
    active_recent = 0
    for u in users:
        last = _as_utc(u.last_login_at)
        if last is not None and last >= active_cutoff:
            active_recent += 1
    new_users = sum(
        1 for u in users
        if _as_utc(u.created_at) is not None and _as_utc(u.created_at) >= new_cutoff
    )

    # --- tasks -------------------------------------------------------------
    status_counts = Counter(t.status for t in tasks)
    finished = status_counts["completed"] + status_counts["failed"]
    scored = [t.quality_score for t in tasks if t.quality_score is not None]

    # --- quality -----------------------------------------------------------
    distribution = Counter(_bucket_label(s) for s in scored)
    ordered = sorted(scored)
    if not ordered:
        median = None
    elif len(ordered) % 2:
        median = ordered[len(ordered) // 2]
    else:
        median = (ordered[len(ordered) // 2 - 1] + ordered[len(ordered) // 2]) / 2

    # --- daily trend -------------------------------------------------------
    start_day = (now - timedelta(days=TREND_DAYS - 1)).date()
    per_day = {
        start_day + timedelta(days=i): {"created": 0, "completed": 0, "failed": 0}
        for i in range(TREND_DAYS)
    }
    for t in tasks:
        created = _as_utc(t.created_at)
        if created is None:
            continue
        day = created.date()
        if day in per_day:
            per_day[day]["created"] += 1
            if t.status in ("completed", "failed"):
                per_day[day][t.status] += 1

    # --- per task type -----------------------------------------------------
    by_type = defaultdict(list)
    for t in tasks:
        by_type[t.task_type].append(t)

    type_rows = []
    for task_type, rows in sorted(by_type.items(), key=lambda kv: len(kv[1]), reverse=True):
        type_scores = [t.quality_score for t in rows if t.quality_score is not None]
        type_rows.append({
            "task_type": task_type,
            "count": len(rows),
            "avg_score": round(sum(type_scores) / len(type_scores), 1) if type_scores else None,
        })

    # --- agent activity ----------------------------------------------------
    agent_rows = (
        await db.execute(
            select(AgentLog.agent_name, func.count(AgentLog.id)).group_by(AgentLog.agent_name)
        )
    ).all()
    override_count = (
        await db.execute(
            select(func.count(AgentLog.id)).where(AgentLog.event_type == "override")
        )
    ).scalar_one()

    # --- per-user rollup ---------------------------------------------------
    tasks_by_user = defaultdict(list)
    for t in tasks:
        tasks_by_user[t.user_id].append(t)

    top_users = []
    for u in users:
        owned = tasks_by_user.get(u.id, [])
        owned_scores = [t.quality_score for t in owned if t.quality_score is not None]
        top_users.append({
            "username": u.username,
            "roles": u.role_list,
            "tasks": len(owned),
            "completed": sum(1 for t in owned if t.status == "completed"),
            "avg_score": round(sum(owned_scores) / len(owned_scores), 1) if owned_scores else None,
            "login_count": u.login_count or 0,
            "last_login_at": _as_utc(u.last_login_at),
        })
    top_users.sort(key=lambda r: (r["tasks"], r["login_count"]), reverse=True)

    return {
        "generated_at": now,
        "users": {
            "total": len(users),
            "admins": sum(1 for u in users if u.has_role(ROLE_ADMIN)),
            "pending": sum(1 for u in users if u.approval_status == STATUS_PENDING),
            "signed_in_ever": signed_in_ever,
            "active_last_30d": active_recent,
            "new_last_7d": new_users,
            "total_logins": total_logins,
        },
        "tasks": {
            "total": len(tasks),
            "completed": status_counts["completed"],
            "failed": status_counts["failed"],
            "running": status_counts["running"],
            "pending": status_counts["pending"],
            # Measured against tasks that actually finished. Counting
            # still-running ones as failures would make the number sag
            # during any busy minute and recover on its own, which reads as
            # a real regression when it is not one.
            "success_rate": round(status_counts["completed"] / finished, 3) if finished else None,
            "avg_revisions": round(sum(t.revision_count or 0 for t in tasks) / len(tasks), 2) if tasks else 0,
        },
        "quality": {
            "scored_tasks": len(scored),
            "avg_score": round(sum(scored) / len(scored), 1) if scored else None,
            "median_score": median,
            "min_score": min(scored) if scored else None,
            "max_score": max(scored) if scored else None,
            "distribution": [
                {"bucket": "{}-{}".format(low, high),
                 "count": distribution.get("{}-{}".format(low, high), 0)}
                for low, high in SCORE_BUCKETS
            ],
        },
        "activity": {
            "agent_events": sum(count for _, count in agent_rows),
            "human_overrides": override_count,
            "by_agent": [
                {"agent": name, "events": count}
                for name, count in sorted(agent_rows, key=lambda r: r[1], reverse=True)
            ],
            "by_task_type": type_rows,
            "daily": [
                {"date": day.isoformat(), **counts}
                for day, counts in sorted(per_day.items())
            ],
        },
        "top_users": top_users[:10],
    }


async def list_users(db: AsyncSession) -> list:
    """Roster for the admin user table - account facts and counts, no content."""
    users = (await db.execute(select(User).order_by(User.created_at.desc()))).scalars().all()

    counts = dict(
        (await db.execute(select(Task.user_id, func.count(Task.id)).group_by(Task.user_id))).all()
    )
    avg_scores = dict(
        (await db.execute(
            select(Task.user_id, func.avg(Task.quality_score))
            .where(Task.quality_score.is_not(None))
            .group_by(Task.user_id)
        )).all()
    )

    roster = []
    for u in users:
        avg = avg_scores.get(u.id)
        roster.append({
            "id": u.id,
            "username": u.username,
            "email": u.email,
            "roles": u.role_list,
            "approval_status": u.approval_status,
            "requested_role": u.requested_role,
            "is_active": u.is_active,
            "task_count": counts.get(u.id, 0),
            "avg_score": round(float(avg), 1) if avg is not None else None,
            "login_count": u.login_count or 0,
            "last_login_at": _as_utc(u.last_login_at),
            "created_at": _as_utc(u.created_at),
        })
    return roster


async def pending_registrations(db: AsyncSession) -> list:
    """Accounts awaiting a decision, oldest first.

    Oldest-first because this is a work queue: the person who has been
    waiting longest is the one being kept out of the product, and a
    newest-first list quietly buries them.
    """
    users = (
        await db.execute(
            select(User)
            .where(User.approval_status == STATUS_PENDING)
            .order_by(User.created_at)
        )
    ).scalars().all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "email": u.email,
            "requested_role": u.requested_role,
            "created_at": _as_utc(u.created_at),
        }
        for u in users
    ]

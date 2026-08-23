import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.core.dependencies import require_admin
from app.core.tokens import revoke_all_for_user
from app.database import get_db
from app.models.user import (
    ROLE_ADMIN,
    ROLES,
    STATUS_APPROVED,
    STATUS_PENDING,
    STATUS_REJECTED,
    User,
)
from app.schemas.admin import (
    AdminUserOut,
    ApprovalDecision,
    PendingRegistration,
    PlatformStats,
    RolesUpdate,
)
from app.services.admin_service import get_platform_stats, list_users, pending_registrations

# Every route here depends on require_admin at the *router* level rather than
# per-endpoint. A new endpoint added to this file is therefore admin-only by
# default - the failure mode of forgetting the dependency is a locked door,
# not an open one.
router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(require_admin)],
)


async def _load(db: AsyncSession, user_id: uuid.UUID) -> User:
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


async def _as_row(db: AsyncSession, user_id: uuid.UUID) -> dict:
    rows = await list_users(db)
    return next(row for row in rows if row["id"] == user_id)


@router.get("/stats", response_model=PlatformStats)
async def platform_stats(db: AsyncSession = Depends(get_db)):
    return await get_platform_stats(db)


@router.get("/users", response_model=List[AdminUserOut])
async def admin_users(db: AsyncSession = Depends(get_db)):
    return await list_users(db)


@router.get("/registrations", response_model=List[PendingRegistration])
async def registrations(db: AsyncSession = Depends(get_db)):
    """Accounts waiting on a decision, oldest first - the queue to work
    through, not a list sorted by newest noise."""
    return await pending_registrations(db)


@router.post("/registrations/{user_id}/approve", response_model=AdminUserOut)
async def approve_registration(
    user_id: uuid.UUID,
    payload: ApprovalDecision,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Grant an account the roles it may use.

    The roles granted need not match what was requested - somebody asking for
    admin can be approved as a plain user, which is the main reason this is a
    decision rather than a rubber stamp.
    """
    granted = [r for r in payload.roles if r in ROLES]
    if not granted:
        raise HTTPException(status_code=400, detail="Grant at least one role from: " + ", ".join(ROLES))

    user = await _load(db, user_id)
    user.set_roles(granted)
    user.approval_status = STATUS_APPROVED
    user.approved_at = datetime.now(timezone.utc)
    user.approved_by_id = current_user.id
    await db.commit()

    logger.bind(agent="system").info(
        "approved {} as {} (requested {}, by {})",
        user.username, ",".join(granted), user.requested_role, current_user.username,
    )
    return await _as_row(db, user_id)


@router.post("/registrations/{user_id}/reject", response_model=AdminUserOut)
async def reject_registration(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = await _load(db, user_id)
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot reject your own account")

    user.approval_status = STATUS_REJECTED
    user.set_roles([])
    await revoke_all_for_user(db, user.id)
    await db.commit()

    logger.bind(agent="system").info("rejected {} (by {})", user.username, current_user.username)
    return await _as_row(db, user_id)


@router.patch("/users/{user_id}/roles", response_model=AdminUserOut)
async def update_roles(
    user_id: uuid.UUID,
    payload: RolesUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    granted = [r for r in payload.roles if r in ROLES]
    if not granted:
        raise HTTPException(status_code=400, detail="An account must keep at least one role")

    user = await _load(db, user_id)

    # Guard against an admin removing their own access and locking the
    # platform out of its own admin surface - recovering needs the CLI script
    # and database access, which is not something to discover by accident.
    if user.id == current_user.id and ROLE_ADMIN not in granted:
        raise HTTPException(status_code=400, detail="You cannot remove your own admin role")

    previous = user.roles
    user.set_roles(granted)
    if user.approval_status != STATUS_APPROVED:
        user.approval_status = STATUS_APPROVED
        user.approved_at = datetime.now(timezone.utc)
        user.approved_by_id = current_user.id

    # Sessions already running under a role that was just taken away must not
    # keep working until their refresh token happens to expire. get_principal
    # re-reads roles per request so the access token dies within minutes
    # anyway; killing the refresh tokens closes the longer tail.
    if set(previous.split(",")) - set(granted):
        await revoke_all_for_user(db, user.id)

    await db.commit()
    logger.bind(agent="system").info(
        "roles: {} [{}] -> [{}] (by {})", user.username, previous, user.roles, current_user.username
    )
    return await _as_row(db, user_id)


@router.patch("/users/{user_id}/active", response_model=AdminUserOut)
async def update_active(
    user_id: uuid.UUID,
    is_active: bool,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = await _load(db, user_id)
    if user.id == current_user.id and not is_active:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account")

    user.is_active = is_active
    if not is_active:
        await revoke_all_for_user(db, user.id)
    await db.commit()

    logger.bind(agent="system").info(
        "{} {} (by {})", user.username, "activated" if is_active else "deactivated", current_user.username
    )
    return await _as_row(db, user_id)

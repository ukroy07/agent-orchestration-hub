"""Response models for the admin surface.

These exist mostly as a contract check. The privacy rule for this surface is
"metrics only, never user-authored content", and a typed response model is
what makes that rule survive a future edit: adding a task title to the
service payload without also adding it here means it simply does not reach
the client.
"""

import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from app.models.user import ROLES


class UserStats(BaseModel):
    total: int
    admins: int
    pending: int
    signed_in_ever: int
    active_last_30d: int
    new_last_7d: int
    total_logins: int


class TaskStats(BaseModel):
    total: int
    completed: int
    failed: int
    running: int
    pending: int
    success_rate: Optional[float] = None
    avg_revisions: float


class ScoreBucket(BaseModel):
    bucket: str
    count: int


class QualityStats(BaseModel):
    scored_tasks: int
    avg_score: Optional[float] = None
    median_score: Optional[float] = None
    min_score: Optional[float] = None
    max_score: Optional[float] = None
    distribution: List[ScoreBucket]


class AgentActivity(BaseModel):
    agent: str
    events: int


class TaskTypeActivity(BaseModel):
    task_type: str
    count: int
    avg_score: Optional[float] = None


class DailyPoint(BaseModel):
    date: str
    created: int
    completed: int
    failed: int


class ActivityStats(BaseModel):
    agent_events: int
    human_overrides: int
    by_agent: List[AgentActivity]
    by_task_type: List[TaskTypeActivity]
    daily: List[DailyPoint]


class UserRollup(BaseModel):
    username: str
    roles: List[str]
    tasks: int
    completed: int
    avg_score: Optional[float] = None
    login_count: int
    last_login_at: Optional[datetime] = None


class PlatformStats(BaseModel):
    generated_at: datetime
    users: UserStats
    tasks: TaskStats
    quality: QualityStats
    activity: ActivityStats
    top_users: List[UserRollup]


class AdminUserOut(BaseModel):
    id: uuid.UUID
    username: str
    email: str
    roles: List[str]
    approval_status: str
    requested_role: Optional[str] = None
    is_active: bool
    task_count: int
    avg_score: Optional[float] = None
    login_count: int
    last_login_at: Optional[datetime] = None
    created_at: datetime


class RolesUpdate(BaseModel):
    roles: List[str] = Field(description="Any of: " + ", ".join(ROLES))


class ApprovalDecision(BaseModel):
    """What the admin actually grants. Separate from the requested role on
    purpose: approving is a decision, and the common case for an admin
    request is granting plain user access instead."""
    roles: List[str] = Field(description="Any of: " + ", ".join(ROLES))


class PendingRegistration(BaseModel):
    id: uuid.UUID
    username: str
    email: str
    requested_role: Optional[str] = None
    created_at: datetime

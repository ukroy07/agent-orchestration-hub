import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, ForeignKey, Integer, Float, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.columns import UUIDType, JSONType, TZDateTime
from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="pending")
    # pending | running | paused | completed | failed
    task_type: Mapped[str] = mapped_column(String(100), default="general")
    # general | research | code_review

    result: Mapped[str | None] = mapped_column(Text, nullable=True)
    result_metadata: Mapped[dict | None] = mapped_column(JSONType, nullable=True)

    # Trust / evaluation layer: the Critic agent's structured score for the
    # final accepted output, plus how many writer<->critic loops it took.
    quality_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    revision_count: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(TZDateTime, default=_utcnow, onupdate=_utcnow)

    user = relationship("User", back_populates="tasks")
    agent_logs = relationship("AgentLog", back_populates="task", cascade="all, delete-orphan", order_by="AgentLog.sequence")


class AgentLog(Base):
    """Every agent thought/action/handoff/override, in order. This table IS
    the audit trail: nothing an agent (or a human override) does happens
    without a row here, timestamped and sequenced."""
    __tablename__ = "agent_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(UUIDType, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)

    agent_name: Mapped[str] = mapped_column(String(100), nullable=False)
    # researcher | writer | critic | coder | human | system
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    # thinking | action | handoff | evaluation | override | result | error
    content: Mapped[str] = mapped_column(Text, nullable=False)

    # Structured extras: for 'evaluation' events this carries {approved, score, feedback}
    event_metadata: Mapped[dict | None] = mapped_column(JSONType, nullable=True)

    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=_utcnow)

    task = relationship("Task", back_populates="agent_logs")


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    token: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(TZDateTime, nullable=False)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=_utcnow)

    user = relationship("User", back_populates="refresh_tokens")

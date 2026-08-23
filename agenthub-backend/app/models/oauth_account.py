import uuid
from datetime import datetime, timezone
from sqlalchemy import String, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.columns import UUIDType, TZDateTime
from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class OAuthAccount(Base):
    __tablename__ = "oauth_accounts"
    __table_args__ = (UniqueConstraint("provider", "provider_account_id", name="uq_provider_account"),)

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    provider: Mapped[str] = mapped_column(String(50), nullable=False)  # 'google', 'github', ...
    provider_account_id: Mapped[str] = mapped_column(String(255), nullable=False)  # provider's user "sub"

    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=_utcnow)

    user = relationship("User", back_populates="oauth_accounts")

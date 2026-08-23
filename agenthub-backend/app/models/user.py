import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.columns import UUIDType, TZDateTime
from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# Roles are plain strings rather than a DB enum: adding a role to a native PG
# enum needs a migration with ALTER TYPE, and SQLite has no enum at all, so
# VARCHAR keeps the dev and production schemas identical and makes a third
# role a one-line change here.
ROLE_USER = "user"
ROLE_ADMIN = "admin"
ROLES = (ROLE_USER, ROLE_ADMIN)

# An account is not usable until an admin acts on it. `pending` is the state
# every self-registration starts in.
STATUS_PENDING = "pending"
STATUS_APPROVED = "approved"
STATUS_REJECTED = "rejected"
APPROVAL_STATUSES = (STATUS_PENDING, STATUS_APPROVED, STATUS_REJECTED)


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)

    # Nullable: OAuth-only users (Google login) never set a password
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)

    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Granted roles, comma-separated - an account can hold more than one and
    # pick which to sign in as. Empty string means "approved for nothing yet",
    # which is the state a pending registration sits in.
    #
    # Why a string and not a user_roles join table: nothing in this codebase
    # ever filters users by role in SQL. `require_admin` checks the row already
    # loaded by get_current_user, and the admin dashboard loads every user into
    # Python to aggregate anyway. A join table would add a model, a migration
    # and two eager-loads to buy an index nobody queries.
    roles: Mapped[str] = mapped_column(String(100), default="", server_default="", nullable=False)

    # What the person asked for at sign-up. Kept after approval as a record of
    # what was requested versus what was actually granted - an admin
    # downgrading an admin request to plain user is exactly the case worth
    # being able to see later.
    requested_role: Mapped[str | None] = mapped_column(String(20), nullable=True)

    approval_status: Mapped[str] = mapped_column(
        String(20), default=STATUS_PENDING, server_default=STATUS_PENDING, nullable=False
    )
    approved_at: Mapped[datetime | None] = mapped_column(TZDateTime, nullable=True)
    approved_by_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType, nullable=True)

    # Login analytics for the admin dashboard. Deliberately *not* bumped on
    # token refresh - a refresh is the session continuing, not a new sign-in,
    # and counting it would make "logins" mean "requests" instead.
    last_login_at: Mapped[datetime | None] = mapped_column(TZDateTime, nullable=True)
    login_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)

    created_at: Mapped[datetime] = mapped_column(TZDateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(TZDateTime, default=_utcnow, onupdate=_utcnow)

    @property
    def role_list(self) -> list[str]:
        return [r for r in (self.roles or "").split(",") if r]

    def has_role(self, role: str) -> bool:
        return role in self.role_list

    @property
    def is_admin(self) -> bool:
        return self.has_role(ROLE_ADMIN)

    @property
    def is_approved(self) -> bool:
        return self.approval_status == STATUS_APPROVED and bool(self.role_list)

    def set_roles(self, roles) -> None:
        """Store roles in a stable order so the column never differs only by
        ordering - "admin,user" and "user,admin" would otherwise be two
        different strings for the same grant."""
        unique = {r for r in roles if r in ROLES}
        self.roles = ",".join(r for r in ROLES if r in unique)

    tasks = relationship("Task", back_populates="user", cascade="all, delete-orphan")
    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")
    oauth_accounts = relationship("OAuthAccount", back_populates="user", cascade="all, delete-orphan")

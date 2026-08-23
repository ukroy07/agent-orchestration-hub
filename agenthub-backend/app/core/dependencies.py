from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.user import ROLE_ADMIN, ROLE_USER, User
from app.core.security import decode_token

bearer_scheme = HTTPBearer()


class Principal:
    """The authenticated caller: the database row plus the role this session
    chose to act as.

    Two separate facts, kept separate on purpose. `user.role_list` is what the
    account *holds* and is authoritative - it is re-read from the database on
    every request. `active_role` is which of those the current session is
    using, and comes from the signed token. A client cannot grant itself
    anything by tampering with the second, because the first is checked
    against the database and the token is signed.
    """

    def __init__(self, user: User, active_role: str):
        self.user = user
        self.active_role = active_role

    @property
    def id(self):
        return self.user.id

    @property
    def username(self):
        return self.user.username

    def acting_as_admin(self) -> bool:
        return self.active_role == ROLE_ADMIN and self.user.has_role(ROLE_ADMIN)


async def get_principal(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> Principal:
    token = credentials.credentials
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise ValueError("Token is not an access token")
        user_id = payload.get("sub")
        if not user_id:
            raise ValueError("Token missing subject claim")
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )

    result = await db.execute(select(User).where(User.id == user_id, User.is_active == True))  # noqa: E712
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    if not user.is_approved:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is not approved")

    active_role = payload.get("active_role") or ROLE_USER
    # The grant may have been revoked since this token was minted. The token
    # is still validly signed, so only the database can tell us that.
    if not user.has_role(active_role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your " + active_role + " access has been changed. Please sign in again.",
        )

    return Principal(user, active_role)


async def get_current_user(principal: Principal = Depends(get_principal)) -> User:
    """The owning user for ordinary (non-admin) routes."""
    return principal.user


async def require_admin(principal: Principal = Depends(get_principal)) -> User:
    """Gate for the platform-admin surface.

    Requires both that the account holds the admin role *and* that this
    session signed in as admin. The second half is what makes "sign in as
    user" meaningful for a dual-role account: while acting as a plain user,
    the admin console is closed, so an XSS payload riding that session cannot
    reach it either.
    """
    if not principal.acting_as_admin():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This endpoint requires an active platform admin session",
        )
    return principal.user

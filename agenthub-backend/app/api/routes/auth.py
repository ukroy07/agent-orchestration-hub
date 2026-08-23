from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import (
    ROLE_ADMIN,
    ROLE_USER,
    ROLES,
    STATUS_PENDING,
    STATUS_REJECTED,
    User,
)
from app.models.task import RefreshToken
from app.schemas.user import (
    RegistrationAccepted,
    TokenResponse,
    UserLogin,
    UserOut,
    UserRegister,
)
from app.core.security import hash_password, verify_password, create_access_token, decode_token
from app.core.tokens import (
    RefreshError,
    clear_refresh_cookie,
    consume_refresh_token,
    issue_refresh_token,
    read_refresh_cookie,
)
from app.config import settings
from app.services.admin_service import record_login

router = APIRouter(prefix="/auth", tags=["auth"])


def _default_role(user: User) -> str:
    """The role a fresh sign-in gets: the highest the account holds.

    An account with admin access always signs in as admin. Sign-in is not a
    place to choose a lesser identity - letting an admin start a plain user
    session at the door means the account's privilege level is decided by
    whoever is typing, which is not something the login screen should be
    negotiating. Moving to the workspace is a deliberate in-app switch
    instead (POST /auth/switch-role), which is explicit, logged, and mints a
    new token rather than quietly issuing a downgraded one.
    """
    granted = user.role_list
    return ROLE_ADMIN if ROLE_ADMIN in granted else granted[0]


def _resolve_active_role(user: User, requested: str | None) -> str:
    """Validate an explicitly requested role. Used by /auth/switch-role only.

    Asking for a role you do not hold is a 403, not a silent downgrade -
    signing someone in with fewer privileges than they picked looks like a
    bug to them and hides a real permission problem from us.
    """
    granted = user.role_list
    if requested:
        if requested not in ROLES:
            raise HTTPException(status_code=400, detail="Unknown role: " + requested)
        if requested not in granted:
            raise HTTPException(
                status_code=403,
                detail="Your account does not have the " + requested + " role",
            )
        return requested
    return _default_role(user)


async def _issue_session(
    user: User, db: AsyncSession, response: Response, active_role: str
) -> TokenResponse:
    access_token = create_access_token({"sub": str(user.id), "active_role": active_role})
    await issue_refresh_token(user, db, response, active_role)
    await db.commit()
    return TokenResponse(
        access_token=access_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        active_role=active_role,
        user=UserOut.model_validate(user),
    )


@router.post(
    "/register",
    response_model=RegistrationAccepted,
    status_code=status.HTTP_202_ACCEPTED,
)
async def register(payload: UserRegister, db: AsyncSession = Depends(get_db)):
    """Create an account in the pending state. Deliberately returns no tokens:
    registration is a *request* for access here, and the account cannot sign
    in until an admin grants it a role."""
    if payload.requested_role not in ROLES:
        raise HTTPException(status_code=400, detail="Requested role must be one of: " + ", ".join(ROLES))
    if (await db.execute(select(User).where(User.email == payload.email))).scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")
    if (await db.execute(select(User).where(User.username == payload.username))).scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username already taken")

    user = User(
        email=payload.email,
        username=payload.username,
        hashed_password=hash_password(payload.password),
        requested_role=payload.requested_role,
        approval_status=STATUS_PENDING,
        roles="",
    )
    db.add(user)
    await db.commit()

    logger.bind(agent="system").info(
        "registration pending: {} requested {}", user.email, payload.requested_role
    )
    return RegistrationAccepted(
        email=user.email,
        requested_role=payload.requested_role,
        message=(
            "Your account was created and is waiting for an administrator to "
            "approve access. You'll be able to sign in once it's approved."
        ),
    )


@router.post("/login", response_model=TokenResponse)
async def login(payload: UserLogin, response: Response, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()

    if not user or not user.hashed_password or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")
    if user.approval_status == STATUS_PENDING:
        raise HTTPException(
            status_code=403,
            detail="Your account is waiting for administrator approval.",
        )
    if user.approval_status == STATUS_REJECTED or not user.role_list:
        raise HTTPException(
            status_code=403,
            detail="Your access request was not approved. Contact an administrator.",
        )

    # Derived from the account, never from the request body.
    active_role = _default_role(user)
    record_login(user)
    logger.bind(agent="system").info("{} signed in as {}", user.username, active_role)
    return await _issue_session(user, db, response, active_role)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    """Rotate the refresh cookie and mint a new access token.

    Takes no request body: the refresh token comes from the HttpOnly cookie,
    which is the whole point - client-side script never holds it and so
    cannot send it.
    """
    token = read_refresh_cookie(request)
    try:
        user = await consume_refresh_token(token, db)
    except RefreshError as e:
        clear_refresh_cookie(response)
        raise HTTPException(status_code=401, detail=str(e))

    # Carry the session's role across the refresh, but re-validate it: a role
    # revoked since sign-in must not survive just because the old token said
    # so. If it is gone, fall back to whatever the account still holds.
    previous_role = None
    try:
        previous_role = decode_token(token).get("active_role")
    except ValueError:
        previous_role = None
    active_role = previous_role if previous_role in user.role_list else _default_role(user)

    return await _issue_session(user, db, response, active_role)


@router.post("/logout", status_code=status.HTTP_200_OK)
async def logout(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    token = read_refresh_cookie(request)
    if token:
        record = (
            await db.execute(select(RefreshToken).where(RefreshToken.token == token))
        ).scalar_one_or_none()
        if record:
            record.revoked = True
            await db.commit()
    clear_refresh_cookie(response)
    return {"message": "Logged out successfully"}


@router.post("/switch-role", response_model=TokenResponse)
async def switch_role(
    payload: dict,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Re-issue the session under a different role the account already holds.

    Exists so a dual-role account can move between the admin console and the
    normal workspace without re-entering a password. It goes through the same
    membership check as login, and mints a fresh access token rather than
    editing the old one - the client cannot change its own role by editing a
    stored value, because the role only ever comes from a server-signed token.
    """
    token = read_refresh_cookie(request)
    try:
        user = await consume_refresh_token(token, db)
    except RefreshError as e:
        clear_refresh_cookie(response)
        raise HTTPException(status_code=401, detail=str(e))

    active_role = _resolve_active_role(user, payload.get("role"))
    logger.bind(agent="system").info("{} switched to {}", user.username, active_role)
    return await _issue_session(user, db, response, active_role)

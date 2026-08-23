import json
import uuid
from fastapi import APIRouter, Request, Depends, HTTPException, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.core.oauth import oauth
from app.core.redis_client import redis_client
from app.core.security import create_access_token
from app.core.tokens import issue_refresh_token
from app.models.user import ROLE_ADMIN, ROLE_USER, STATUS_PENDING, STATUS_REJECTED, User
from app.models.oauth_account import OAuthAccount
from app.models.task import RefreshToken
from app.schemas.user import OAuthExchangeRequest, TokenResponse, UserOut
from app.config import settings
from app.services.admin_service import record_login
from datetime import datetime, timedelta, timezone

router = APIRouter(tags=["oauth"])

EXCHANGE_CODE_TTL_SECONDS = 60


@router.get("/auth/google/login")
async def google_login(request: Request):
    return await oauth.google.authorize_redirect(request, settings.GOOGLE_REDIRECT_URI)


@router.get("/auth/google/callback")
async def google_callback(request: Request, db: AsyncSession = Depends(get_db)):
    try:
        token = await oauth.google.authorize_access_token(request)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"OAuth exchange with Google failed: {e}")

    userinfo = token.get("userinfo") or await oauth.google.userinfo(token=token)
    provider_account_id = userinfo["sub"]
    email = userinfo["email"]

    # Find an existing link for this Google account, else find/create the User by email
    result = await db.execute(
        select(OAuthAccount).where(OAuthAccount.provider == "google", OAuthAccount.provider_account_id == provider_account_id)
    )
    oauth_account = result.scalar_one_or_none()

    if oauth_account:
        user_result = await db.execute(select(User).where(User.id == oauth_account.user_id))
        user = user_result.scalar_one_or_none()
    else:
        user_result = await db.execute(select(User).where(User.email == email))
        user = user_result.scalar_one_or_none()
        if not user:
            base_username = email.split("@")[0]
            username = base_username
            suffix = 1
            while (await db.execute(select(User).where(User.username == username))).scalar_one_or_none():
                username = f"{base_username}{suffix}"
                suffix += 1
            # A Google sign-in is a registration like any other: it creates a
            # pending account requesting the default role, and still needs an
            # admin to approve it. Skipping that here would make OAuth a way
            # around the approval gate.
            user = User(
                email=email,
                username=username,
                avatar_url=userinfo.get("picture"),
                hashed_password=None,
                requested_role=ROLE_USER,
                approval_status=STATUS_PENDING,
                roles="",
            )
            db.add(user)
            await db.flush()
        db.add(OAuthAccount(user_id=user.id, provider="google", provider_account_id=provider_account_id))

    await db.commit()
    await db.refresh(user)

    if user.approval_status == STATUS_PENDING:
        return RedirectResponse(url=f"{settings.FRONTEND_URL}/login?status=pending")
    if user.approval_status == STATUS_REJECTED or not user.role_list:
        return RedirectResponse(url=f"{settings.FRONTEND_URL}/login?status=denied")

    record_login(user)
    await db.commit()

    # Hand the frontend a one-time exchange code instead of putting tokens
    # straight in the redirect URL (they'd otherwise land in browser history
    # and server access logs). The code resolves to a *user id*, not to
    # tokens: the session is minted at exchange time, so no refresh token is
    # ever written to Redis or travels anywhere a script could read it.
    exchange_code = str(uuid.uuid4())
    await redis_client.set(
        f"oauth_exchange:{exchange_code}",
        json.dumps({"user_id": str(user.id)}),
        ex=EXCHANGE_CODE_TTL_SECONDS,
    )

    return RedirectResponse(url=f"{settings.FRONTEND_URL}/oauth/callback?code={exchange_code}")


@router.post("/auth/oauth/exchange", response_model=TokenResponse)
async def exchange_oauth_code(
    payload: OAuthExchangeRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    key = f"oauth_exchange:{payload.code}"
    raw = await redis_client.get(key)
    if not raw:
        raise HTTPException(status_code=400, detail="Exchange code is invalid, already used, or expired")
    await redis_client.delete(key)  # one-time use

    stored = json.loads(raw)
    user = (await db.execute(select(User).where(User.id == stored["user_id"]))).scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found")
    if not user.is_approved:
        raise HTTPException(status_code=403, detail="Your account is waiting for administrator approval.")

    # Same rule as password login: highest role the account holds.
    active_role = ROLE_ADMIN if user.has_role(ROLE_ADMIN) else user.role_list[0]
    access_token = create_access_token({"sub": str(user.id), "active_role": active_role})
    await issue_refresh_token(user, db, response, active_role)
    await db.commit()

    return TokenResponse(
        access_token=access_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        active_role=active_role,
        user=UserOut.model_validate(user),
    )

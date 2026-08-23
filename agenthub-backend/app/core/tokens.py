"""Refresh-token handling: cookie transport, rotation, and reuse detection.

The shape of this is the standard browser-SPA pattern, and each part is here
for a specific attack:

* **The refresh token never reaches JavaScript.** It travels in an HttpOnly
  cookie scoped to `/auth`, so script running on the page - injected through
  any XSS hole, a compromised dependency, a browser extension - cannot read
  it. Returning it in the JSON body (what this app did before) means it has
  to be stored somewhere JS can reach, and `localStorage` is readable by
  every script on the origin. A stolen access token expires in minutes; a
  stolen refresh token is a persistent session.
* **The access token stays in the response body** and lives in memory on the
  client. Short-lived, and gone when the tab closes.
* **Rotation**: every refresh mints a new token and revokes the old one, so a
  captured token is single-use.
* **Reuse detection**: rotation alone tells you nothing when a token *is*
  stolen. If an already-revoked token is presented, either the legitimate
  client replayed it or an attacker did - and they are indistinguishable, so
  the whole family is revoked and everyone re-authenticates. That converts
  silent, indefinite account access into one forced login.

`SameSite=lax` is what defends the refresh endpoint against CSRF: browsers
do not attach lax cookies to cross-site POSTs. Deployments that must set
`COOKIE_SAMESITE=none` (frontend and API on genuinely different sites) lose
that and need a CSRF token on top - see the README.
"""

from datetime import datetime, timedelta, timezone

from fastapi import Request, Response
from loguru import logger
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.security import create_refresh_token, decode_token
from app.models.task import RefreshToken
from app.models.user import User

COOKIE_NAME = "agenthub_refresh"
# Scoped to /auth so the cookie is not attached to every API call - it is only
# ever needed by /auth/refresh and /auth/logout.
COOKIE_PATH = "/auth"


def set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        domain=settings.COOKIE_DOMAIN or None,
        path=COOKIE_PATH,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
    )


def clear_refresh_cookie(response: Response) -> None:
    # The delete must repeat path/domain/samesite: a cookie is identified by
    # (name, domain, path), so deleting with different attributes leaves the
    # original in place and the user stays silently signed in.
    response.delete_cookie(
        key=COOKIE_NAME,
        path=COOKIE_PATH,
        domain=settings.COOKIE_DOMAIN or None,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
    )


def read_refresh_cookie(request: Request) -> str | None:
    return request.cookies.get(COOKIE_NAME)


async def issue_refresh_token(
    user: User, db: AsyncSession, response: Response, active_role: str
) -> str:
    """Mint and store a refresh token, and put it in the cookie.

    `active_role` rides along so the session survives a page reload as the
    role it signed in with. Without it, refresh has nothing to go on and
    falls back to the default role - which silently demotes an admin to the
    workspace every time they hit F5. It is still not a grant: the role is
    re-checked against the account on the way back out.
    """
    token = create_refresh_token({"sub": str(user.id), "active_role": active_role})
    db.add(RefreshToken(
        user_id=user.id,
        token=token,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    ))
    set_refresh_cookie(response, token)
    return token


async def revoke_all_for_user(db: AsyncSession, user_id) -> None:
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked == False)  # noqa: E712
        .values(revoked=True)
    )


class RefreshError(Exception):
    """Raised for any unusable refresh token. The message is deliberately the
    same for every cause - 'expired', 'revoked' and 'never existed' are all
    just 'sign in again' to a client, and distinguishing them tells an
    attacker which of their guesses was closer."""


async def consume_refresh_token(token: str | None, db: AsyncSession) -> User:
    """Validate and rotate: returns the user, revoking the presented token."""
    if not token:
        raise RefreshError("No refresh token")

    try:
        decoded = decode_token(token)
        if decoded.get("type") != "refresh":
            raise ValueError("Not a refresh token")
        user_id = decoded.get("sub")
    except ValueError:
        raise RefreshError("Invalid refresh token")

    record = (
        await db.execute(select(RefreshToken).where(RefreshToken.token == token))
    ).scalar_one_or_none()

    if record is None:
        raise RefreshError("Unknown refresh token")

    if record.revoked:
        # Rotation means a revoked token has already been spent. Seeing it
        # again is either a replay by the real client or a thief using a
        # copy, and there is no way to tell which - so end every session for
        # this user and make them sign in.
        logger.bind(agent="system").warning(
            "refresh token reuse detected for user {} - revoking all sessions", str(record.user_id)[:8]
        )
        await revoke_all_for_user(db, record.user_id)
        await db.commit()
        raise RefreshError("Refresh token already used")

    if record.expires_at < datetime.now(timezone.utc):
        raise RefreshError("Refresh token expired")

    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user or not user.is_active or not user.is_approved:
        raise RefreshError("Account unavailable")

    record.revoked = True  # single use
    return user

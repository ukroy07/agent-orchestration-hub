"""Grant roles and approve accounts from the command line.

    python -m scripts.set_role you@example.com admin
    python -m scripts.set_role you@example.com user,admin    # both
    python -m scripts.set_role someone@example.com user
    python -m scripts.set_role --list

Granting roles also approves the account: an account with roles but a
`pending` status could not sign in, which would make this command look
broken.

This is the only way to create the *first* admin, and that is deliberate.
The admin API can approve and promote people, but it requires an admin to
call it - so without an out-of-band path there would be no way to bootstrap
one. The alternatives were worse: auto-promoting the first account to
register is a race on a fresh database (whoever signs up first owns the
platform), and an ADMIN_EMAILS env allowlist puts the role in two places
that quietly drift apart. Running a script needs shell access to the
server, which is already a higher bar than either.
"""

import asyncio
import sys
from datetime import datetime, timezone

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.user import ROLES, STATUS_APPROVED, User


async def list_roles() -> int:
    async with AsyncSessionLocal() as db:
        users = (await db.execute(select(User).order_by(User.created_at))).scalars().all()
        if not users:
            print("No users registered yet.")
            return 0
        width = max(len(u.email) for u in users)
        print("{:<{w}}  {:<12}  {:<9}  {:<9}  {}".format(
            "EMAIL", "ROLES", "STATUS", "REQUESTED", "USERNAME", w=width))
        for u in users:
            print("{:<{w}}  {:<12}  {:<9}  {:<9}  {}".format(
                u.email, u.roles or "-", u.approval_status,
                u.requested_role or "-", u.username, w=width))
    return 0


async def set_roles(email: str, roles_arg: str) -> int:
    requested = [r.strip() for r in roles_arg.split(",") if r.strip()]
    unknown = [r for r in requested if r not in ROLES]
    if unknown or not requested:
        print("Roles must be a comma-separated subset of: {}".format(", ".join(ROLES)))
        return 2

    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if not user:
            print("No user with email {}. Register in the app first, then re-run.".format(email))
            return 1

        previous_roles, previous_status = user.roles, user.approval_status
        user.set_roles(requested)
        user.approval_status = STATUS_APPROVED
        user.approved_at = datetime.now(timezone.utc)
        await db.commit()

        print("{}: roles [{}] -> [{}], status {} -> {}".format(
            email, previous_roles or "none", user.roles, previous_status, user.approval_status))
        print("Sign out and back in - the app reads roles from the login response.")
    return 0


def main() -> int:
    args = sys.argv[1:]
    if args == ["--list"]:
        return asyncio.run(list_roles())
    if len(args) != 2:
        print(__doc__.strip().split("\n\n")[1])
        return 2
    return asyncio.run(set_roles(args[0], args[1]))


if __name__ == "__main__":
    raise SystemExit(main())

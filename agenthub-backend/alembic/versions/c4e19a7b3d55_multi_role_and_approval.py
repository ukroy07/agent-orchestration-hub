"""multi-role accounts and registration approval

Revision ID: c4e19a7b3d55
Revises: b7c41d92e08a
Create Date: 2026-08-23 03:05:00.000000

Replaces the single `role` column with a comma-separated `roles` column and
adds the approval workflow. The data migration matters: every account that
existed before this ran was, by definition, already usable - so it is
migrated to `approved` with its previous role preserved. Defaulting existing
rows to `pending` instead would lock every current user out of a running
system on deploy.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'c4e19a7b3d55'
down_revision: Union[str, None] = 'b7c41d92e08a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('roles', sa.String(length=100), nullable=False, server_default=''))
    op.add_column('users', sa.Column('requested_role', sa.String(length=20), nullable=True))
    op.add_column(
        'users',
        sa.Column('approval_status', sa.String(length=20), nullable=False, server_default='pending'),
    )
    op.add_column('users', sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('approved_by_id', sa.Uuid(), nullable=True))

    # Carry existing accounts across as approved, holding the role they had.
    op.execute("UPDATE users SET roles = role, requested_role = role, approval_status = 'approved'")

    op.drop_index(op.f('ix_users_role'), table_name='users')
    op.drop_column('users', 'role')


def downgrade() -> None:
    op.add_column('users', sa.Column('role', sa.String(length=20), nullable=False, server_default='user'))
    # Collapse back to a single role, preferring admin where both were held.
    op.execute("UPDATE users SET role = CASE WHEN roles LIKE '%admin%' THEN 'admin' ELSE 'user' END")
    op.create_index(op.f('ix_users_role'), 'users', ['role'], unique=False)

    op.drop_column('users', 'approved_by_id')
    op.drop_column('users', 'approved_at')
    op.drop_column('users', 'approval_status')
    op.drop_column('users', 'requested_role')
    op.drop_column('users', 'roles')

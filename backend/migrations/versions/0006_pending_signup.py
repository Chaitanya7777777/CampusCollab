"""Email-code registration before account creation."""

import sqlalchemy as sa
from alembic import op

revision = "0006_pending_signup"
down_revision = "0005_sample_projects"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "pending_registrations",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("password_hash", sa.String(512), nullable=False),
        sa.Column("code_digest", sa.String(64), nullable=False),
        sa.Column("failed_attempts", sa.Integer(), nullable=False),
        sa.Column("resend_count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True)),
        sa.Column("consumed_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("failed_attempts >= 0 AND resend_count >= 0", name="ck_pending_counts"),
        sa.CheckConstraint("email = lower(btrim(email))", name="ck_pending_email"),
    )
    op.create_index("ix_pending_email", "pending_registrations", ["email"])
    op.create_index("ix_pending_expiry", "pending_registrations", ["expires_at"])


def downgrade():
    op.drop_table("pending_registrations")

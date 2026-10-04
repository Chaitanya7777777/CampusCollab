"""Users, profiles, opaque sessions and controlled skills."""

import sqlalchemy as sa
from alembic import op

revision = "0001_identity"
down_revision = None
branch_labels = None
depends_on = None


def timestamp(name):
    return sa.Column(name, sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())


def upgrade():
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("password_hash", sa.String(512), nullable=False),
        timestamp("created_at"),
        timestamp("updated_at"),
        sa.UniqueConstraint("email", name="uq_users_email"),
        sa.CheckConstraint("email = lower(btrim(email))", name="ck_users_email_normalized"),
    )
    op.create_table(
        "profiles",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("campus", sa.String(100)),
        sa.Column("department", sa.String(100)),
        sa.Column("semester", sa.String(1)),
        sa.Column("bio", sa.String(300)),
        sa.Column("github", sa.String(300)),
        sa.Column("linkedin", sa.String(300)),
        sa.Column("website", sa.String(300)),
        timestamp("created_at"),
        timestamp("updated_at"),
        sa.CheckConstraint(
            "semester IN ('1','2','3','4','5','6','7','8')", name="ck_profile_semester"
        ),
    )
    op.create_table(
        "sessions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        timestamp("created_at"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_sessions_user_id", "sessions", ["user_id"])
    op.create_index("ix_sessions_expires_at", "sessions", ["expires_at"])
    op.create_table(
        "skills",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("slug", sa.String(80), nullable=False, unique=True),
        sa.Column("name", sa.String(80), nullable=False),
        timestamp("created_at"),
    )
    op.create_table(
        "user_skills",
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
        ),
        sa.Column(
            "skill_id", sa.Uuid(), sa.ForeignKey("skills.id", ondelete="RESTRICT"), primary_key=True
        ),
        timestamp("created_at"),
    )
    op.create_index("ix_user_skills_skill_id", "user_skills", ["skill_id"])


def downgrade():
    for table in ("user_skills", "skills", "sessions", "profiles", "users"):
        op.drop_table(table)

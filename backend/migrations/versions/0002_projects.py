"""Project creation, recruitment and membership storage; identity data is preserved."""

import sqlalchemy as sa
from alembic import op

revision = "0002_projects"
down_revision = "0001_identity"
branch_labels = None
depends_on = None


def timestamp(name):
    return sa.Column(name, sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())


def upgrade():
    op.create_table(
        "projects",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "owner_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("type", sa.String(30), nullable=False),
        sa.Column("event_name", sa.String(120), nullable=False),
        sa.Column("description", sa.String(1200), nullable=False),
        sa.Column("capacity", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(12), nullable=False),
        sa.Column("recruitment", sa.String(6), nullable=False),
        timestamp("created_at"),
        timestamp("updated_at"),
        sa.Column("published_at", sa.DateTime(timezone=True)),
        sa.Column("archived_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint(
            "capacity IS NULL OR capacity BETWEEN 2 AND 100", name="ck_projects_capacity"
        ),
        sa.CheckConstraint("status IN ('draft','published','archived')", name="ck_projects_status"),
        sa.CheckConstraint("recruitment IN ('open','closed')", name="ck_projects_recruitment"),
        sa.CheckConstraint(
            "status = 'published' OR recruitment = 'closed'", name="ck_projects_closed"
        ),
    )
    op.create_index("ix_projects_owner_id", "projects", ["owner_id"])
    op.create_index("ix_projects_status_published_at", "projects", ["status", "published_at"])
    op.create_table(
        "project_roles",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "project_id",
            sa.Uuid(),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(100), nullable=False),
        sa.Column("description", sa.String(600), nullable=False),
        sa.Column("positions", sa.Integer()),
        timestamp("created_at"),
        sa.UniqueConstraint("id", "project_id", name="uq_role_project"),
        sa.CheckConstraint(
            "positions IS NULL OR positions BETWEEN 1 AND 100", name="ck_role_positions"
        ),
    )
    op.create_index("ix_project_roles_project_id", "project_roles", ["project_id"])
    op.create_table(
        "role_required_skills",
        sa.Column(
            "role_id",
            sa.Uuid(),
            sa.ForeignKey("project_roles.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "skill_id", sa.Uuid(), sa.ForeignKey("skills.id", ondelete="RESTRICT"), primary_key=True
        ),
    )
    op.create_index("ix_role_required_skills_skill_id", "role_required_skills", ["skill_id"])
    op.create_table(
        "project_members",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "project_id",
            sa.Uuid(),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("role_id", sa.Uuid()),
        timestamp("joined_at"),
        sa.UniqueConstraint("project_id", "user_id", name="uq_project_member"),
        sa.ForeignKeyConstraint(
            ["role_id", "project_id"],
            ["project_roles.id", "project_roles.project_id"],
            name="fk_member_role_project",
            ondelete="RESTRICT",
        ),
    )
    op.create_index("ix_project_members_user_id", "project_members", ["user_id"])
    op.create_index("ix_project_members_role_id", "project_members", ["role_id"])


def downgrade():
    for table in ("project_members", "role_required_skills", "project_roles", "projects"):
        op.drop_table(table)

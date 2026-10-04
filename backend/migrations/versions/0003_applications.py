"""Application history and atomic team formation; existing records are preserved."""

import sqlalchemy as sa
from alembic import op

revision = "0003_applications"
down_revision = "0002_projects"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "applications",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "project_id",
            sa.Uuid(),
            sa.ForeignKey("projects.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("role_id", sa.Uuid(), nullable=False),
        sa.Column(
            "applicant_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("motivation", sa.String(2000), nullable=False),
        sa.Column("experience", sa.String(2000), nullable=False),
        sa.Column("portfolio", sa.String(300), nullable=False),
        sa.Column("status", sa.String(12), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("decided_at", sa.DateTime(timezone=True)),
        sa.Column("withdrawn_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("project_id", "applicant_id", name="uq_application_applicant_project"),
        sa.ForeignKeyConstraint(
            ["role_id", "project_id"],
            ["project_roles.id", "project_roles.project_id"],
            name="fk_application_role_project",
            ondelete="RESTRICT",
        ),
        sa.CheckConstraint(
            "status IN ('pending','accepted','rejected','withdrawn')", name="ck_application_status"
        ),
    )
    op.create_index(
        "ix_applications_project_status_created",
        "applications",
        ["project_id", "status", "created_at"],
    )
    op.create_index(
        "ix_applications_applicant_created", "applications", ["applicant_id", "created_at"]
    )
    op.create_index("ix_applications_role_id", "applications", ["role_id"])


def downgrade():
    op.drop_table("applications")

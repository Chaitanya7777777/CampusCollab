"""Explicit provenance for local illustrative records; existing rows remain real."""

import sqlalchemy as sa
from alembic import op

revision = "0005_sample_projects"
down_revision = "0004_auth_recovery"
branch_labels = None
depends_on = None


def upgrade():
    for table in ("users", "profiles", "projects", "project_roles", "project_members"):
        op.add_column(table, sa.Column("sample_seed", sa.String(40), nullable=True))
    op.create_check_constraint(
        "ck_sample_recruitment_closed",
        "projects",
        "sample_seed IS NULL OR recruitment = 'closed'",
    )


def downgrade():
    op.drop_constraint("ck_sample_recruitment_closed", "projects", type_="check")
    for table in ("project_members", "project_roles", "projects", "profiles", "users"):
        op.drop_column(table, "sample_seed")

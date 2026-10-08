"""Retain maintenance provenance after a seeded project becomes ordinary."""

import sqlalchemy as sa
from alembic import op

revision = "0007_project_conversion"
down_revision = "0006_pending_signup"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("projects", sa.Column("converted_seed", sa.String(40), nullable=True))


def downgrade():
    # Losing this provenance would make a seed rerun unsafe. Refuse the downgrade
    # once conversion has occurred instead of silently discarding its record.
    if op.get_bind().scalar(
        sa.text("SELECT EXISTS (SELECT 1 FROM projects WHERE converted_seed IS NOT NULL)")
    ):
        raise RuntimeError("Cannot discard converted-project provenance")
    op.drop_column("projects", "converted_seed")

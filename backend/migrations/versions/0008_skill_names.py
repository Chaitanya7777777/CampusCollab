"""Unique normalized skill names; retain all IDs and references."""

import sqlalchemy as sa
from alembic import context, op

from app.skill_names import SkillNormalizationCollision, normalize_skill

revision = "0008_skill_names"
down_revision = "0007_project_conversion"
branch_labels = None
depends_on = None


def upgrade():
    if context.is_offline_mode():
        raise RuntimeError("Skill normalization requires an online migration for collision checks")
    connection = op.get_bind()
    # No concurrent old seed can slip between backfill and the write guard.
    connection.execute(sa.text("LOCK TABLE skills IN ACCESS EXCLUSIVE MODE"))
    rows = connection.execute(sa.text("SELECT id, name FROM skills")).all()
    keys = {}
    values = []
    for id, name in rows:
        _, key = normalize_skill(name)
        keys.setdefault(key, []).append(id)
        values.append({"id": id, "key": key})
    collisions = [id for ids in keys.values() if len(ids) > 1 for id in ids]
    if collisions:
        raise SkillNormalizationCollision(collisions)
    op.add_column("skills", sa.Column("normalized_name", sa.String(240), nullable=True))
    if values:
        connection.execute(sa.text("UPDATE skills SET normalized_name=:key WHERE id=:id"), values)
    op.alter_column("skills", "normalized_name", nullable=False)
    op.create_unique_constraint("uq_skills_normalized_name", "skills", ["normalized_name"])
    # Old backends only read skills; old seed upserts the same existing slug/name.
    # Permit that exact legacy upsert, but refuse new legacy inserts and renames.
    connection.execute(
        sa.text("""
        CREATE FUNCTION guard_skill_normalization() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF TG_OP = 'UPDATE' AND NEW.name IS DISTINCT FROM OLD.name THEN
            RAISE EXCEPTION 'Skill catalog renaming is not supported' USING ERRCODE='23514';
          END IF;
          IF NEW.normalized_name IS NULL THEN
            IF TG_OP = 'UPDATE' AND NEW.name = OLD.name THEN
              NEW.normalized_name := OLD.normalized_name;
            ELSE
              SELECT normalized_name INTO NEW.normalized_name FROM skills
                WHERE slug = NEW.slug AND name = NEW.name;
            END IF;
          END IF;
          IF NEW.normalized_name IS NULL THEN
            RAISE EXCEPTION 'Normalized skill writer required' USING ERRCODE='23514';
          END IF;
          RETURN NEW;
        END $$;

    """)
    )
    op.execute(
        "CREATE TRIGGER skills_normalization_guard BEFORE INSERT OR UPDATE ON skills "
        "FOR EACH ROW EXECUTE FUNCTION guard_skill_normalization()"
    )


def downgrade():
    op.execute("DROP TRIGGER skills_normalization_guard ON skills")
    op.execute("DROP FUNCTION guard_skill_normalization()")
    op.drop_constraint("uq_skills_normalized_name", "skills", type_="unique")
    op.drop_column("skills", "normalized_name")

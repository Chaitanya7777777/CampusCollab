"""Explicit curated import. No account creation, updates, migrations or deletion."""

import argparse
import asyncio
import json
from datetime import UTC, datetime

from alembic.config import Config
from alembic.script import ScriptDirectory
from dotenv import dotenv_values
from sqlalchemy import select, text

from app.config import Settings
from app.convert_projects import DESCRIPTIONS
from app.database_url import connection_options
from app.db import database
from app.models import Profile, Project, ProjectMember, ProjectRole, Skill, User
from app.project_schemas import ProjectInput, RoleInput
from app.projects import save_values
from app.sample_projects import EXAMPLES, SEED, record_id
from app.startup_diagnostics import report


def definitions():
    return [
        ProjectInput(
            title=item[0],
            type=item[1],
            description=DESCRIPTIONS[i],
            capacity=4,
            roles=[
                RoleInput(
                    id=record_id("role", i, r),
                    title=title,
                    responsibilities=description,
                    skillIds=skills,
                    openings=1,
                )
                for r, (title, skills, description) in enumerate(item[5])
            ],
        )
        for i, item in enumerate(EXAMPLES)
    ]


async def import_projects(db, owner_email, *, apply=False):
    """All new records commit together. Existing IDs are never repaired or overwritten."""
    async with db.begin():
        if apply:
            await db.execute(text("SELECT pg_advisory_xact_lock(734820192)"))
        owner = await db.scalar(select(User).where(User.email == owner_email.strip().lower()))
        if not owner or owner.sample_seed or not owner.email_verified_at:
            raise ValueError("Select an existing verified, non-seed owner")
        profile = await db.scalar(select(Profile).where(Profile.user_id == owner.id))
        if not profile:
            raise ValueError("Owner profile required")
        skills = set(await db.scalars(select(Skill.slug)))
        plan = []
        for i, data in enumerate(definitions()):
            if not data.complete() or any(s not in skills for r in data.roles for s in r.skillIds):
                raise ValueError("Complete publication fields and catalog skills required")
            id = record_id("project", i)
            project = await db.get(Project, id)
            if project:
                action = (
                    "skip_existing"
                    if project.owner_id == owner.id
                    and project.converted_seed == SEED
                    and project.sample_seed is None
                    else "skip_conflict"
                )
            else:
                role_collision = await db.scalar(
                    select(ProjectRole.id)
                    .where(ProjectRole.id.in_([r.id for r in data.roles]))
                    .limit(1)
                )
                member_collision = await db.get(ProjectMember, record_id("member", i))
                action = "skip_conflict" if role_collision or member_collision else "create"
            plan.append(
                dict(
                    id=str(id),
                    title=data.title,
                    ownerId=str(owner.id),
                    ownerEmail=owner.email,
                    ownerName=profile.name,
                    capacity=data.capacity,
                    roles=[r.model_dump(mode="json") for r in data.roles],
                    action=action,
                    publication="published",
                    recruitment="open",
                    initialMembers=1,
                )
            )
            if apply and action == "create":
                project = Project(
                    id=id,
                    owner_id=owner.id,
                    title=data.title,
                    converted_seed=SEED,
                    sample_seed=None,
                )
                db.add(project)
                await db.flush()
                await save_values(db, project, data)
                db.add(
                    ProjectMember(
                        id=record_id("member", i),
                        project_id=id,
                        user_id=owner.id,
                        role_id=None,
                        sample_seed=None,
                    )
                )
                project.status = "published"
                project.recruitment = "open"
                project.published_at = datetime.now(UTC)
        return plan


def hosted_settings(path):
    values = dotenv_values(path)
    required = {
        "APP_ENV",
        "DATABASE_URL",
        "DATABASE_TLS",
        "CSRF_SECRET",
        "API_PROXY_SECRET",
        "FRONTEND_BASE_URL",
        "ALLOWED_ORIGINS",
        "ALLOWED_HOSTS",
        "COOKIE_SECURE",
        "COOKIE_SAMESITE",
        "EMAIL_PROVIDER",
        "BREVO_API_KEY",
        "BREVO_SENDER_EMAIL",
    }
    if not all(values.get(k) for k in required):
        raise ValueError("Hosted file is incomplete")
    parsed = {
        k.lower(): v
        for k, v in values.items()
        if v is not None and k.lower() in Settings.model_fields
    }
    for key in ("allowed_origins", "allowed_hosts", "trusted_proxy_networks"):
        if key in parsed:
            parsed[key] = json.loads(parsed[key])
    settings = Settings(_env_file=None, **parsed)
    url, _ = connection_options(settings.database_url.get_secret_value(), settings.database_tls)
    if (
        settings.app_env != "production"
        or not settings.database_tls
        or not url.host.endswith(".neon.tech")
        or "-pooler" in url.host
    ):
        raise ValueError("Expected explicitly configured direct Neon production target")
    return settings


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", default=".env.hosted")
    parser.add_argument("--owner-email", required=True)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--preview", action="store_true")
    mode.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    engine, factory = database(hosted_settings(args.env_file))
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SET TRANSACTION READ ONLY"))
            if await connection.scalar(text("SELECT current_database()")) != engine.url.database:
                raise ValueError("Database target mismatch")
            actual = set(
                (
                    await connection.execute(text("SELECT version_num FROM alembic_version"))
                ).scalars()
            )
            expected = set(ScriptDirectory.from_config(Config("alembic.ini")).get_heads())
            if actual != expected:
                raise ValueError("Migrations are not current; import refused")
            print(
                json.dumps(
                    {
                        "migrationCurrent": True,
                        "revision": sorted(actual),
                        "skillCount": len(list(await connection.scalars(select(Skill.id)))),
                    }
                )
            )
        async with factory() as db:
            plan = await import_projects(db, args.owner_email, apply=args.apply)
            print(json.dumps(plan, indent=2))
    finally:
        await engine.dispose()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as exc:
        report(exc, "curated_project_import")
        raise SystemExit(1) from None

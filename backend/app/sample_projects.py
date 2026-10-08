"""Explicit local-only examples. No startup seeding, passwords or outgoing email."""

import argparse
import asyncio
from datetime import UTC, datetime, timedelta
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import select, text
from sqlalchemy.engine import make_url

from app.config import Settings
from app.db import database
from app.models import (
    Application,
    Profile,
    Project,
    ProjectMember,
    ProjectRole,
    RoleSkill,
    Skill,
    User,
)

SEED = "campuscollab-samples-v1"
# All names, colleges, event names and proposed work below are fictional.
EXAMPLES = [
    (
        "WasteWise Campus",
        "Hackathon",
        "Mira Vale",
        "Willowbridge College",
        "Prototype a camera-assisted waste sorting guide for a fictional campus. "
        "Compare image classification with a simple manual lookup and design "
        "accessible feedback. The example scope includes a small labelled dataset, a "
        "React interface and a short evaluation report.",
        [
            ("Frontend Developer", ["react", "typescript"], "Build an accessible sorting guide."),
            (
                "Computer Vision Contributor",
                ["python", "opencv"],
                "Evaluate a small image dataset.",
            ),
        ],
    ),
    (
        "Study Circle Planner",
        "Personal Project",
        "Arun Linden",
        "Northmere Institute",
        "Design a study-group planner that lets students suggest topics and compare "
        "available meeting times. Explore a clear calendar interface, conflict "
        "detection and a PostgreSQL data model using synthetic schedules. No real "
        "student calendars are connected.",
        [
            (
                "Full Stack Developer",
                ["next-js", "postgresql"],
                "Model groups and meeting proposals.",
            ),
            ("Product Designer", ["figma"], "Prototype the scheduling interaction."),
        ],
    ),
    (
        "Quiet Routes Study",
        "Research",
        "Leena Wren",
        "Cedarfield University",
        "Investigate how a campus route planner might balance distance and noise "
        "exposure. Use synthetic walking paths and simulated sensor observations, "
        "document assumptions and compare routing heuristics. This is an illustrative "
        "research proposal, not an ongoing study involving people.",
        [
            (
                "Data Researcher",
                ["python"],
                "Compare routing heuristics with reproducible notebooks.",
            ),
            (
                "Documentation Contributor",
                ["technical-writing", "git"],
                "Explain methods and limitations.",
            ),
        ],
    ),
    (
        "BorrowBox",
        "Startup",
        "Dev Rowan",
        "Willowbridge College",
        "Explore a student equipment-lending concept for books, tools and lab "
        "accessories. Sketch item availability, borrowing requests and return "
        "reminders in a clickable prototype. Validate the data model using fictional "
        "inventory; this sample represents a concept, not an operating business.",
        [
            (
                "API Developer",
                ["fastapi", "postgresql"],
                "Design inventory and borrowing contracts.",
            ),
            ("Interface Designer", ["figma", "react"], "Prototype the lending journey."),
        ],
    ),
    (
        "Accessible Lab Notes",
        "Open Source",
        "Nila Ash",
        "Fernhaven College",
        "Create a proposed Markdown toolkit for readable laboratory notes. The scope "
        "includes accessible templates, keyboard-friendly navigation and examples of "
        "reproducible experiment records. All contributors and repository plans are "
        "illustrative; there is no external repository to join.",
        [
            ("Web Contributor", ["typescript", "tailwind-css"], "Build accessible note templates."),
            (
                "Technical Writer",
                ["technical-writing", "git"],
                "Write beginner-friendly example notes.",
            ),
        ],
    ),
    (
        "Greenhouse Telemetry",
        "Hackathon",
        "Ishan Brook",
        "Northmere Institute",
        "Prototype a dashboard for a fictional campus greenhouse using simulated "
        "temperature and humidity readings. Connect an ESP32-style data stream to an "
        "MQTT consumer and display trends. Focus on sensor validation and clear "
        "failure states rather than claims of live environmental monitoring.",
        [
            (
                "Embedded Contributor",
                ["esp32", "mqtt"],
                "Generate and validate simulated sensor readings.",
            ),
            (
                "Dashboard Developer",
                ["react", "python"],
                "Visualize readings and connection failures.",
            ),
        ],
    ),
    (
        "Offline Campus Map",
        "Personal Project",
        "Tara Moss",
        "Cedarfield University",
        "Build an offline-first mobile map for a made-up campus, including building "
        "search and accessible route notes. Use a small bundled map dataset to explore "
        "caching, navigation and readable labels. Locations and accessibility notes "
        "are fictional and must not be used for real travel.",
        [
            ("Mobile Developer", ["react-native", "expo"], "Implement offline building search."),
            ("UX Contributor", ["figma"], "Test map readability with synthetic locations."),
        ],
    ),
    (
        "Low-Power Robot Bench",
        "Research",
        "Ravi Alder",
        "Fernhaven College",
        "Compare navigation strategies in a simulated indoor robot course. Record "
        "repeatable runs, estimated energy use and mapping quality using a documented "
        "benchmark. The sample proposes simulation work only and does not claim access "
        "to robotics hardware or an active university lab.",
        [
            (
                "Robotics Contributor",
                ["ros2", "slam", "linux"],
                "Set up reproducible simulation runs.",
            ),
            ("Experiment Analyst", ["python", "c--"], "Compare results and document uncertainty."),
        ],
    ),
    (
        "Campus API Starter",
        "Open Source",
        "Sana Reed",
        "Willowbridge College",
        "Design a starter kit that teaches students how to build small, well-tested "
        "APIs. Include example endpoints, local Docker setup and documentation using "
        "entirely fictional records. The intended outcome is a teaching prototype; "
        "this sample has no live service or active maintainer team.",
        [
            (
                "Backend Contributor",
                ["fastapi", "docker", "postgresql"],
                "Create small testable API examples.",
            ),
            (
                "Documentation Contributor",
                ["technical-writing", "git"],
                "Explain local setup and request flows.",
            ),
        ],
    ),
]


def record_id(kind, index, role=0):
    return uuid5(NAMESPACE_URL, f"https://campuscollab.local/{SEED}/{kind}/{index}/{role}")


def guard_local(settings):
    """CLI may only address this repository's local development Compose service."""
    url = make_url(settings.database_url.get_secret_value())
    if (
        settings.app_env != "development"
        or url.drivername != "postgresql+asyncpg"
        or url.host not in ("localhost", "127.0.0.1", "::1")
        or url.port != 5432
        or url.database != "campuscollab"
        or url.username != "campuscollab"
        or url.query
    ):
        raise RuntimeError("Refusing sample operation: expected local development Compose database")


async def seed_samples(db):
    """One transaction, serialized across seed processes. Never overwrite existing rows."""
    async with db.begin():
        await db.execute(text("SELECT pg_advisory_xact_lock(734820192)"))
        skills = {s.slug: s.id for s in await db.scalars(select(Skill))}
        required = {slug for item in EXAMPLES for _, slugs, _ in item[5] for slug in slugs}
        if not required <= skills.keys():
            raise RuntimeError("Seed the skill catalog before sample projects")
        for index, (title, kind, name, campus, description, roles) in enumerate(EXAMPLES):
            owner_id, project_id = record_id("owner", index), record_id("project", index)
            existing_project = await db.get(Project, project_id)
            if existing_project and existing_project.converted_seed == SEED:
                # Converted records belong to their real owner. Never repair, reopen,
                # reset provenance or overwrite roles/applications/memberships.
                continue
            expected = [
                (User, owner_id),
                (Profile, record_id("profile", index)),
                (Project, project_id),
                (ProjectMember, record_id("member", index)),
            ]
            expected += [(ProjectRole, record_id("role", index, r)) for r in range(len(roles))]
            existing = [await db.get(model, id) for model, id in expected]
            if any(row is not None for row in existing):
                if not all(row is not None and row.sample_seed == SEED for row in existing):
                    raise RuntimeError(
                        "Sample identifier collision or incomplete seed; no changes saved"
                    )
                continue
            created = datetime(2026, 9, 1, 12, tzinfo=UTC) + timedelta(days=index)
            # Deliberately not a password hash. Auth excludes marked identities before
            # password verification, session restoration and token issuance/consumption.
            db.add(
                User(
                    id=owner_id,
                    email=f"sample-{index + 1}@samples.example.com",
                    password_hash="!disabled-sample-identity",
                    sample_seed=SEED,
                    created_at=created,
                    updated_at=created,
                )
            )
            await db.flush()
            db.add(
                Profile(
                    id=record_id("profile", index),
                    user_id=owner_id,
                    name=name,
                    campus=campus,
                    department="Computing",
                    semester="5",
                    bio="Fictional student used only to illustrate a sample project.",
                    sample_seed=SEED,
                    created_at=created,
                    updated_at=created,
                )
            )
            db.add(
                Project(
                    id=project_id,
                    owner_id=owner_id,
                    title=title,
                    type=kind,
                    description=description,
                    capacity=4,
                    status="published",
                    recruitment="closed",
                    event_name="",
                    sample_seed=SEED,
                    created_at=created,
                    updated_at=created + timedelta(hours=1),
                    published_at=created + timedelta(hours=1),
                )
            )
            await db.flush()
            db.add(
                ProjectMember(
                    id=record_id("member", index),
                    project_id=project_id,
                    user_id=owner_id,
                    sample_seed=SEED,
                    joined_at=created,
                )
            )
            for r, (role_title, slugs, responsibilities) in enumerate(roles):
                role_id = record_id("role", index, r)
                db.add(
                    ProjectRole(
                        id=role_id,
                        project_id=project_id,
                        title=role_title,
                        description=responsibilities,
                        positions=1,
                        sample_seed=SEED,
                        created_at=created,
                    )
                )
                await db.flush()
                db.add_all(RoleSkill(role_id=role_id, skill_id=skills[slug]) for slug in slugs)


async def removal_preview(db):
    """Read-only removal manifest. Both provenance and stable IDs must match."""
    # Exclude the whole group if it has converted or acquired any real data.
    eligible = []
    for i in range(len(EXAMPLES)):
        project = await db.get(Project, record_id("project", i))
        if not project or project.sample_seed != SEED or project.converted_seed:
            continue
        if await db.scalar(
            select(Application.id).where(Application.project_id == project.id).limit(1)
        ):
            continue
        members = list(
            await db.scalars(select(ProjectMember).where(ProjectMember.project_id == project.id))
        )
        roles = list(
            await db.scalars(select(ProjectRole).where(ProjectRole.project_id == project.id))
        )
        if any(
            m.sample_seed != SEED
            or m.id != record_id("member", i)
            or m.user_id != record_id("owner", i)
            for m in members
        ):
            continue
        if any(
            r.sample_seed != SEED
            or r.id not in {record_id("role", i, n) for n in range(len(EXAMPLES[i][5]))}
            for r in roles
        ):
            continue
        eligible.append(i)
    project_ids = [record_id("project", i) for i in eligible]
    result = {}
    for model, kind in (
        (ProjectMember, "member"),
        (ProjectRole, "role"),
        (Project, "project"),
        (Profile, "profile"),
        (User, "owner"),
    ):
        ids = [
            record_id(kind, i, r)
            for i in eligible
            for r in (range(len(EXAMPLES[i][5])) if kind == "role" else range(1))
        ]
        if kind in ("owner", "profile"):
            safe_ids = []
            for i in eligible:
                owner = record_id("owner", i)
                outside = await db.scalar(
                    select(Project.id)
                    .where(Project.owner_id == owner, Project.id.not_in(project_ids))
                    .limit(1)
                )
                membership = await db.scalar(
                    select(ProjectMember.id)
                    .where(
                        ProjectMember.user_id == owner, ProjectMember.project_id.not_in(project_ids)
                    )
                    .limit(1)
                )
                application = await db.scalar(
                    select(Application.id).where(Application.applicant_id == owner).limit(1)
                )
                if not outside and not membership and not application:
                    safe_ids.append(record_id(kind, i))
            ids = safe_ids
        result[model.__tablename__] = [
            str(id)
            for id in await db.scalars(
                select(model.id)
                .where(model.sample_seed == SEED, model.id.in_(ids))
                .order_by(model.id)
            )
        ]
    return result


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("seed", "remove"))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if args.action == "remove" and not args.dry_run:
        parser.error("Removal is preview-only: use remove --dry-run. No deletion is implemented.")
    if args.action == "seed" and args.dry_run:
        parser.error("Use seed to insert examples, or remove --dry-run to preview removal scope.")
    settings = Settings()
    guard_local(settings)
    engine, factory = database(settings)
    try:
        async with factory() as db:
            identity = (await db.execute(text("SELECT current_database(), current_user"))).one()
            if tuple(identity) != ("campuscollab", "campuscollab"):
                raise RuntimeError("Connected database identity does not match local development")
            await db.rollback()
            if args.action == "seed":
                await seed_samples(db)
                print("Seed complete. Existing and converted records preserved without changes.")
            else:
                for table, ids in (await removal_preview(db)).items():
                    print(f"{table}: {len(ids)} explicitly seeded records: {', '.join(ids)}")
                print(
                    "Read-only preview. Role-skill links depend on the listed roles. "
                    "Nothing deleted."
                )
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())

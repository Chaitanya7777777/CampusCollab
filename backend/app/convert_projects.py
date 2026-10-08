"""Explicit local conversion of seeded projects to normal, account-owned projects."""

import argparse
import asyncio
import json
from datetime import UTC, datetime

from sqlalchemy import select, text

from app.config import Settings
from app.db import database
from app.models import Application, Profile, Project, ProjectMember, ProjectRole, RoleSkill, User
from app.sample_projects import EXAMPLES, SEED, guard_local, record_id

# Only replace the unchanged original seed copy. Never overwrite owner-written text.
DESCRIPTIONS = [
    (
        "Build a camera-assisted waste sorting guide. Compare image classification with a "
        "manual lookup, prepare a labelled dataset and create an accessible React interface "
        "with an evaluation report."
    ),
    (
        "Build a study-group planner where students suggest topics and compare meeting times. "
        "Develop a calendar interface, conflict detection and a PostgreSQL data model, "
        "starting with synthetic schedules."
    ),
    (
        "Investigate how a campus route planner can balance distance and noise exposure. Use "
        "synthetic paths and simulated sensor observations to compare routing heuristics and "
        "document their limitations."
    ),
    (
        "Prototype an equipment-lending service for books, tools and lab accessories. Design "
        "inventory availability, borrowing requests and returns, and validate the model with "
        "synthetic inventory."
    ),
    (
        "Build a Markdown toolkit for accessible laboratory notes. Create readable templates, "
        "keyboard-friendly navigation and documentation for reproducible experiment records."
    ),
    (
        "Prototype a greenhouse telemetry dashboard using simulated temperature and humidity "
        "readings. Connect an ESP32-style stream to an MQTT consumer and visualize trends and "
        "connection failures."
    ),
    (
        "Build an offline-first campus map with building search and accessible route notes. "
        "Start with a synthetic bundled map to explore caching, navigation and readable "
        "labels before adding real locations."
    ),
    (
        "Compare navigation strategies in a simulated indoor robot course. Record "
        "reproducible runs, estimated energy use and mapping quality in a documented "
        "benchmark; hardware is not required."
    ),
    (
        "Build an API starter kit for student projects. Include tested endpoints, local "
        "Docker setup and beginner-friendly documentation using synthetic records."
    ),
]


async def convert_projects(db, owner_email, *, apply=False):
    """Preview or apply all nine in one transaction. Lock order matches API writes.

    The seed advisory lock prevents a concurrent seed run; sorted project locks
    serialize with application acceptance/recruitment changes. No user is created.
    A second run never reopens recruitment or changes an already converted owner.
    """
    async with db.begin():
        if apply:
            await db.execute(text("SELECT pg_advisory_xact_lock(734820192)"))
        owner = await db.scalar(select(User).where(User.email == owner_email.strip().lower()))
        if not owner or owner.sample_seed or not owner.email_verified_at:
            raise ValueError("Select an existing verified, non-seed owner account")
        profile = await db.scalar(select(Profile).where(Profile.user_id == owner.id))
        if not profile:
            raise ValueError("Owner profile is missing")
        ids = {record_id("project", i): i for i in range(len(EXAMPLES))}
        query = select(Project).where(Project.id.in_(ids)).order_by(Project.id)
        if apply:
            query = query.with_for_update()
        projects = list(await db.scalars(query))
        if len(projects) != len(ids):
            raise ValueError("Expected all nine existing seeded projects; nothing converted")
        plan = []
        for project in projects:
            index = ids[project.id]
            converted = project.converted_seed == SEED and project.sample_seed is None
            if converted and project.owner_id != owner.id:
                raise ValueError("Already converted to another owner; ownership transfer refused")
            if not converted and (project.sample_seed != SEED or project.converted_seed):
                raise ValueError("Project provenance mismatch; nothing converted")
            roles = list(
                await db.scalars(
                    select(ProjectRole)
                    .where(ProjectRole.project_id == project.id)
                    .order_by(ProjectRole.id)
                )
            )
            members = list(
                await db.scalars(
                    select(ProjectMember)
                    .where(ProjectMember.project_id == project.id)
                    .order_by(ProjectMember.id)
                )
            )
            old_owner = await db.get(Profile, record_id("profile", index))
            former = next((m for m in members if m.id == record_id("member", index)), None)
            if not converted:
                seeded_user = await db.get(User, record_id("owner", index))
                if (
                    project.owner_id != record_id("owner", index)
                    or not seeded_user
                    or seeded_user.sample_seed != SEED
                    or not former
                    or former.user_id != seeded_user.id
                    or former.sample_seed != SEED
                    or former.role_id is not None
                ):
                    raise ValueError("Former seeded owner membership is not safe to replace")
                # Even inconsistent historical applications must never be erased.
                if await db.scalar(
                    select(Application.id)
                    .where(
                        Application.project_id == project.id,
                        Application.applicant_id == former.user_id,
                    )
                    .limit(1)
                ):
                    raise ValueError(
                        "Former seed owner has application history; manual review required"
                    )
            retained = [m for m in members if converted or m is not former]
            existing_owner = next((m for m in retained if m.user_id == owner.id), None)
            after_count = len(retained) + (0 if existing_owner else 1)
            role_ids = {r.id for r in roles}
            if any(m.role_id and m.role_id not in role_ids for m in retained):
                raise ValueError("Membership role mismatch")
            if project.capacity is not None and after_count > project.capacity:
                raise ValueError("Team capacity exceeded; nothing converted")
            if (
                project.capacity is not None
                and sum(r.positions or 0 for r in roles) > project.capacity - 1
            ):
                raise ValueError("Role capacity exceeds team capacity; nothing converted")
            occupancy = {r.id: sum(m.role_id == r.id for m in retained) for r in roles}
            if any(occupancy[r.id] > (r.positions or 0) for r in roles):
                raise ValueError("Role capacity exceeded; nothing converted")
            skill_roles = set(
                await db.scalars(select(RoleSkill.role_id).where(RoleSkill.role_id.in_(role_ids)))
            )
            complete = bool(
                project.type
                and project.description
                and project.capacity
                and roles
                and all(r.title and r.positions and r.id in skill_roles for r in roles)
            )
            available = (
                complete
                and after_count < project.capacity
                and any(occupancy[r.id] < r.positions for r in roles)
            )
            recruitment = (
                project.recruitment
                if converted
                else ("open" if project.status == "published" and available else "closed")
            )
            description_change = not converted and project.description == EXAMPLES[index][4]
            plan.append(
                dict(
                    id=str(project.id),
                    title=project.title,
                    status=project.status,
                    currentOwner=dict(
                        id=str(project.owner_id),
                        name=profile.name
                        if converted
                        else old_owner.name
                        if old_owner
                        else "Missing profile",
                    ),
                    newOwner=dict(id=str(owner.id), name=profile.name, email=owner.email),
                    memberships=[
                        dict(
                            id=str(m.id),
                            userId=str(m.user_id),
                            roleId=str(m.role_id) if m.role_id else None,
                        )
                        for m in members
                    ],
                    memberCountBefore=len(members),
                    memberCountAfter=after_count,
                    capacity=project.capacity,
                    roles=[
                        dict(
                            id=str(r.id),
                            title=r.title,
                            positions=r.positions,
                            occupied=occupancy[r.id],
                        )
                        for r in roles
                    ],
                    recruitmentBefore=project.recruitment,
                    recruitmentAfter=recruitment,
                    changes=[]
                    if converted
                    else [
                        "Transfer ownership",
                        "Replace only the original seeded owner membership"
                        if not existing_owner
                        else "Remove original seeded membership; keep existing owner membership",
                        "Remove sample behavior and retain maintenance provenance",
                    ]
                    + (
                        ["Replace unchanged illustrative description with project proposal"]
                        if description_change
                        else []
                    ),
                )
            )
            if apply and not converted:
                if existing_owner:
                    await db.delete(former)
                else:
                    former.user_id = owner.id
                    former.sample_seed = None
                    former.joined_at = datetime.now(UTC)
                project.owner_id = owner.id
                project.converted_seed = SEED
                project.sample_seed = None
                project.recruitment = recruitment
                project.updated_at = datetime.now(UTC)
                if description_change:
                    project.description = DESCRIPTIONS[index]
        # All changes commit together on context exit; any later validation failure
        # rolls back even earlier flushed projects. Preview never assigns ORM fields.
        return plan


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--owner-email", required=True)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true")
    mode.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    settings = Settings()
    guard_local(settings)
    engine, factory = database(settings)
    try:
        async with factory() as db:
            identity = (await db.execute(text("SELECT current_database(), current_user"))).one()
            if tuple(identity) != ("campuscollab", "campuscollab"):
                raise RuntimeError("Unexpected connected database identity")
            await db.rollback()
            plan = await convert_projects(db, args.owner_email, apply=args.apply)
            print(json.dumps(dict(applied=args.apply, projects=plan), indent=2))
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())

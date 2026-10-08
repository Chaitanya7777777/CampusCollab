import asyncio
from uuid import UUID

import pytest
from sqlalchemy import func, select

from app.convert_projects import convert_projects
from app.models import Application, Project, ProjectMember, ProjectRole, User
from app.sample_projects import SEED, record_id, removal_preview, seed_samples
from tests.conftest import register, unsafe
from tests.test_applications import account, apply
from tests.test_projects import login_as

pytestmark = pytest.mark.integration


async def setup(client, app):
    owner = (await register(client, "operator@example.com")).json()["id"]
    async with app.state.session_factory() as db:
        await seed_samples(db)
    return UUID(owner)


async def test_preview_conversion_repeat_seed_rerun_and_cleanup(client, database_app):
    owner = await setup(client, database_app)
    async with database_app.state.session_factory() as db:
        preview = await convert_projects(db, "operator@example.com")
        assert len(preview) == 9 and all(p["recruitmentAfter"] == "open" for p in preview)
        assert all(p["memberCountAfter"] == 1 for p in preview)
        assert (await db.get(Project, record_id("project", 0))).sample_seed == SEED
        await db.rollback()
        applied = await convert_projects(db, "operator@example.com", apply=True)
        assert applied == preview
        p = await db.get(Project, record_id("project", 0))
        assert p.owner_id == owner and p.sample_seed is None and p.converted_seed == SEED
        p.recruitment = "closed"
        p.description = "Owner's edited description must survive every maintenance command."
        await db.commit()
        again = await convert_projects(db, "operator@example.com", apply=True)
        assert all(not p["changes"] for p in again)
        await seed_samples(db)
        await db.refresh(p)
        assert p.recruitment == "closed" and p.description.startswith("Owner's")
        assert all(not ids for ids in (await removal_preview(db)).values())
        assert await db.scalar(select(func.count()).select_from(ProjectMember)) == 9
        assert (
            await db.scalar(select(func.count()).select_from(User).where(User.sample_seed == SEED))
            == 9
        )
        assert (await db.get(User, record_id("owner", 0))).email_verified_at is None
    mine = (await client.get("/api/v1/projects/mine")).json()
    assert len(mine["owned"]) == 9
    page = (await client.get("/api/v1/projects?openingsOnly=true")).json()
    assert page["total"] == 8
    assert all(not p["isSample"] and p["ownerId"] == str(owner) for p in page["projects"])


@pytest.mark.parametrize("invalid", ["team", "role"])
async def test_invalid_capacity_rolls_back_all_projects(client, database_app, invalid):
    await setup(client, database_app)
    other = UUID((await register(client, "member@example.com")).json()["id"])
    async with database_app.state.session_factory() as db:
        # Last in lock order ensures earlier mutations have already been flushed.
        p = await db.scalar(select(Project).order_by(Project.id.desc()).limit(1))
        if invalid == "role":
            p.capacity = 2  # Two role positions cannot fit alongside the owner.
        else:
            p.capacity = 2
            roles = list(
                await db.scalars(select(ProjectRole).where(ProjectRole.project_id == p.id))
            )
            for role in roles:
                role.positions = None
            db.add_all(
                [
                    ProjectMember(project_id=p.id, user_id=other),
                    ProjectMember(
                        project_id=p.id,
                        user_id=record_id("owner", 1 if p.owner_id != record_id("owner", 1) else 2),
                    ),
                ]
            )
        await db.commit()
        with pytest.raises(ValueError, match="capacity"):
            await convert_projects(db, "operator@example.com", apply=True)
        assert (
            await db.scalar(
                select(func.count()).select_from(Project).where(Project.sample_seed == SEED)
            )
            == 9
        )
        assert (
            await db.scalar(
                select(func.count()).select_from(Project).where(Project.converted_seed.is_not(None))
            )
            == 0
        )


async def test_preserve_real_members_existing_owner_and_states(client, database_app):
    owner = await setup(client, database_app)
    member = UUID((await register(client, "member@example.com")).json()["id"])
    async with database_app.state.session_factory() as db:
        db.add_all(
            [
                ProjectMember(project_id=record_id("project", 0), user_id=owner),
                ProjectMember(
                    project_id=record_id("project", 0),
                    user_id=member,
                    role_id=record_id("role", 0, 0),
                ),
            ]
        )
        (await db.get(Project, record_id("project", 1))).status = "draft"
        (await db.get(Project, record_id("project", 2))).status = "archived"
        await db.commit()
        await convert_projects(db, "operator@example.com", apply=True)
        members = list(
            await db.scalars(
                select(ProjectMember).where(ProjectMember.project_id == record_id("project", 0))
            )
        )
        assert {m.user_id for m in members} == {owner, member}
        assert next(m for m in members if m.user_id == member).role_id == record_id("role", 0, 0)
        for index, state in ((1, "draft"), (2, "archived")):
            p = await db.get(Project, record_id("project", index))
            assert p.status == state and p.recruitment == "closed"
        await db.rollback()
        await seed_samples(db)
        await db.rollback()
        with pytest.raises(ValueError, match="another owner"):
            await convert_projects(db, "member@example.com", apply=True)


async def test_converted_real_workflow_privacy_and_competing_acceptance(client, database_app):
    await setup(client, database_app)
    async with database_app.state.session_factory() as db:
        await convert_projects(db, "operator@example.com", apply=True)
    project, role = str(record_id("project", 0)), str(record_id("role", 0, 0))
    path = f"/projects/{project}/applications"
    applications = []
    for email in ("first@example.com", "second@example.com"):
        await register(client, email)
        response = await apply(client, project, role)
        assert response.status_code == 201
        applications.append(response.json()["id"])
        assert (await apply(client, project, role)).status_code == 409
        assert (await client.get("/api/v1" + path)).status_code == 404
    assert (await client.get(f"/api/v1/applications/{applications[0]}")).status_code == 404
    await login_as(client, "operator@example.com")
    assert (await client.get("/api/v1" + path)).json()["counts"]["pending"] == 2
    async with (
        account(database_app, "operator@example.com") as a,
        account(database_app, "operator@example.com") as b,
    ):
        outcomes = await asyncio.gather(
            unsafe(a, "POST", f"{path}/{applications[0]}/accept"),
            unsafe(b, "POST", f"{path}/{applications[1]}/accept"),
        )
    assert sorted(r.status_code for r in outcomes) == [200, 409]
    winner = next(i for i, r in enumerate(outcomes) if r.status_code == 200)
    assert (
        await unsafe(client, "POST", f"{path}/{applications[winner]}/accept")
    ).status_code == 409
    assert (
        await unsafe(client, "POST", f"{path}/{applications[1 - winner]}/reject")
    ).status_code == 200
    detail = (await client.get(f"/api/v1/projects/{project}")).json()
    assert detail["memberCount"] == 2 and detail["openings"] == 1
    assert next(r for r in detail["roles"] if r["id"] == role)["openings"] == 0
    await login_as(client, ("first@example.com", "second@example.com")[winner])
    assert (await client.get(f"/api/v1/applications/{applications[winner]}")).json()["isMember"]
    await register(client, "withdraw@example.com")
    pending = await apply(client, project, str(record_id("role", 0, 1)))
    assert pending.status_code == 201
    id = pending.json()["id"]
    assert (await unsafe(client, "POST", f"/applications/{id}/withdraw")).status_code == 200
    assert (await apply(client, project, str(record_id("role", 0, 1)))).status_code == 409
    await login_as(client, "operator@example.com")
    assert (await unsafe(client, "POST", f"{path}/{id}/accept")).status_code == 409
    async with database_app.state.session_factory() as db:
        await seed_samples(db)
        assert await db.scalar(select(func.count()).select_from(Application)) == 3
        assert str(record_id("project", 0)) not in (await removal_preview(db))["projects"]


async def test_owner_validation_and_cleanup_preserves_real_dependencies(client, database_app):
    owner = await setup(client, database_app)
    async with database_app.state.session_factory() as db:
        for email in ("missing@example.com", "sample-1@samples.example.com"):
            with pytest.raises(ValueError, match="verified"):
                await convert_projects(db, email, apply=True)
        user = await db.get(User, owner)
        user.email_verified_at = None
        db.add(ProjectMember(project_id=record_id("project", 0), user_id=owner))
        await db.commit()
        with pytest.raises(ValueError, match="verified"):
            await convert_projects(db, "operator@example.com", apply=True)
        preview = await removal_preview(db)
        assert str(record_id("project", 0)) not in preview["projects"]
        assert str(record_id("role", 0, 0)) not in preview["project_roles"]

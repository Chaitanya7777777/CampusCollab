import asyncio
from copy import deepcopy
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Profile, Project, ProjectMember, ProjectRole, RoleSkill, Session, Skill, User
from tests.conftest import register, unsafe

pytestmark = pytest.mark.integration


def values(title="Campus Garden"):
    return dict(
        title=title,
        type="Research",
        eventName="Campus Lab",
        description="Build a useful campus garden monitoring project together.",
        capacity=4,
        roles=[
            dict(
                id=str(uuid4()),
                title="Backend Developer",
                responsibilities="Build the API",
                skillIds=["python"],
                openings=2,
            )
        ],
    )


async def create(client, data=None, publish=False):
    return await unsafe(
        client, "POST", f"/projects?publish={str(publish).lower()}", json=data or values()
    )


async def login_as(client, email):
    response = await unsafe(
        client,
        "POST",
        "/auth/login",
        json={"email": email, "password": "fictional-test-password-123"},
    )
    assert response.status_code == 200


async def counts(app):
    async with app.state.session_factory() as db:
        return [
            await db.scalar(select(func.count()).select_from(m))
            for m in (Project, ProjectRole, ProjectMember, RoleSkill)
        ]


async def test_project_draft_publication_identity_and_atomic_records(client, database_app):
    actor = (await register(client)).json()["id"]
    response = await create(client, {"title": "Incomplete draft"})
    assert response.status_code == 201, response.text
    project = response.json()
    id = project["id"]
    assert project["status"] == "draft" and project["recruitment"] == "closed"
    assert await counts(database_app) == [1, 0, 1, 0]
    assert (await client.get("/api/v1/projects")).json()["total"] == 0
    assert (await client.get(f"/api/v1/projects/{id}")).status_code == 404
    assert (await client.get(f"/api/v1/projects/{id}/draft")).json()["values"]["capacity"] is None
    assert (
        await unsafe(client, "POST", f"/projects/{id}/publish", json={"title": "Incomplete draft"})
    ).status_code == 422
    data = values()
    result = await unsafe(client, "PATCH", f"/projects/{id}/draft", json=data)
    assert result.status_code == 200, result.text
    result = await unsafe(client, "POST", f"/projects/{id}/publish", json=data)
    assert result.status_code == 200, result.text
    assert result.json()["id"] == id and result.json()["recruitment"] == "open"
    assert await counts(database_app) == [1, 1, 1, 1]
    detail = (await client.get(f"/api/v1/projects/{id}")).json()
    assert detail["ownerId"] == actor and detail["memberCount"] == 1 and detail["openings"] == 2
    assert detail["team"][0]["student"]["id"] == actor
    assert detail["team"][0]["membership"]["roleId"] is None
    assert (
        "email" not in str(detail)
        and "password" not in str(detail)
        and "session" not in str(detail)
    )
    assert (await unsafe(client, "POST", f"/projects/{id}/publish", json=data)).status_code == 409
    assert (await unsafe(client, "PATCH", f"/projects/{id}/draft", json=data)).status_code == 409
    assert await counts(database_app) == [1, 1, 1, 1]


async def test_project_permissions_owner_spoofing_and_csrf(client, database_app):
    assert (await client.get("/api/v1/projects")).status_code == 401
    await register(client, "owner@example.com")
    assert (await client.post("/api/v1/projects", json=values())).status_code == 403
    draft = (await create(client)).json()["id"]
    published = (await create(client, publish=True)).json()["id"]
    other = (await register(client, "other@example.com")).json()["id"]
    assert (await create(client, {**values(), "ownerId": other})).status_code == 422
    for path in (f"/{draft}/draft", f"/{draft}", f"/{published}/manage"):
        assert (await client.get("/api/v1/projects" + path)).status_code == 404
    for method, path, data in [
        ("PATCH", f"/{draft}/draft", values()),
        ("POST", f"/{draft}/publish", values()),
        ("PATCH", f"/{published}/recruitment", {"recruitment": "closed"}),
        ("POST", f"/{published}/archive", None),
    ]:
        result = await unsafe(
            client, method, "/projects" + path, **({"json": data} if data else {})
        )
        assert result.status_code == 404, result.text
    assert (await client.get(f"/api/v1/projects/{published}")).status_code == 200
    assert (await client.get("/api/v1/projects/mine")).json() == {"owned": [], "joined": []}
    assert await counts(database_app) == [2, 2, 2, 2]


async def test_invalid_skills_capacity_and_failed_update_leave_no_partial_state(
    client, database_app
):
    await register(client)
    invalid = []
    for patch in [{"capacity": 1}, {"capacity": 2}, {"capacity": 2.5}, {"type": "Invalid"}]:
        invalid.append({**values(), **patch})
    data = values()
    data["roles"][0]["skillIds"] = ["not-catalog"]
    invalid.append(data)
    for data in invalid:
        result = await create(client, data)
        assert result.status_code == 422, result.text
        assert await counts(database_app) == [0, 0, 0, 0]
    data = values()
    id = (await create(client, data)).json()["id"]
    changed = deepcopy(data)
    changed["title"] = "Should rollback"
    changed["roles"][0]["skillIds"] = ["invalid"]
    assert (await unsafe(client, "PATCH", f"/projects/{id}/draft", json=changed)).status_code == 422
    assert (await client.get(f"/api/v1/projects/{id}/draft")).json()["values"] == data
    assert await counts(database_app) == [1, 1, 1, 1]
    for patch in [{"type": ""}, {"description": ""}, {"roles": []}, {"capacity": None}]:
        assert (await create(client, {**values(), **patch}, True)).status_code == 422
    for patch in [{"title": ""}, {"skillIds": []}, {"openings": None}]:
        data = values()
        data["roles"][0].update(patch)
        assert (await create(client, data, True)).status_code == 422


async def test_discovery_server_filters_counts_pages_and_membership_occupancy(client, database_app):
    owner = (await register(client)).json()["id"]
    await unsafe(client, "PATCH", "/profiles/me", json={"campus": "Campus One"})
    first = values("A Garden")
    first["roles"].append(dict(id=str(uuid4()), title="Designer", skillIds=["figma"], openings=1))
    first_id = (await create(client, first, True)).json()["id"]
    second = values("B Garden")
    second["type"] = "Hackathon"
    second_id = (await create(client, second, True)).json()["id"]
    await create(client, values("Private draft"))

    async def listing(**params):
        response = await client.get("/api/v1/projects", params=params)
        assert response.status_code == 200, response.text
        return response.json()

    assert (await listing())["total"] == 2
    assert (await listing(search="figma"))["total"] == 1
    assert (await listing(search="backend"))["total"] == 2
    assert (await listing(search="%"))["total"] == 0
    assert (await listing(type="Hackathon"))["total"] == 1
    assert (await listing(campus="Campus One"))["total"] == 2
    assert (await listing(role="Designer", skill="python"))["total"] == 0
    assert (await listing(role="Designer", skill="figma"))["total"] == 1
    page1 = await listing(sort="title", pageSize=1)
    page2 = await listing(sort="title", pageSize=1, page=2)
    assert (
        page1["total"] == 2
        and page1["projects"][0]["id"] == first_id
        and page2["projects"][0]["id"] == second_id
    )
    assert (await listing(sort="oldest"))["projects"][0]["id"] == first_id
    assert (await listing(sort="newest"))["projects"][0]["id"] == second_id
    assert (await listing(sort="openings"))["projects"][0]["id"] == first_id
    assert (await client.get("/api/v1/projects?pageSize=1000")).status_code == 422
    await unsafe(
        client, "PATCH", f"/projects/{first_id}/recruitment", json={"recruitment": "closed"}
    )
    assert (await listing(openingsOnly=True))["total"] == 1
    assert (await listing(role="Designer"))["total"] == 0
    await unsafe(client, "PATCH", "/profiles/me", json={"campus": "Campus Two"})
    assert (await listing(campus="Campus One"))["total"] == 0
    assert (await listing(campus="Campus Two"))["total"] == 2
    # Membership counts are derived, including role occupancy and owner exclusion from Joined.
    member = (await register(client, "member@example.com")).json()["id"]
    async with database_app.state.session_factory() as db:
        from uuid import UUID

        db.add(
            ProjectMember(
                project_id=UUID(second_id),
                user_id=UUID(member),
                role_id=UUID(second["roles"][0]["id"]),
            )
        )
        await db.commit()
    detail = (await client.get(f"/api/v1/projects/{second_id}")).json()
    assert detail["memberCount"] == 2 and detail["roles"][0]["openings"] == 1
    assert (await client.get("/api/v1/projects/mine")).json()["joined"][0]["id"] == second_id
    await login_as(client, "student@example.com")
    mine = (await client.get("/api/v1/projects/mine")).json()
    assert len(mine["owned"]) == 3 and mine["joined"] == []
    assert mine["owned"][0]["memberCount"] >= 1
    assert owner != member


async def test_archive_preserves_records_and_limits_access(client, database_app):
    await register(client)
    id = (await create(client, publish=True)).json()["id"]
    before = await counts(database_app)
    response = await unsafe(client, "POST", f"/projects/{id}/archive")
    assert response.status_code == 200 and response.json()["recruitment"] == "closed"
    assert response.json()["archivedAt"]
    assert await counts(database_app) == before
    assert (await client.get("/api/v1/projects")).json()["total"] == 0
    assert (await client.get(f"/api/v1/projects/{id}/manage")).status_code == 200
    assert (
        await unsafe(client, "PATCH", f"/projects/{id}/recruitment", json={"recruitment": "open"})
    ).status_code == 409
    assert (await unsafe(client, "POST", f"/projects/{id}/archive")).status_code == 409
    member = (await register(client, "member@example.com")).json()["id"]
    assert (await client.get(f"/api/v1/projects/{id}")).status_code == 404
    async with database_app.state.session_factory() as db:
        from uuid import UUID

        db.add(ProjectMember(project_id=UUID(id), user_id=UUID(member)))
        await db.commit()
    assert (await client.get(f"/api/v1/projects/{id}")).status_code == 200
    assert (await client.get(f"/api/v1/projects/{id}/manage")).status_code == 404


async def test_composite_foreign_key_and_role_identity_prevent_cross_project_links(
    client, database_app
):
    from uuid import UUID

    actor = UUID((await register(client)).json()["id"])
    one = values()
    one_id = (await create(client, one)).json()["id"]
    two = values()
    two_id = (await create(client, two)).json()["id"]
    before = await counts(database_app)
    data = values()
    data["roles"][0]["id"] = one["roles"][0]["id"]
    assert (
        await unsafe(client, "PATCH", f"/projects/{two_id}/draft", json=data)
    ).status_code == 422
    async with database_app.state.session_factory() as db:
        db.add(
            ProjectMember(
                project_id=UUID(one_id), user_id=actor, role_id=UUID(two["roles"][0]["id"])
            )
        )
        with pytest.raises(IntegrityError):
            await db.commit()
        await db.rollback()
    # Use a different user to ensure the composite FK, not uniqueness, rejects this.
    other = UUID((await register(client, "other@example.com")).json()["id"])
    async with database_app.state.session_factory() as db:
        db.add(
            ProjectMember(
                project_id=UUID(one_id), user_id=other, role_id=UUID(two["roles"][0]["id"])
            )
        )
        with pytest.raises(IntegrityError):
            await db.commit()
        await db.rollback()
    assert await counts(database_app) == before


async def test_concurrent_publish_and_archive_recruitment_are_serialized(client, database_app):
    await register(client)
    data = values()
    id = (await create(client, data)).json()["id"]

    async def mutate(path, body=None, method="POST"):
        async with AsyncClient(
            transport=ASGITransport(app=database_app),
            base_url="http://localhost:8000",
            headers={"Origin": "http://localhost:3000"},
            cookies=client.cookies,
        ) as other:
            return await unsafe(other, method, path, **({"json": body} if body else {}))

    results = await asyncio.gather(
        mutate(f"/projects/{id}/publish", data), mutate(f"/projects/{id}/publish", data)
    )
    assert sorted(r.status_code for r in results) == [200, 409]
    assert await counts(database_app) == [1, 1, 1, 1]
    results = await asyncio.gather(
        mutate(f"/projects/{id}/archive"),
        mutate(f"/projects/{id}/recruitment", {"recruitment": "open"}, "PATCH"),
    )
    assert results[0].status_code == 200 and results[1].status_code in (200, 409)
    detail = (await client.get(f"/api/v1/projects/{id}")).json()
    assert detail["status"] == "archived" and detail["recruitment"] == "closed"


async def test_failed_commit_rolls_back_project_and_roles(client, database_app, monkeypatch):
    await register(client)
    data = values()
    id = (await create(client, data)).json()["id"]
    before = await counts(database_app)

    async def fail(*args, **kwargs):
        raise SQLAlchemyError("simulated failure")

    with monkeypatch.context() as patch:
        patch.setattr(AsyncSession, "commit", fail)
        assert (await create(client, values("failed"))).status_code == 503
        changed = values("Changed")
        assert (
            await unsafe(client, "PATCH", f"/projects/{id}/draft", json=changed)
        ).status_code == 503
        assert (
            await unsafe(client, "POST", f"/projects/{id}/publish", json=data)
        ).status_code == 503
    assert await counts(database_app) == before
    assert (await client.get(f"/api/v1/projects/{id}/draft")).json()["values"] == data


async def test_upgrade_existing_identity_schema_preserves_accounts_sessions_and_catalog(
    client, database_app
):
    # The guarded fixture owns only the dedicated test database.
    await register(client)
    await unsafe(
        client, "PATCH", "/profiles/me", json={"campus": "Preserved Campus", "skillIds": ["react"]}
    )
    async with database_app.state.engine.begin() as connection:
        config = Config(str(Path(__file__).parents[1] / "alembic.ini"))

        def downgrade(conn):
            config.attributes["connection"] = conn
            command.downgrade(config, "0001_identity")

        await connection.run_sync(downgrade)
    async with database_app.state.session_factory() as db:
        before = [list(await db.scalars(select(m.id))) for m in (User, Profile, Session, Skill)]
    async with database_app.state.engine.begin() as connection:

        def upgrade(conn):
            config.attributes["connection"] = conn
            command.upgrade(config, "head")

        await connection.run_sync(upgrade)
        assert (
            await connection.scalar(text("SELECT version_num FROM alembic_version"))
            == "0003_applications"
        )
    async with database_app.state.session_factory() as db:
        after = [list(await db.scalars(select(m.id))) for m in (User, Profile, Session, Skill)]
    assert before == after
    profile = (await client.get("/api/v1/profiles/me")).json()
    assert profile["campus"] == "Preserved Campus" and profile["skillIds"] == ["react"]
    assert (await client.get("/api/v1/auth/me")).status_code == 200
    assert (await create(client, publish=True)).status_code == 201


async def test_has_openings_requires_both_team_and_role_capacity(client, database_app):
    from uuid import UUID

    await register(client)
    role_full = values("Role full")
    role_full["roles"][0]["openings"] = 1
    team_full = values("Team full")
    team_full["capacity"] = 2
    team_full["roles"][0]["openings"] = 1
    one = (await create(client, role_full, True)).json()["id"]
    two = (await create(client, team_full, True)).json()["id"]
    member = UUID((await register(client, "slot-member@example.com")).json()["id"])
    async with database_app.state.session_factory() as db:
        db.add(
            ProjectMember(
                project_id=UUID(one), user_id=member, role_id=UUID(role_full["roles"][0]["id"])
            )
        )
        db.add(ProjectMember(project_id=UUID(two), user_id=member))
        await db.commit()
    result = await client.get("/api/v1/projects", params={"openingsOnly": "true"})
    assert result.status_code == 200 and result.json()["total"] == 0
    for id in (one, two):
        result = await client.get(f"/api/v1/projects/{id}")
        assert result.json()["openings"] == 0 and result.json()["memberCount"] == 2

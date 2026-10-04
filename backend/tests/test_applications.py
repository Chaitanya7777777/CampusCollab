import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Application, Project, ProjectMember, ProjectRole
from tests.conftest import register, unsafe
from tests.test_projects import create, login_as, values

pytestmark = pytest.mark.integration


def submission(role):
    return dict(
        roleId=role,
        motivation="I would like to contribute to this useful campus project and learn together.",
        experience="I have built and tested several student software projects.",
        portfolio="https://example.com/work",
    )


async def setup(client, capacity=3):
    await register(client, "owner@example.com")
    data = values()
    data["capacity"] = capacity
    data["roles"][0]["openings"] = capacity - 1
    project = (await create(client, data, True)).json()["id"]
    await register(client, "applicant@example.com")
    return project, data["roles"][0]["id"]


async def apply(client, project, role):
    return await unsafe(client, "POST", f"/projects/{project}/applications", json=submission(role))


@asynccontextmanager
async def account(app, email):
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://localhost:8000",
        headers={"Origin": "http://localhost:3000"},
    ) as client:
        await login_as(client, email)
        yield client


async def test_submission_privacy_validation_membership_and_terminal_state(client, database_app):
    project, role = await setup(client)
    path = f"/projects/{project}/applications"
    assert (await client.post("/api/v1" + path, json=submission(role))).status_code == 403
    assert (
        await unsafe(client, "POST", path, json={**submission(role), "applicantId": str(uuid4())})
    ).status_code == 422
    assert (
        await unsafe(client, "POST", path, json={**submission(role), "motivation": "short"})
    ).status_code == 422
    assert (await apply(client, project, str(uuid4()))).status_code == 422
    response = await apply(client, project, role)
    assert response.status_code == 201, response.text
    a = response.json()["id"]
    assert (await apply(client, project, role)).status_code == 409
    assert (await client.get("/api/v1" + path)).status_code == 404
    assert (await client.get(f"/api/v1/applications/{a}")).status_code == 200
    await register(client, "unrelated@example.com")
    assert (await client.get(f"/api/v1/applications/{a}")).status_code == 404
    assert (await client.get("/api/v1" + path + "/" + a)).status_code == 404
    assert (await unsafe(client, "POST", path + "/" + a + "/accept")).status_code == 404
    assert (await unsafe(client, "POST", f"/applications/{a}/withdraw")).status_code == 404
    await login_as(client, "owner@example.com")
    inbox = (await client.get("/api/v1" + path)).json()
    assert inbox["counts"]["pending"] == 1
    entry = inbox["applications"][0]
    assert entry["missingSkills"] and not entry["sharedSkills"]
    assert not any(word in str(entry) for word in ["email", "password_hash", "token_hash"])
    assert (await client.get(f"/api/v1/applications/{a}")).status_code == 404
    assert (await unsafe(client, "POST", path + "/" + a + "/accept")).status_code == 200
    assert (await unsafe(client, "POST", path + "/" + a + "/accept")).status_code == 409
    await login_as(client, "applicant@example.com")
    detail = (await client.get(f"/api/v1/applications/{a}")).json()
    assert detail["isMember"] and detail["application"]["status"] == "accepted"
    assert detail["application"]["decidedAt"] and detail["application"]["withdrawnAt"] is None
    assert (await unsafe(client, "POST", f"/applications/{a}/withdraw")).status_code == 409
    assert (await client.get(f"/api/v1/projects/{project}")).json()["memberCount"] == 2
    # Ordinary members cannot read another applicant's private inbox.
    assert (await client.get("/api/v1" + path)).status_code == 404
    async with database_app.state.session_factory() as db:
        assert await db.scalar(select(func.count()).select_from(ProjectMember)) == 2


@pytest.mark.parametrize("decision", ["reject", "withdraw"])
async def test_closed_archived_and_reapplication(client, decision):
    project, role = await setup(client)
    a = (await apply(client, project, role)).json()["id"]
    await login_as(client, "owner@example.com")
    await unsafe(
        client, "PATCH", f"/projects/{project}/recruitment", json={"recruitment": "closed"}
    )
    assert (
        await unsafe(client, "POST", f"/projects/{project}/applications/{a}/accept")
    ).status_code == 409
    assert (await client.get(f"/api/v1/projects/{project}/applications")).json()["counts"][
        "pending"
    ] == 1
    if decision == "reject":
        assert (
            await unsafe(client, "POST", f"/projects/{project}/applications/{a}/reject")
        ).status_code == 200
    await unsafe(client, "POST", f"/projects/{project}/archive")
    assert (
        await unsafe(client, "POST", f"/projects/{project}/applications/{a}/reject")
    ).status_code == 409
    await login_as(client, "applicant@example.com")
    result = await unsafe(client, "POST", f"/applications/{a}/withdraw")
    assert result.status_code == (200 if decision == "withdraw" else 409)
    detail = (await client.get(f"/api/v1/applications/{a}")).json()
    assert detail["projectHref"] is None and detail["projectStatus"] == "archived"
    if decision == "withdraw":
        assert detail["application"]["withdrawnAt"] and detail["application"]["decidedAt"] is None
    assert (await unsafe(client, "POST", f"/applications/{a}/withdraw")).status_code == 409


async def test_concurrent_duplicate_submission(client, database_app):
    project, role = await setup(client)
    async with account(database_app, "applicant@example.com") as other:
        results = await asyncio.gather(apply(client, project, role), apply(other, project, role))
    assert sorted(r.status_code for r in results) == [201, 409]
    assert (await client.get("/api/v1/applications")).json()["counts"]["all"] == 1


@pytest.mark.parametrize("race", ["accept", "withdraw", "close", "archive"])
async def test_independent_transactions_race(client, database_app, race):
    project, role = await setup(client, 2)
    a = (await apply(client, project, role)).json()["id"]
    await register(client, "second@example.com")
    b = (await apply(client, project, role)).json()["id"]
    await login_as(client, "owner@example.com")
    async with account(
        database_app, "applicant@example.com" if race == "withdraw" else "owner@example.com"
    ) as other:
        if race == "accept":
            competing = unsafe(other, "POST", f"/projects/{project}/applications/{b}/accept")
        elif race == "withdraw":
            competing = unsafe(other, "POST", f"/applications/{a}/withdraw")
        elif race == "close":
            competing = unsafe(
                other, "PATCH", f"/projects/{project}/recruitment", json={"recruitment": "closed"}
            )
        else:
            competing = unsafe(other, "POST", f"/projects/{project}/archive")
        results = await asyncio.gather(
            unsafe(client, "POST", f"/projects/{project}/applications/{a}/accept"), competing
        )
    codes = sorted(r.status_code for r in results)
    assert (
        codes == [200, 409] if race in ("accept", "withdraw") else codes in ([200, 200], [200, 409])
    )
    async with database_app.state.session_factory() as db:
        records = list(await db.scalars(select(Application)))
        members = list(await db.scalars(select(ProjectMember)))
        accepted = [a for a in records if a.status == "accepted"]
        assert len(members) == 1 + len(accepted) <= 2
        assert all(any(m.user_id == a.applicant_id for m in members) for a in accepted)


async def test_atomic_failed_acceptance_and_counts(client, database_app, monkeypatch):
    project, role = await setup(client)
    a = (await apply(client, project, role)).json()["id"]
    await login_as(client, "owner@example.com")

    async def fail(self):
        await self.flush()
        raise SQLAlchemyError("test write failure")

    with monkeypatch.context() as patch:
        patch.setattr(AsyncSession, "commit", fail)
        result = await unsafe(client, "POST", f"/projects/{project}/applications/{a}/accept")
        assert result.status_code == 503
    async with database_app.state.session_factory() as db:
        assert (await db.scalar(select(Application))).status == "pending"
        assert await db.scalar(select(func.count()).select_from(ProjectMember)) == 1
    result = (
        await client.get(
            f"/api/v1/projects/{project}/applications?search=nomatch&status=accepted&pageSize=1"
        )
    ).json()
    assert (
        result["counts"]["all"] == 1 and result["counts"]["pending"] == 1 and result["total"] == 0
    )
    assert (
        await client.get(f"/api/v1/projects/{project}/applications?pageSize=51")
    ).status_code == 422


async def test_withdrawn_cannot_accept_and_history_without_membership(client, database_app):
    project, role = await setup(client)
    a = (await apply(client, project, role)).json()["id"]
    await unsafe(client, "POST", f"/applications/{a}/withdraw")
    assert (await apply(client, project, role)).status_code == 409
    await login_as(client, "owner@example.com")
    assert (
        await unsafe(client, "POST", f"/projects/{project}/applications/{a}/accept")
    ).status_code == 409
    await register(client, "second@example.com")
    b = (await apply(client, project, role)).json()["id"]
    await login_as(client, "owner@example.com")
    await unsafe(client, "POST", f"/projects/{project}/applications/{b}/accept")
    # Simulate historical accepted state without membership, not a product removal endpoint.
    async with database_app.state.session_factory() as db:
        member = await db.scalar(select(ProjectMember).where(ProjectMember.role_id.is_not(None)))
        await db.delete(member)
        await db.commit()
    await login_as(client, "second@example.com")
    detail = (await client.get(f"/api/v1/applications/{b}")).json()
    assert detail["application"]["status"] == "accepted" and not detail["isMember"]


@pytest.mark.parametrize("full", ["role", "team"])
async def test_full_capacity_refuses_acceptance(client, database_app, full):
    project, role = await setup(client, 3)
    a = (await apply(client, project, role)).json()["id"]
    await login_as(client, "owner@example.com")
    # A separately provisioned existing membership is counted, never a mutable counter.
    async with database_app.state.session_factory() as db:
        p = await db.scalar(select(Project).with_for_update())
        r = await db.scalar(select(ProjectRole))
        if full == "role":
            r.positions = 1
        else:
            p.capacity = 2
        # Owner's contribution can occupy a role without changing administrative authority.
        member = await db.scalar(select(ProjectMember))
        if full == "role":
            member.role_id = r.id
        else:
            p.capacity = 2
            await register(client, "member@example.com")
            user = (await client.get("/api/v1/auth/me")).json()["id"]
            from uuid import UUID

            db.add(ProjectMember(project_id=p.id, user_id=UUID(user)))
        await db.commit()
    await login_as(client, "owner@example.com")
    response = await unsafe(client, "POST", f"/projects/{project}/applications/{a}/accept")
    assert response.status_code == 409
    assert full in response.json()["detail"].lower()


async def test_application_pages_counts_sort_role_and_unauthenticated(client, database_app):
    assert (await client.get("/api/v1/applications")).status_code == 401
    project, role = await setup(client)
    first = (await apply(client, project, role)).json()["id"]
    await login_as(client, "owner@example.com")
    second_values = values("Different Search Title")
    second = (await create(client, second_values, True)).json()["id"]
    await login_as(client, "applicant@example.com")
    last = (await apply(client, second, second_values["roles"][0]["id"])).json()["id"]
    await unsafe(client, "POST", f"/applications/{last}/withdraw")
    response = (await client.get("/api/v1/applications?pageSize=1&sort=oldest")).json()
    assert response["total"] == 2 and response["applications"][0]["application"]["id"] == first
    response = (await client.get("/api/v1/applications?pageSize=1&sort=newest")).json()
    assert response["applications"][0]["application"]["id"] == last
    response = (await client.get("/api/v1/applications?search=Different&status=withdrawn")).json()
    assert (
        response["total"] == 1
        and response["counts"]["all"] == 2
        and response["counts"]["pending"] == 1
    )
    await login_as(client, "owner@example.com")
    response = (
        await client.get(f"/api/v1/projects/{project}/applications?roleId={uuid4()}")
    ).json()
    assert response["total"] == 0 and response["counts"]["pending"] == 1
    assert (
        await client.post(f"/api/v1/projects/{project}/applications/{first}/accept")
    ).status_code == 403
    assert (await client.get(f"/api/v1/projects/{second}/applications/{first}")).status_code == 404


async def test_upgrade_project_schema_preserves_projects_roles_memberships(client, database_app):
    await register(client)
    project = (await create(client, publish=True)).json()["id"]
    async with database_app.state.engine.begin() as connection:
        config = Config(str(Path(__file__).parents[1] / "alembic.ini"))

        def migrate(conn):
            config.attributes["connection"] = conn
            command.downgrade(config, "0002_projects")
            command.upgrade(config, "head")

        await connection.run_sync(migrate)
    detail = (await client.get(f"/api/v1/projects/{project}")).json()
    assert detail["memberCount"] == 1 and detail["roles"][0]["positions"] == 2
    assert (await client.get("/api/v1/auth/me")).status_code == 200

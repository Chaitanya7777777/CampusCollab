from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

from app.models import AuthToken, Project, ProjectMember, ProjectRole, Session, User
from app.projects import change_state
from app.recovery import consume, issue
from app.sample_projects import (
    EXAMPLES,
    SEED,
    guard_local,
    record_id,
    removal_preview,
    seed_samples,
)
from app.security import new_token, token_hash
from tests.conftest import settings, unsafe, verified_register
from tests.test_projects import create, values


def test_sample_cli_refuses_hosted_and_test_targets():
    for url in (
        "postgresql+asyncpg://campuscollab:x@host.example.com:5432/campuscollab",
        "postgresql+asyncpg://campuscollab_test:x@127.0.0.1:5433/campuscollab_test",
        "postgresql+asyncpg://campuscollab:x@127.0.0.1:5432/campuscollab?host=elsewhere",
    ):
        config = settings(url).model_copy(update={"app_env": "development"})
        with pytest.raises(RuntimeError, match="expected local"):
            guard_local(config)
    guard_local(
        settings("postgresql+asyncpg://campuscollab:x@127.0.0.1:5432/campuscollab").model_copy(
            update={"app_env": "development"}
        )
    )


@pytest.mark.integration
async def test_seed_idempotence_filters_permissions_and_real_regression(client, database_app):
    await verified_register(client)
    real = (await create(client, publish=True)).json()
    factory = database_app.state.session_factory
    async with factory() as db:
        await seed_samples(db)
        first = await removal_preview(db)
        await db.rollback()
        await seed_samples(db)
        assert await removal_preview(db) == first
        assert {k: len(v) for k, v in first.items()} == {
            "project_members": 9,
            "project_roles": 18,
            "projects": 9,
            "profiles": 9,
            "users": 9,
        }
        assert await db.scalar(select(func.count()).select_from(Project)) == 10
    page1 = (await client.get("/api/v1/projects?pageSize=5&page=1&sort=oldest")).json()
    page2 = (await client.get("/api/v1/projects?pageSize=5&page=2&sort=oldest")).json()
    assert page1["total"] == page2["total"] == 10
    assert len({p["id"] for p in page1["projects"] + page2["projects"]}) == 10
    samples = [p for p in page1["projects"] + page2["projects"] if p["isSample"]]
    assert len(samples) == 9
    assert {p["type"] for p in samples} == {e[1] for e in EXAMPLES}
    assert all(
        p["memberCount"] == 1
        and p["capacity"] == 4
        and p["openings"] == 0
        and p["recruitment"] == "closed"
        for p in samples
    )
    assert all(r["openings"] == 0 and r["positions"] == 1 for p in samples for r in p["roles"])
    available = (await client.get("/api/v1/projects?openingsOnly=true")).json()
    assert [p["id"] for p in available["projects"]] == [real["id"]]
    assert (await client.get("/api/v1/projects?role=Computer%20Vision%20Contributor")).json()[
        "total"
    ] == 0
    assert (await client.get("/api/v1/projects?search=WasteWise")).json()["total"] == 1
    assert (await client.get("/api/v1/projects?type=Open%20Source")).json()["total"] == 2
    assert (await client.get("/api/v1/projects?skill=opencv")).json()["total"] == 1
    mine = (await client.get("/api/v1/projects/mine")).json()
    assert len(mine["owned"]) == 1 and mine["joined"] == []
    sample = samples[0]
    detail = (await client.get(f"/api/v1/projects/{sample['id']}")).json()
    assert detail["eligibility"] == "Recruitment is closed."
    result = await unsafe(
        client,
        "POST",
        f"/projects/{sample['id']}/applications",
        json={
            "roleId": sample["roles"][0]["id"],
            "motivation": "m" * 50,
            "experience": "e" * 20,
        },
    )
    assert result.status_code == 403 and result.json()["detail"] == "Sample projects are read-only"
    assert (await unsafe(client, "POST", f"/projects/{sample['id']}/archive")).status_code == 404
    async with factory() as db:
        # Defense in depth: even a service call using the seeded owner cannot mutate it.
        with pytest.raises(HTTPException) as error:
            await change_state(db, record_id("project", 0), record_id("owner", 0), "open")
        assert error.value.status_code == 403
    data = values()
    for field in ("isSample", "sample_seed", "converted_seed"):
        assert (await create(client, {**data, field: SEED})).status_code == 422
    # Ordinary real owners retain management; sample seeding never overwrites their project.
    assert (
        await unsafe(
            client, "PATCH", f"/projects/{real['id']}/recruitment", json={"recruitment": "closed"}
        )
    ).status_code == 200


@pytest.mark.integration
async def test_sample_identity_cannot_login_restore_or_recover(client, database_app):
    factory = database_app.state.session_factory
    async with factory() as db:
        await seed_samples(db)
        assert await issue(db, record_id("owner", 0), "reset", 1800) is None
    email = "sample-1@samples.example.com"
    result = await unsafe(
        client,
        "POST",
        "/auth/login",
        json={
            "email": email,
            "password": "!disabled-sample-identity",
        },
    )
    assert result.status_code == 401
    for path in ("password-reset", "verification"):
        response = await unsafe(client, "POST", f"/auth/{path}/request", json={"email": email})
        assert response.status_code == 200
    assert database_app.state.outbox == []
    async with factory() as db:
        assert await db.scalar(select(func.count()).select_from(AuthToken)) == 0
        raw_session, raw_token = new_token(), new_token()
        expires = datetime.now(UTC) + timedelta(hours=1)
        db.add(
            Session(
                user_id=record_id("owner", 0),
                token_hash=token_hash(raw_session),
                expires_at=expires,
            )
        )
        db.add(
            AuthToken(
                user_id=record_id("owner", 0),
                token_hash=token_hash(raw_token),
                purpose="reset",
                expires_at=expires,
            )
        )
        await db.commit()
        with pytest.raises(HTTPException) as error:
            await consume(db, raw_token, "reset", "a-new-password-that-must-not-work")
        assert error.value.status_code == 400
    client.cookies.set(database_app.state.settings.session_cookie, raw_session)
    assert (await client.get("/api/v1/auth/me")).status_code == 401


@pytest.mark.integration
async def test_seed_collision_rolls_back_all_new_records(database_app):
    factory = database_app.state.session_factory
    async with factory() as db:
        # A real record at a deterministic ID must never be adopted or overwritten.
        db.add(
            User(id=record_id("owner", 8), email="preserved@example.com", password_hash="private")
        )
        await db.commit()
        with pytest.raises(RuntimeError, match="collision"):
            await seed_samples(db)
        assert await db.scalar(select(func.count()).select_from(User)) == 1
        for model in (Project, ProjectRole, ProjectMember):
            assert await db.scalar(select(func.count()).select_from(model)) == 0

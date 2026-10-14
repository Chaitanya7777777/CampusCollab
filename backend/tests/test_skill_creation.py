import asyncio
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from app.models import Skill
from app.skill_names import SkillNormalizationCollision, normalize_skill
from app.skills import create_or_get_skill, seed_skills
from tests.conftest import legacy_register, register, unsafe


@pytest.mark.parametrize(
    "a,b",
    [
        (" Python ", "python"),
        ("A  B", "a b"),
        ("Straße", "STRASSE"),
        ("é", "e\u0301"),
        ("ΟΣ", "οσ"),
        ("İ", "i\u0307"),
        ("A\u00a0B", "a b"),
    ],
)
def test_normalization(a, b):
    assert normalize_skill(a)[1] == normalize_skill(b)[1]


@pytest.mark.parametrize("name", ["", "   ", "a\nB", "a\tB", "a\u200bB", "a" * 81])
def test_invalid_names(name):
    with pytest.raises(ValueError):
        normalize_skill(name)


def test_punctuation_distinct():
    assert len({normalize_skill(n)[1] for n in ["C", "C++", "C#", ".NET", "Node.js"]}) == 5


@pytest.mark.integration
async def test_permissions_validation_rate_and_shared_catalog(client, database_app):
    assert (await unsafe(client, "POST", "/skills", json={"name": "Rust"})).status_code == 401
    await legacy_register(client)
    assert (await unsafe(client, "POST", "/skills", json={"name": "Rust"})).status_code == 403
    await register(client, "verified@example.com")
    assert (await client.post("/api/v1/skills", json={"name": "Rust"})).status_code == 403
    for data in [{"name": ""}, {"name": "a\nB"}, {"name": "Rust", "id": str(uuid4())}]:
        assert (await unsafe(client, "POST", "/skills", json=data)).status_code == 422
    database_app.state.settings.rate_skill_create_limit = 2
    first = await unsafe(client, "POST", "/skills", json={"name": " Rust "})
    assert first.status_code == 201 and first.json()["name"] == "Rust"
    repeat = await unsafe(client, "POST", "/skills", json={"name": "RUST"})
    assert repeat.status_code == 200 and repeat.json() == first.json()
    limited = await unsafe(client, "POST", "/skills", json={"name": "Go"})
    assert limited.status_code == 429 and int(limited.headers["retry-after"]) > 0
    await register(client, "another@example.com")
    assert first.json() in (await client.get("/api/v1/skills")).json()
    resolved = await client.get("/api/v1/skills/resolve", params={"name": " rust "})
    assert resolved.json() == first.json()
    assert (
        await unsafe(client, "PATCH", "/profiles/me", json={"skillIds": [first.json()["id"]]})
    ).status_code == 200
    from tests.test_projects import create, values

    project = values("Shared catalog project")
    project["roles"][0]["skillIds"] = [first.json()["id"]]
    draft = await create(client, project)
    assert draft.status_code == 201
    published = await unsafe(
        client, "POST", f"/projects/{draft.json()['id']}/publish", json=project
    )
    assert published.status_code == 200
    listing = await client.get("/api/v1/projects", params={"skill": first.json()["id"]})
    assert listing.json()["total"] == 1
    assert listing.json()["projects"][0]["id"] == draft.json()["id"]


@pytest.mark.integration
async def test_concurrent_equivalence_seed_and_slug_collisions(database_app):
    factory = database_app.state.session_factory

    async def create(name):
        async with factory() as db:
            return await create_or_get_skill(db, name)

    a, b = await asyncio.gather(create("Straße"), create(" STRASSE "))
    assert a[0].id == b[0].id and a[1] != b[1]
    names = ["C", "C++", "C#", ".NET", "Node.js", "React.js"]
    results = [await create(n) for n in names]
    assert len({r[0].id for r in results}) == len(names)
    async with factory() as db:
        before = list((await db.execute(select(Skill.id, Skill.name).order_by(Skill.id))).all())
        await seed_skills(db)
        after = list((await db.execute(select(Skill.id, Skill.name).order_by(Skill.id))).all())
        assert before == after


@pytest.mark.integration
async def test_migration_backfill_legacy_writer_and_collision(database_app, client):
    from tests.test_projects import create

    await register(client)
    await unsafe(client, "PATCH", "/profiles/me", json={"skillIds": ["python"]})
    assert (await create(client)).status_code == 201
    engine = database_app.state.engine
    config = Config(str(Path(__file__).parents[1] / "alembic.ini"))

    def revision(conn, action, target):
        config.attributes["connection"] = conn
        action(config, target)

    async with engine.begin() as conn:
        references = {}
        for table in ("user_skills", "role_required_skills"):
            references[table] = list((await conn.execute(text(f"SELECT * FROM {table}"))).all())
        original = list((await conn.execute(text("SELECT id,slug FROM skills ORDER BY id"))).all())
        await conn.run_sync(lambda c: revision(c, command.downgrade, "0007_project_conversion"))
        await conn.run_sync(lambda c: revision(c, command.upgrade, "head"))
        assert (
            list((await conn.execute(text("SELECT id,slug FROM skills ORDER BY id"))).all())
            == original
        )
        for table, expected in references.items():
            assert list((await conn.execute(text(f"SELECT * FROM {table}"))).all()) == expected
        # Old seed's unchanged insert/upsert remains valid during rolling deployment.
        await conn.execute(
            text(
                "INSERT INTO skills(id,slug,name) SELECT id,slug,name FROM skills "
                "WHERE slug='python' ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name"
            )
        )
        with pytest.raises(IntegrityError):
            async with conn.begin_nested():
                await conn.execute(
                    text("INSERT INTO skills(id,slug,name) VALUES (:id,'legacy-new','Legacy New')"),
                    {"id": uuid4()},
                )
    async with engine.begin() as conn:
        await conn.run_sync(lambda c: revision(c, command.downgrade, "0007_project_conversion"))
        await conn.execute(
            text("INSERT INTO skills(id,slug,name) VALUES (:id,'duplicate-python',' PYTHON ' )"),
            {"id": uuid4()},
        )
    with pytest.raises(SkillNormalizationCollision):
        async with engine.begin() as conn:
            await conn.run_sync(lambda c: revision(c, command.upgrade, "head"))
    async with engine.connect() as conn:
        assert (
            await conn.scalar(text("SELECT version_num FROM alembic_version"))
            == "0007_project_conversion"
        )
        assert await conn.scalar(text("SELECT count(*) FROM skills")) == 29


def test_collision_diagnostics_contain_only_safe_record_ids(monkeypatch):
    import json
    import logging

    from app.startup_diagnostics import report

    ids = [uuid4(), uuid4()]
    messages = []
    monkeypatch.setattr(logging.getLogger("campuscollab.startup"), "error", messages.append)
    report(SkillNormalizationCollision(ids), "migration")
    payload = json.loads(messages[0])
    assert payload["category"] == "skill_normalization_collision"
    assert payload["record_ids"] == sorted(str(id) for id in ids)
    assert "name" not in payload

import pytest
from sqlalchemy import func, select

from app.import_projects import definitions, import_projects
from app.models import Project, ProjectMember, ProjectRole, Skill, User
from app.sample_projects import removal_preview, seed_samples
from tests.conftest import register


def test_curated_definitions_publishable():
    data = definitions()
    assert len(data) == 9
    assert all(p.complete() and p.capacity == 4 and len(p.roles) == 2 for p in data)


@pytest.mark.integration
async def test_import_preview_repeat_seed_cleanup_and_application(client, database_app):
    from tests.conftest import unsafe

    assert (await register(client, "operator@example.com")).status_code == 201
    factory = database_app.state.session_factory
    async with factory() as db:
        plan = await import_projects(db, "operator@example.com")
        assert all(p["action"] == "create" for p in plan)
        assert await db.scalar(select(func.count()).select_from(Project)) == 0
    async with factory() as db:
        await import_projects(db, "operator@example.com", apply=True)
    async with factory() as db:
        repeated = await import_projects(db, "operator@example.com", apply=True)
        assert all(p["action"] == "skip_existing" for p in repeated)
    async with factory() as db:
        await seed_samples(db)
    async with factory() as db:
        assert all(not ids for ids in (await removal_preview(db)).values())
        assert await db.scalar(select(func.count()).select_from(User)) == 1
        assert await db.scalar(select(func.count()).select_from(Project)) == 9
        assert await db.scalar(select(func.count()).select_from(ProjectRole)) == 18
        assert await db.scalar(select(func.count()).select_from(ProjectMember)) == 9
        assert all(
            p.sample_seed is None and p.recruitment == "open"
            for p in await db.scalars(select(Project))
        )
    assert (await register(client, "applicant@example.com")).status_code == 201
    project = plan[0]
    response = await unsafe(
        client,
        "POST",
        f"/projects/{project['id']}/applications",
        json={
            "roleId": project["roles"][0]["id"],
            "motivation": "I would like to build this useful student project together.",
            "experience": "I have built accessible interfaces and tested student projects.",
            "portfolio": "",
        },
    )
    assert response.status_code == 201


@pytest.mark.integration
async def test_missing_skills_rolls_back_and_existing_owner_conflict(client, database_app):
    assert (await register(client, "operator@example.com")).status_code == 201
    factory = database_app.state.session_factory
    async with factory() as db:
        skill = await db.scalar(select(Skill).where(Skill.slug == "opencv"))
        await db.delete(skill)
        await db.commit()
    async with factory() as db:
        with pytest.raises(ValueError, match="catalog skills"):
            await import_projects(db, "operator@example.com", apply=True)
    async with factory() as db:
        assert await db.scalar(select(func.count()).select_from(Project)) == 0
    from app.skills import seed_skills

    async with factory() as db:
        await seed_skills(db)
    async with factory() as db:
        await import_projects(db, "operator@example.com", apply=True)
    assert (await register(client, "other@example.com")).status_code == 201
    async with factory() as db:
        plan = await import_projects(db, "other@example.com", apply=True)
        assert all(p["action"] == "skip_conflict" for p in plan)

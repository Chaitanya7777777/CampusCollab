import asyncio
import re
from uuid import NAMESPACE_URL, uuid4, uuid5

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import Principal, current_user
from app.config import Settings
from app.db import database, get_db
from app.models import Skill
from app.rate_limits import account
from app.schemas import SkillOut
from app.security import require_csrf
from app.skill_names import normalize_skill

router = APIRouter(prefix="/skills", tags=["Skills"])
NAMES = [
    "C++",
    "React",
    "FastAPI",
    "PostgreSQL",
    "Docker",
    "Git",
    "Python",
    "Tailwind CSS",
    "OpenCV",
    "PyTorch",
    "YOLOv8",
    "TypeScript",
    "Firebase",
    "Figma",
    "ESP32",
    "MQTT",
    "Node.js",
    "Next.js",
    "Prisma",
    "GraphQL",
    "ROS2",
    "SLAM",
    "Linux",
    "React Native",
    "Expo",
    "Express",
    "Technical Writing",
    "FreeRTOS",
]


def catalog():
    for name in NAMES:
        slug = re.sub(r"[^a-z0-9]", "-", name.lower())
        yield {
            "id": uuid5(NAMESPACE_URL, f"https://campuscollab.local/skills/{slug}"),
            "slug": slug,
            "name": name,
            "normalized_name": normalize_skill(name)[1],
        }


async def seed_skills(db: AsyncSession):
    for item in catalog():
        statement = insert(Skill).values(**item)
        await db.execute(statement.on_conflict_do_nothing())
    await db.commit()


@router.get("", response_model=list[SkillOut])
async def list_skills(db: AsyncSession = Depends(get_db)):
    skills = (await db.scalars(select(Skill).order_by(Skill.name))).all()
    return [SkillOut(id=skill.slug, name=skill.name) for skill in skills]


class SkillInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=320)

    @field_validator("name")
    @classmethod
    def clean(cls, value):
        return normalize_skill(value)[0]


@router.get("/resolve", response_model=SkillOut | None)
async def resolve_skill(name: str = Query(max_length=320), db: AsyncSession = Depends(get_db)):
    try:
        _, key = normalize_skill(name)
    except ValueError:
        raise HTTPException(422, "Use a valid skill name of 1 to 80 characters") from None
    skill = await db.scalar(select(Skill).where(Skill.normalized_name == key))
    return SkillOut(id=skill.slug, name=skill.name) if skill else None


async def create_or_get_skill(db: AsyncSession, name: str):
    display, key = normalize_skill(name)
    id = uuid4()
    # IDs are opaque: punctuation-distinct names cannot collide through slugification.
    result = await db.execute(
        insert(Skill)
        .values(
            id=id,
            slug=f"skill-{id.hex}",
            name=display,
            normalized_name=key,
        )
        .on_conflict_do_nothing(index_elements=[Skill.normalized_name])
        .returning(Skill.id)
    )
    created = result.scalar_one_or_none() is not None
    skill = await db.scalar(select(Skill).where(Skill.normalized_name == key))
    output = SkillOut(id=skill.slug, name=skill.name)
    await db.commit()
    return output, created


@router.post("", response_model=SkillOut, dependencies=[Depends(require_csrf)])
async def create_skill(
    data: SkillInput,
    request: Request,
    response: Response,
    principal: Principal = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    if not principal.user.email_verified_at:
        raise HTTPException(403, "email_verification_required")
    actor = str(principal.user.id)
    # Release auth's read transaction before independently committed rate accounting.
    await db.rollback()
    settings = request.app.state.settings
    await account(
        request.app.state.session_factory,
        settings.csrf_secret.get_secret_value(),
        [("skill-create:" + actor, settings.rate_skill_create_limit)],
        settings.rate_window_seconds,
    )
    output, created = await create_or_get_skill(db, data.name)
    response.status_code = 201 if created else 200
    return output


async def main():
    engine, factory = database(Settings())
    try:
        async with factory() as db:
            await seed_skills(db)
        print("Skill catalog seeded successfully.")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())

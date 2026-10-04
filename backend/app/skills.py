import asyncio
import re
from uuid import NAMESPACE_URL, uuid5

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.db import database, get_db
from app.models import Skill
from app.schemas import SkillOut

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
        }


async def seed_skills(db: AsyncSession):
    for item in catalog():
        statement = insert(Skill).values(**item)
        await db.execute(
            statement.on_conflict_do_update(
                index_elements=[Skill.slug], set_={"name": statement.excluded.name}
            )
        )
    await db.commit()


@router.get("", response_model=list[SkillOut])
async def list_skills(db: AsyncSession = Depends(get_db)):
    skills = (await db.scalars(select(Skill).order_by(Skill.name))).all()
    return [SkillOut(id=skill.slug, name=skill.name) for skill in skills]


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

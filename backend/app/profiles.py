from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import Principal, current_user
from app.db import get_db
from app.models import Profile, Skill, User, UserSkill
from app.schemas import ProfileOut, ProfilePatch
from app.security import require_csrf

router = APIRouter(prefix="/profiles", tags=["Profiles"])


async def profile_response(db: AsyncSession, user: User) -> ProfileOut:
    profile = (await db.scalars(select(Profile).where(Profile.user_id == user.id))).one()
    skills = (
        await db.scalars(
            select(Skill.slug)
            .join(UserSkill, UserSkill.skill_id == Skill.id)
            .where(UserSkill.user_id == user.id)
            .order_by(Skill.slug)
        )
    ).all()
    return ProfileOut(
        id=user.id,
        email=user.email,
        emailVerifiedAt=user.email_verified_at,
        createdAt=user.created_at,
        updatedAt=profile.updated_at,
        skillIds=list(skills),
        **{
            field: getattr(profile, field)
            for field in (
                "name",
                "campus",
                "department",
                "semester",
                "bio",
                "github",
                "linkedin",
                "website",
            )
        },
    )


async def update_profile(db: AsyncSession, user: User, data: ProfilePatch) -> ProfileOut:
    # Serialize edits for this user, including replacement of the join table.
    await db.scalar(select(User.id).where(User.id == user.id).with_for_update())
    values = data.model_dump(exclude_unset=True)
    ids = values.pop("skillIds", None)
    skills = []
    if ids is not None:
        skills = list((await db.scalars(select(Skill).where(Skill.slug.in_(ids)))).all())
        if len(skills) != len(ids):
            raise HTTPException(422, "Select skills from the catalog")
    profile = (await db.scalars(select(Profile).where(Profile.user_id == user.id))).one()
    for key, value in values.items():
        setattr(profile, key, value)
    if ids is not None:
        await db.execute(delete(UserSkill).where(UserSkill.user_id == user.id))
        db.add_all(UserSkill(user_id=user.id, skill_id=skill.id) for skill in skills)
    profile.updated_at = datetime.now(UTC)
    await db.commit()
    return await profile_response(db, user)


@router.get("/me", response_model=ProfileOut)
async def get_profile(
    principal: Principal = Depends(current_user), db: AsyncSession = Depends(get_db)
):
    return await profile_response(db, principal.user)


@router.patch("/me", response_model=ProfileOut, dependencies=[Depends(require_csrf)])
async def patch_profile(
    data: ProfilePatch,
    principal: Principal = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    return await update_profile(db, principal.user, data)

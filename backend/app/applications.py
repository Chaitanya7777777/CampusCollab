"""Application reads and transitions. All writes lock project, then application.

Pending records never reserve places. Counts always come from memberships while
holding the project lock; no network retry or mutable slot counters are needed.
"""

from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.application_schemas import (
    ApplicantEntry,
    ApplicantPage,
    ApplicationInput,
    ApplicationOut,
    Counts,
)
from app.auth import Principal, current_user
from app.db import get_db
from app.models import Application, Profile, Project, ProjectMember, ProjectRole, Skill, UserSkill
from app.project_schemas import PersonOut, RoleOut, SkillOut
from app.projects import person, readable, related, view
from app.security import require_csrf

router = APIRouter(tags=["Applications"])


class ApplicantProfile(PersonOut):
    skillIds: list[str]


class OwnerEntry(BaseModel):
    application: ApplicationOut
    applicant: ApplicantProfile
    role: RoleOut
    sharedSkills: list[SkillOut]
    missingSkills: list[SkillOut]


class OwnerPage(BaseModel):
    applications: list[OwnerEntry]
    counts: Counts
    total: int
    page: int
    pageSize: int


def output(a):
    return dict(
        id=a.id,
        projectId=a.project_id,
        roleId=a.role_id,
        studentId=a.applicant_id,
        motivation=a.motivation,
        experience=a.experience,
        portfolio=a.portfolio,
        status=a.status,
        createdAt=a.created_at,
        decidedAt=a.decided_at,
        withdrawnAt=a.withdrawn_at,
    )


async def applicant_entries(db, records, actor):
    ids = {a.project_id for a in records}
    projects = {p.id: p for p in await db.scalars(select(Project).where(Project.id.in_(ids)))}
    roles = {
        r.id: r
        for r in await db.scalars(select(ProjectRole).where(ProjectRole.project_id.in_(ids)))
    }
    memberships = set(
        await db.scalars(
            select(ProjectMember.project_id).where(
                ProjectMember.project_id.in_(ids), ProjectMember.user_id == actor
            )
        )
    )
    results = []
    for a in records:
        p, r = projects.get(a.project_id), roles.get(a.role_id)
        accessible = p and (
            p.status == "published"
            or (p.status == "archived" and (p.owner_id == actor or p.id in memberships))
        )
        results.append(
            dict(
                application=output(a),
                projectTitle=p.title if p else "Unavailable project",
                projectType=p.type if p else "",
                roleTitle=r.title if r else "Unavailable role",
                projectStatus=p.status if p and p.status != "draft" else "unavailable",
                projectHref=f"/projects/{p.id}" if accessible else None,
                isMember=a.project_id in memberships,
            )
        )
    return results


async def owner_entries(db, project, records):
    data = await related(db, [project])
    roles = {r["id"]: r for r in view(project, data)["roles"]}
    ids = {a.applicant_id for a in records}
    profiles = {
        p.user_id: p for p in await db.scalars(select(Profile).where(Profile.user_id.in_(ids)))
    }
    selections = list(
        await db.execute(
            select(UserSkill.user_id, Skill.slug)
            .join(Skill, Skill.id == UserSkill.skill_id)
            .where(UserSkill.user_id.in_(ids))
        )
    )
    results = []
    for a in records:
        selected = {slug for user, slug in selections if user == a.applicant_id}
        role = roles[a.role_id]
        required = set(role["skillIds"])
        results.append(
            dict(
                application=output(a),
                applicant={**person(profiles[a.applicant_id]), "skillIds": sorted(selected)},
                role=role,
                sharedSkills=[
                    dict(id=s.slug, name=s.name)
                    for s in data[3].values()
                    if s.slug in required & selected
                ],
                missingSkills=[
                    dict(id=s.slug, name=s.name)
                    for s in data[3].values()
                    if s.slug in required - selected
                ],
            )
        )
    return results


async def locked_project(db, id):
    project = await db.scalar(select(Project).where(Project.id == id).with_for_update())
    if not project:
        raise HTTPException(404, "Project not found")
    if project.sample_seed:
        raise HTTPException(403, "Sample projects are read-only")
    return project


async def available(db, project, role_id, applicant):
    if project.status != "published" or project.recruitment != "open":
        raise HTTPException(409, "Recruitment is not open")
    role = await db.scalar(
        select(ProjectRole).where(ProjectRole.id == role_id, ProjectRole.project_id == project.id)
    )
    if not role:
        raise HTTPException(422, "Role does not belong to this project")
    members = list(
        await db.scalars(select(ProjectMember).where(ProjectMember.project_id == project.id))
    )
    if project.owner_id == applicant or any(m.user_id == applicant for m in members):
        raise HTTPException(409, "Applicant is already a team member")
    if len(members) >= (project.capacity or 0):
        raise HTTPException(409, "The team is full")
    if sum(m.role_id == role.id for m in members) >= (role.positions or 0):
        raise HTTPException(409, "This role is full")


@router.post(
    "/projects/{project_id}/applications",
    response_model=ApplicationOut,
    status_code=201,
    dependencies=[Depends(require_csrf)],
)
async def submit(
    project_id: UUID,
    data: ApplicationInput,
    principal: Principal = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    if not principal.user.email_verified_at:
        raise HTTPException(403, "email_verification_required")
    project = await locked_project(db, project_id)
    if project.status == "draft":
        raise HTTPException(404, "Project not found")
    actor = principal.user.id
    await available(db, project, data.roleId, actor)
    if await db.scalar(
        select(Application.id).where(
            Application.project_id == project_id, Application.applicant_id == actor
        )
    ):
        raise HTTPException(
            409, "You already applied to this project; reapplication is unavailable"
        )
    application = Application(
        project_id=project_id,
        role_id=data.roleId,
        applicant_id=actor,
        motivation=data.motivation,
        experience=data.experience,
        portfolio=data.portfolio,
    )
    db.add(application)
    await db.commit()
    return output(application)


async def transition(db, actor, id, decision, project_id=None):
    # Read only the immutable project ID before locking. Status is read AFTER locks.
    target = await db.scalar(select(Application.project_id).where(Application.id == id))
    if not target or (project_id is not None and target != project_id):
        raise HTTPException(404, "Application not found")
    project = await locked_project(db, target)
    application = await db.scalar(select(Application).where(Application.id == id).with_for_update())
    permitted = (
        application.applicant_id == actor if decision == "withdraw" else project.owner_id == actor
    )
    if not permitted:
        raise HTTPException(404, "Application not found")
    if application.status != "pending":
        raise HTTPException(409, "Application already processed; refresh its current status")
    now = datetime.now(UTC)
    if decision == "withdraw":
        application.status, application.withdrawn_at = "withdrawn", now
    else:
        if project.status != "published":
            raise HTTPException(409, "Archived projects cannot process applications")
        if decision == "accept":
            await available(db, project, application.role_id, application.applicant_id)
            db.add(
                ProjectMember(
                    project_id=target, user_id=application.applicant_id, role_id=application.role_id
                )
            )
        application.status = "accepted" if decision == "accept" else "rejected"
        application.decided_at = now
    await db.commit()
    return output(application)


@router.post(
    "/applications/{id}/withdraw",
    response_model=ApplicationOut,
    dependencies=[Depends(require_csrf)],
)
async def withdraw(
    id: UUID, principal: Principal = Depends(current_user), db: AsyncSession = Depends(get_db)
):
    return await transition(db, principal.user.id, id, "withdraw")


@router.post(
    "/projects/{project_id}/applications/{id}/{decision}",
    response_model=ApplicationOut,
    dependencies=[Depends(require_csrf)],
)
async def decide(
    project_id: UUID,
    id: UUID,
    decision: Literal["accept", "reject"],
    principal: Principal = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    return await transition(db, principal.user.id, id, decision, project_id)


async def listing(db, scope, status, search, role_id, sort, page, page_size, owner=False):
    counts = dict(all=0, pending=0, accepted=0, rejected=0, withdrawn=0)
    for state, count in await db.execute(
        select(Application.status, func.count()).where(scope).group_by(Application.status)
    ):
        counts[state] = count
        counts["all"] += count
    query = (
        select(Application)
        .join(Project, Project.id == Application.project_id)
        .join(ProjectRole, ProjectRole.id == Application.role_id)
        .join(Profile, Profile.user_id == Application.applicant_id)
        .where(scope)
    )
    if status != "all":
        query = query.where(Application.status == status)
    if role_id:
        query = query.where(Application.role_id == role_id)
    if search.strip():
        term = search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        fields = [Profile.name] if owner else [Project.title, ProjectRole.title]
        query = query.where(or_(*(f.ilike(f"%{term}%", escape="\\") for f in fields)))
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    ordering = [Application.created_at, Application.id]
    if sort == "newest":
        ordering = [column.desc() for column in ordering]
    records = list(
        await db.scalars(query.order_by(*ordering).offset((page - 1) * page_size).limit(page_size))
    )
    return records, dict(counts=counts, total=total, page=page, pageSize=page_size)


@router.get("/applications", response_model=ApplicantPage)
async def mine(
    status: Literal["all", "pending", "accepted", "rejected", "withdrawn"] = "all",
    search: str = Query("", max_length=200),
    sort: Literal["newest", "oldest"] = "newest",
    page: int = Query(1, ge=1),
    pageSize: int = Query(12, ge=1, le=50),
    principal: Principal = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    records, metadata = await listing(
        db,
        Application.applicant_id == principal.user.id,
        status,
        search,
        None,
        sort,
        page,
        pageSize,
    )
    return dict(applications=await applicant_entries(db, records, principal.user.id), **metadata)


@router.get("/applications/{id}", response_model=ApplicantEntry)
async def detail(
    id: UUID, principal: Principal = Depends(current_user), db: AsyncSession = Depends(get_db)
):
    a = await db.scalar(
        select(Application).where(
            Application.id == id, Application.applicant_id == principal.user.id
        )
    )
    if not a:
        raise HTTPException(404, "Application not found")
    return (await applicant_entries(db, [a], principal.user.id))[0]


@router.get("/projects/{project_id}/applications", response_model=OwnerPage)
async def inbox(
    project_id: UUID,
    status: Literal["all", "pending", "accepted", "rejected", "withdrawn"] = "pending",
    search: str = Query("", max_length=200),
    roleId: UUID | None = None,
    sort: Literal["newest", "oldest"] = "newest",
    page: int = Query(1, ge=1),
    pageSize: int = Query(12, ge=1, le=50),
    principal: Principal = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await readable(db, project_id, principal.user.id, True)
    records, metadata = await listing(
        db, Application.project_id == project_id, status, search, roleId, sort, page, pageSize, True
    )
    return dict(applications=await owner_entries(db, project, records), **metadata)


@router.get("/projects/{project_id}/applications/{id}", response_model=OwnerEntry)
async def review(
    project_id: UUID,
    id: UUID,
    principal: Principal = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await readable(db, project_id, principal.user.id, True)
    a = await db.scalar(
        select(Application).where(Application.id == id, Application.project_id == project_id)
    )
    if not a:
        raise HTTPException(404, "Application not found")
    return (await owner_entries(db, project, [a]))[0]

"""Project services and routes. Lock order: project, then roles/memberships.

Every state mutation takes the project lock before reading its state. Future
acceptance must use the same lock before application/role/member locks.
"""

from collections import defaultdict
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import Integer, delete, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import Principal, current_user
from app.db import get_db
from app.models import Application, Profile, Project, ProjectMember, ProjectRole, RoleSkill, Skill
from app.project_schemas import (
    PROJECT_TYPES,
    DiscoveryOut,
    DraftOut,
    ManageOut,
    MyProjectsOut,
    ProjectInput,
    ProjectOut,
    RecruitmentInput,
)
from app.security import require_csrf

router = APIRouter(prefix="/projects", tags=["Projects"])


async def owned(db, id, actor):
    project = await db.scalar(select(Project).where(Project.id == id).with_for_update())
    if not project or project.owner_id != actor:
        raise HTTPException(404, "Project not found")
    if project.sample_seed:
        raise HTTPException(403, "Sample projects are read-only")
    return project


async def related(db, projects):
    """Bulk-load a page, independent of the number of projects/roles/members."""
    ids = [p.id for p in projects]
    roles = list(
        await db.scalars(
            select(ProjectRole)
            .where(ProjectRole.project_id.in_(ids))
            .order_by(ProjectRole.created_at, ProjectRole.id)
        )
    )
    members = list(
        await db.scalars(
            select(ProjectMember)
            .where(ProjectMember.project_id.in_(ids))
            .order_by(ProjectMember.joined_at, ProjectMember.id)
        )
    )
    people_ids = {p.owner_id for p in projects} | {m.user_id for m in members}
    people = {
        p.user_id: p
        for p in await db.scalars(select(Profile).where(Profile.user_id.in_(people_ids)))
    }
    skills = {s.id: s for s in await db.scalars(select(Skill).order_by(Skill.slug))}
    links = list(
        await db.scalars(select(RoleSkill).where(RoleSkill.role_id.in_([r.id for r in roles])))
    )
    role_skills = defaultdict(list)
    for link in links:
        role_skills[link.role_id].append(skills[link.skill_id].slug)
    return roles, members, people, skills, role_skills


def person(profile):
    return dict(
        id=profile.user_id,
        name=profile.name,
        campus=profile.campus or "",
        department=profile.department or "",
        bio=profile.bio or "",
    )


def draft_result(project, roles, role_skills):
    return dict(
        id=project.id,
        ownerId=project.owner_id,
        status=project.status,
        recruitment=project.recruitment,
        createdAt=project.created_at,
        updatedAt=project.updated_at,
        values=dict(
            title=project.title,
            type=project.type,
            eventName=project.event_name,
            description=project.description,
            capacity=project.capacity,
            roles=[
                dict(
                    id=r.id,
                    title=r.title,
                    responsibilities=r.description,
                    openings=r.positions,
                    skillIds=sorted(role_skills[r.id]),
                )
                for r in roles
                if r.project_id == project.id
            ],
        ),
    )


def view(project, data):
    roles, members, people, skills, role_skills = data
    team = [m for m in members if m.project_id == project.id]
    relevant = [r for r in roles if r.project_id == project.id]
    role_views = [
        dict(
            id=r.id,
            projectId=r.project_id,
            title=r.title,
            category=r.title,
            description=r.description,
            positions=r.positions or 0,
            skillIds=sorted(role_skills[r.id]),
            openings=0
            if project.sample_seed
            else max(0, (r.positions or 0) - sum(m.role_id == r.id for m in team)),
        )
        for r in relevant
    ]
    ids = {s for r in relevant for s in role_skills[r.id]}
    capacity = project.capacity or 2
    return dict(
        id=project.id,
        ownerId=project.owner_id,
        title=project.title,
        isSample=bool(project.sample_seed),
        summary=project.description.partition(". ")[0] + "."
        if project.sample_seed
        else project.description[:200],
        description=project.description,
        type=project.type,
        tag=project.event_name,
        campus=people[project.owner_id].campus or "",
        capacity=capacity,
        status=project.status,
        recruitment=project.recruitment,
        createdAt=project.created_at,
        publishedAt=project.published_at,
        archivedAt=project.archived_at,
        skillIds=sorted(ids),
        skills=[dict(id=s.slug, name=s.name) for s in skills.values() if s.slug in ids],
        owner=person(people[project.owner_id]),
        team=[
            dict(
                student=person(people[m.user_id]),
                membership=dict(
                    id=m.id,
                    projectId=m.project_id,
                    studentId=m.user_id,
                    roleId=m.role_id,
                    joinedAt=m.joined_at,
                    contribution="Project owner"
                    if m.user_id == project.owner_id
                    else next((r.title for r in relevant if r.id == m.role_id), "Team member"),
                ),
            )
            for m in team
        ],
        roles=role_views,
        memberCount=len(team),
        openings=min(max(0, capacity - len(team)), sum(r["openings"] for r in role_views))
        if project.recruitment == "open"
        else 0,
        eligibility=None,
    )


def summary(project, data):
    result = view(project, data)
    return dict(
        id=project.id,
        title=project.title,
        summary=result["summary"],
        type=project.type,
        status=project.status,
        recruitment=project.recruitment,
        capacity=project.capacity,
        memberCount=result["memberCount"],
        openings=sum(r["openings"] for r in result["roles"])
        if project.status == "draft"
        else result["openings"],
        roles=result["roles"],
        updatedAt=project.updated_at,
    )


async def save_values(db, project, data):
    ids = {slug for role in data.roles for slug in role.skillIds}
    skills = {s.slug: s.id for s in await db.scalars(select(Skill).where(Skill.slug.in_(ids)))}
    if set(skills) != ids:
        raise HTTPException(422, "Select skills from the catalog")
    # Client role IDs may only identify new roles or roles on this project.
    if await db.scalar(
        select(ProjectRole.id)
        .where(ProjectRole.id.in_([r.id for r in data.roles]), ProjectRole.project_id != project.id)
        .limit(1)
    ):
        raise HTTPException(422, "Role does not belong to this project")
    project.title, project.type, project.description = data.title, data.type, data.description
    project.event_name, project.capacity = data.eventName, data.capacity
    project.updated_at = datetime.now(UTC)
    await db.execute(delete(ProjectRole).where(ProjectRole.project_id == project.id))
    db.add_all(
        ProjectRole(
            id=r.id,
            project_id=project.id,
            title=r.title,
            description=r.responsibilities,
            positions=r.openings,
        )
        for r in data.roles
    )
    await db.flush()
    db.add_all(
        RoleSkill(role_id=r.id, skill_id=skills[slug]) for r in data.roles for slug in r.skillIds
    )


async def save_project(db, actor, data, id=None, publish=False):
    if publish and not data.complete():
        raise HTTPException(422, "Complete the project and all recruitment roles before publishing")
    if id:
        project = await owned(db, id, actor)
        if project.status != "draft":
            raise HTTPException(
                409, "Project is already published or archived; draft editing is unavailable"
            )
    else:
        project = Project(owner_id=actor, title=data.title)
        db.add(project)
        await db.flush()
        db.add(ProjectMember(project_id=project.id, user_id=actor))
    await save_values(db, project, data)
    if publish:
        project.status, project.recruitment, project.published_at = (
            "published",
            "open",
            datetime.now(UTC),
        )
    project.updated_at = datetime.now(UTC)
    await db.commit()
    related_data = await related(db, [project])
    return draft_result(project, related_data[0], related_data[4])


# Correlated aggregates and EXISTS avoid duplicate project rows and count distortion.
member_count = (
    select(func.count(ProjectMember.id))
    .where(ProjectMember.project_id == Project.id)
    .correlate(Project)
    .scalar_subquery()
)
role_count = (
    select(func.count(ProjectMember.id))
    .where(ProjectMember.role_id == ProjectRole.id)
    .correlate(ProjectRole)
    .scalar_subquery()
)
remaining = func.greatest(0, ProjectRole.positions - role_count)
role_total = (
    select(func.coalesce(func.sum(remaining), 0))
    .where(ProjectRole.project_id == Project.id)
    .correlate(Project)
    .scalar_subquery()
)
active_openings = func.least(func.greatest(0, Project.capacity - member_count), role_total)


@router.get("", response_model=DiscoveryOut)
async def discover(
    search: str = Query("", max_length=200),
    type: str = Query("", max_length=30),
    skill: str = Query("", max_length=80),
    role: str = Query("", max_length=100),
    campus: str = Query("", max_length=100),
    openingsOnly: bool = False,
    sort: str = Query("newest", pattern="^(newest|oldest|title|openings)$"),
    page: int = Query(1, ge=1),
    pageSize: int = Query(12, ge=1, le=50),
    principal: Principal = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    conditions = [Project.status == "published"]
    if type:
        conditions.append(Project.type == type)
    if campus:
        conditions.append(
            exists(
                select(Profile.id).where(
                    Profile.user_id == Project.owner_id, Profile.campus == campus
                )
            )
        )
    role_conditions = [ProjectRole.project_id == Project.id]
    if role:
        role_conditions.extend(
            [
                ProjectRole.title == role,
                remaining > 0,
                Project.recruitment == "open",
                Project.capacity > member_count,
            ]
        )
    if skill:
        role_conditions.append(
            exists(
                select(RoleSkill.role_id)
                .join(Skill, Skill.id == RoleSkill.skill_id)
                .where(RoleSkill.role_id == ProjectRole.id, Skill.slug == skill)
            )
        )
    if role or skill:
        conditions.append(exists(select(ProjectRole.id).where(*role_conditions)))
    if openingsOnly:
        conditions.extend([Project.recruitment == "open", active_openings > 0])
    if search.strip():
        # Escape LIKE metacharacters so user input is a literal substring.
        pattern = (
            "%" + search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        )
        skill_match = exists(
            select(RoleSkill.role_id)
            .join(Skill, Skill.id == RoleSkill.skill_id)
            .where(
                RoleSkill.role_id == ProjectRole.id,
                or_(Skill.name.ilike(pattern), Skill.slug.ilike(pattern)),
            )
        )
        conditions.append(
            or_(
                Project.title.ilike(pattern),
                Project.description.ilike(pattern),
                exists(
                    select(ProjectRole.id).where(
                        ProjectRole.project_id == Project.id,
                        or_(ProjectRole.title.ilike(pattern), skill_match),
                    )
                ),
            )
        )
    total = await db.scalar(select(func.count()).select_from(Project).where(*conditions))
    order = {
        "newest": Project.published_at.desc(),
        "oldest": Project.published_at.asc(),
        "title": func.lower(Project.title).asc(),
        "openings": (active_openings * (Project.recruitment == "open").cast(Integer)).desc(),
    }[sort]
    projects = list(
        await db.scalars(
            select(Project)
            .where(*conditions)
            .order_by(order, Project.id)
            .offset((page - 1) * pageSize)
            .limit(pageSize)
        )
    )
    data = await related(db, projects)
    categories = list(
        await db.scalars(
            select(ProjectRole.title)
            .join(Project, Project.id == ProjectRole.project_id)
            .where(Project.status == "published")
            .distinct()
            .order_by(ProjectRole.title)
        )
    )
    campuses = list(
        await db.scalars(
            select(Profile.campus)
            .join(Project, Project.owner_id == Profile.user_id)
            .where(Project.status == "published", Profile.campus.is_not(None))
            .distinct()
            .order_by(Profile.campus)
        )
    )
    return dict(
        projects=[view(p, data) for p in projects],
        total=total,
        page=page,
        pageSize=pageSize,
        types=PROJECT_TYPES,
        categories=categories,
        campuses=campuses,
        skills=[dict(id=s.slug, name=s.name) for s in data[3].values()],
    )


@router.get("/mine", response_model=MyProjectsOut)
async def mine(principal: Principal = Depends(current_user), db: AsyncSession = Depends(get_db)):
    actor = principal.user.id
    projects = list(
        await db.scalars(
            select(Project)
            .where(
                Project.sample_seed.is_(None),
                or_(
                    Project.owner_id == actor,
                    (Project.status != "draft")
                    & exists(
                        select(ProjectMember.id).where(
                            ProjectMember.project_id == Project.id, ProjectMember.user_id == actor
                        )
                    ),
                ),
            )
            .order_by(Project.updated_at.desc(), Project.id)
        )
    )
    data = await related(db, projects)
    pending = dict(
        (
            await db.execute(
                select(Application.project_id, func.count())
                .where(
                    Application.project_id.in_([p.id for p in projects if p.owner_id == actor]),
                    Application.status == "pending",
                )
                .group_by(Application.project_id)
            )
        ).all()
    )
    return dict(
        owned=[
            {**summary(p, data), "pendingCount": pending.get(p.id, 0)}
            for p in projects
            if p.owner_id == actor
        ],
        joined=[summary(p, data) for p in projects if p.owner_id != actor],
    )


@router.get("/drafts", response_model=list[DraftOut])
async def drafts(principal: Principal = Depends(current_user), db: AsyncSession = Depends(get_db)):
    projects = list(
        await db.scalars(
            select(Project)
            .where(Project.owner_id == principal.user.id, Project.status == "draft")
            .order_by(Project.updated_at.desc(), Project.id)
        )
    )
    data = await related(db, projects)
    return [draft_result(p, data[0], data[4]) for p in projects]


@router.post("", response_model=DraftOut, status_code=201, dependencies=[Depends(require_csrf)])
async def create(
    data: ProjectInput,
    publish: bool = False,
    principal: Principal = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    if publish and not principal.user.email_verified_at:
        raise HTTPException(403, "email_verification_required")
    return await save_project(db, principal.user.id, data, publish=publish)


@router.get("/{id}/draft", response_model=DraftOut)
async def draft(
    id: UUID, principal: Principal = Depends(current_user), db: AsyncSession = Depends(get_db)
):
    project = await db.scalar(
        select(Project).where(
            Project.id == id, Project.owner_id == principal.user.id, Project.status == "draft"
        )
    )
    if not project:
        raise HTTPException(404, "Draft not found")
    data = await related(db, [project])
    return draft_result(project, data[0], data[4])


@router.patch("/{id}/draft", response_model=DraftOut, dependencies=[Depends(require_csrf)])
async def update_draft(
    id: UUID,
    data: ProjectInput,
    principal: Principal = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    return await save_project(db, principal.user.id, data, id)


@router.post("/{id}/publish", response_model=DraftOut, dependencies=[Depends(require_csrf)])
async def publish(
    id: UUID,
    data: ProjectInput,
    principal: Principal = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    if not principal.user.email_verified_at:
        raise HTTPException(403, "email_verification_required")
    return await save_project(db, principal.user.id, data, id, publish=True)


async def readable(db, id, actor, owner_only=False):
    project = await db.get(Project, id)
    if not project or project.status == "draft":
        raise HTTPException(404, "Project not found")
    if project.owner_id != actor and (
        owner_only
        or (
            project.status == "archived"
            and not await db.scalar(
                select(ProjectMember.id).where(
                    ProjectMember.project_id == id, ProjectMember.user_id == actor
                )
            )
        )
    ):
        raise HTTPException(404, "Project not found")
    return project


@router.get("/{id}", response_model=ProjectOut)
async def detail(
    id: UUID, principal: Principal = Depends(current_user), db: AsyncSession = Depends(get_db)
):
    project = await readable(db, id, principal.user.id)
    result = view(project, await related(db, [project]))
    from app.applications import output

    application = await db.scalar(
        select(Application).where(
            Application.project_id == id, Application.applicant_id == principal.user.id
        )
    )
    result["application"] = output(application) if application else None
    result["eligibility"] = (
        "Recruitment is closed."
        if project.sample_seed
        else "You are already a team member."
        if any(m["student"]["id"] == principal.user.id for m in result["team"])
        else f"Your application is {application.status}. Reapplication is unavailable."
        if application
        else "Recruitment is closed."
        if project.status != "published" or project.recruitment != "open"
        else "The team is full."
        if result["memberCount"] >= result["capacity"]
        else "Verify your email from your profile before applying."
        if not principal.user.email_verified_at
        else None
    )
    return result


@router.get("/{id}/manage", response_model=ManageOut)
async def manage(
    id: UUID, principal: Principal = Depends(current_user), db: AsyncSession = Depends(get_db)
):
    project = await readable(db, id, principal.user.id, True)
    data = await related(db, [project])
    return dict(
        pendingCount=await db.scalar(
            select(func.count())
            .select_from(Application)
            .where(Application.project_id == id, Application.status == "pending")
        ),
        project=view(project, data),
        skills=[dict(id=s.slug, name=s.name) for s in data[3].values()],
    )


async def change_state(db, id, actor, recruitment=None):
    project = await owned(db, id, actor)
    if project.status != "published":
        raise HTTPException(409, "Only published projects can be changed")
    if recruitment is None:
        project.status, project.archived_at = "archived", datetime.now(UTC)
        project.recruitment = "closed"
    else:
        project.recruitment = recruitment
    project.updated_at = datetime.now(UTC)
    await db.commit()
    return view(project, await related(db, [project]))


@router.patch("/{id}/recruitment", response_model=ProjectOut, dependencies=[Depends(require_csrf)])
async def recruitment(
    id: UUID,
    data: RecruitmentInput,
    principal: Principal = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    return await change_state(db, id, principal.user.id, data.recruitment)


@router.post("/{id}/archive", response_model=ProjectOut, dependencies=[Depends(require_csrf)])
async def archive(
    id: UUID, principal: Principal = Depends(current_user), db: AsyncSession = Depends(get_db)
):
    return await change_state(db, id, principal.user.id)

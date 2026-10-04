import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("email", name="uq_users_email"),
        CheckConstraint("email = lower(btrim(email))", name="ck_users_email_normalized"),
    )
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(254))
    password_hash: Mapped[str] = mapped_column(String(512))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Profile(Base):
    __tablename__ = "profiles"
    __table_args__ = (
        CheckConstraint(
            "semester IN ('1','2','3','4','5','6','7','8')", name="ck_profile_semester"
        ),
    )
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )
    name: Mapped[str] = mapped_column(String(80))
    campus: Mapped[str | None] = mapped_column(String(100))
    department: Mapped[str | None] = mapped_column(String(100))
    semester: Mapped[str | None] = mapped_column(String(1))
    bio: Mapped[str | None] = mapped_column(String(300))
    github: Mapped[str | None] = mapped_column(String(300))
    linkedin: Mapped[str | None] = mapped_column(String(300))
    website: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Session(Base):
    __tablename__ = "sessions"
    __table_args__ = (
        Index("ix_sessions_user_id", "user_id"),
        Index("ix_sessions_expires_at", "expires_at"),
    )
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Skill(Base):
    __tablename__ = "skills"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True)
    name: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class UserSkill(Base):
    __tablename__ = "user_skills"
    __table_args__ = (Index("ix_user_skills_skill_id", "skill_id"),)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    skill_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("skills.id", ondelete="RESTRICT"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Project(Base):
    __tablename__ = "projects"
    __table_args__ = (
        CheckConstraint(
            "capacity IS NULL OR capacity BETWEEN 2 AND 100", name="ck_projects_capacity"
        ),
        CheckConstraint("status IN ('draft','published','archived')", name="ck_projects_status"),
        CheckConstraint("recruitment IN ('open','closed')", name="ck_projects_recruitment"),
        CheckConstraint(
            "status = 'published' OR recruitment = 'closed'", name="ck_projects_closed"
        ),
        Index("ix_projects_owner_id", "owner_id"),
        Index("ix_projects_status_published_at", "status", "published_at"),
    )
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    title: Mapped[str] = mapped_column(String(120))
    type: Mapped[str] = mapped_column(String(30), default="")
    event_name: Mapped[str] = mapped_column(String(120), default="")
    description: Mapped[str] = mapped_column(String(1200), default="")
    capacity: Mapped[int | None]
    status: Mapped[str] = mapped_column(String(12), default="draft")
    recruitment: Mapped[str] = mapped_column(String(6), default="closed")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ProjectRole(Base):
    __tablename__ = "project_roles"
    __table_args__ = (
        UniqueConstraint("id", "project_id", name="uq_role_project"),
        CheckConstraint(
            "positions IS NULL OR positions BETWEEN 1 AND 100", name="ck_role_positions"
        ),
        Index("ix_project_roles_project_id", "project_id"),
    )
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(100), default="")
    description: Mapped[str] = mapped_column(String(600), default="")
    positions: Mapped[int | None]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RoleSkill(Base):
    __tablename__ = "role_required_skills"
    __table_args__ = (Index("ix_role_required_skills_skill_id", "skill_id"),)
    role_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("project_roles.id", ondelete="CASCADE"), primary_key=True
    )
    skill_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("skills.id", ondelete="RESTRICT"), primary_key=True
    )


class ProjectMember(Base):
    __tablename__ = "project_members"
    __table_args__ = (
        UniqueConstraint("project_id", "user_id", name="uq_project_member"),
        ForeignKeyConstraint(
            ["role_id", "project_id"],
            ["project_roles.id", "project_roles.project_id"],
            name="fk_member_role_project",
            ondelete="RESTRICT",
        ),
        Index("ix_project_members_user_id", "user_id"),
        Index("ix_project_members_role_id", "role_id"),
    )
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    role_id: Mapped[uuid.UUID | None]
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Application(Base):
    __tablename__ = "applications"
    __table_args__ = (
        UniqueConstraint("project_id", "applicant_id", name="uq_application_applicant_project"),
        ForeignKeyConstraint(
            ["role_id", "project_id"],
            ["project_roles.id", "project_roles.project_id"],
            name="fk_application_role_project",
            ondelete="RESTRICT",
        ),
        CheckConstraint(
            "status IN ('pending','accepted','rejected','withdrawn')", name="ck_application_status"
        ),
        Index("ix_applications_project_status_created", "project_id", "status", "created_at"),
        Index("ix_applications_applicant_created", "applicant_id", "created_at"),
        Index("ix_applications_role_id", "role_id"),
    )
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="RESTRICT"))
    role_id: Mapped[uuid.UUID]
    applicant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    motivation: Mapped[str] = mapped_column(String(2000))
    experience: Mapped[str] = mapped_column(String(2000))
    portfolio: Mapped[str] = mapped_column(String(300), default="")
    status: Mapped[str] = mapped_column(String(12), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    withdrawn_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

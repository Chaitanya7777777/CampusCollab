"""Explicit wire contracts. Draft fields may be incomplete; publication is a separate check."""

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.application_schemas import ApplicationOut

ProjectType = Literal["", "Hackathon", "Personal Project", "Research", "Startup", "Open Source"]
PROJECT_TYPES = ["Hackathon", "Personal Project", "Research", "Startup", "Open Source"]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class RoleInput(Input):
    id: UUID
    title: str = Field(default="", max_length=100)
    responsibilities: str = Field(default="", max_length=600)
    skillIds: list[str] = Field(default_factory=list, max_length=15)
    openings: Annotated[int, Field(strict=True, ge=1, le=100)] | None = None

    @field_validator("skillIds")
    @classmethod
    def unique_skills(cls, values):
        return list(dict.fromkeys(values))


class ProjectInput(Input):
    title: str = Field(min_length=1, max_length=120)
    type: ProjectType = ""
    eventName: str = Field(default="", max_length=120)
    description: str = Field(default="", max_length=1200)
    capacity: Annotated[int, Field(strict=True, ge=2, le=100)] | None = None
    roles: list[RoleInput] = Field(default_factory=list, max_length=30)

    @model_validator(mode="after")
    def capacity_and_ids(self):
        if len({r.id for r in self.roles}) != len(self.roles):
            raise ValueError("Role IDs must be unique")
        if (
            self.capacity is not None
            and sum(r.openings or 0 for r in self.roles) > self.capacity - 1
        ):
            raise ValueError("Reserve one place for the owner")
        return self

    def complete(self):
        return bool(
            self.type
            and self.description
            and self.capacity
            and self.roles
            and all(r.title and r.skillIds and r.openings for r in self.roles)
        )


class RecruitmentInput(Input):
    recruitment: Literal["open", "closed"]


class SkillOut(BaseModel):
    id: str
    name: str


class PersonOut(BaseModel):
    id: UUID
    name: str
    campus: str
    department: str
    bio: str


class RoleOut(BaseModel):
    id: UUID
    projectId: UUID
    title: str
    category: str
    description: str
    positions: int
    skillIds: list[str]
    openings: int


class MembershipOut(BaseModel):
    id: UUID
    projectId: UUID
    studentId: UUID
    roleId: UUID | None
    joinedAt: datetime
    contribution: str


class TeamOut(BaseModel):
    membership: MembershipOut
    student: PersonOut


class ProjectOut(BaseModel):
    id: UUID
    ownerId: UUID
    title: str
    summary: str
    description: str
    type: str
    tag: str
    campus: str
    capacity: int
    status: Literal["published", "archived"]
    recruitment: Literal["open", "closed"]
    createdAt: datetime
    publishedAt: datetime | None
    archivedAt: datetime | None
    skillIds: list[str]
    skills: list[SkillOut]
    owner: PersonOut
    team: list[TeamOut]
    roles: list[RoleOut]
    memberCount: int
    openings: int
    application: ApplicationOut | None = None
    eligibility: str | None


class DraftOut(BaseModel):
    id: UUID
    ownerId: UUID
    status: Literal["draft", "published"]
    recruitment: Literal["open", "closed"]
    createdAt: datetime
    updatedAt: datetime
    values: ProjectInput


class SummaryRole(BaseModel):
    id: UUID
    title: str
    openings: int


class ProjectSummary(BaseModel):
    pendingCount: int = 0
    id: UUID
    title: str
    summary: str
    type: str
    status: Literal["draft", "published", "archived"]
    recruitment: Literal["open", "closed"]
    capacity: int | None
    memberCount: int
    openings: int
    roles: list[SummaryRole]
    updatedAt: datetime


class MyProjectsOut(BaseModel):
    owned: list[ProjectSummary]
    joined: list[ProjectSummary]


class DiscoveryOut(BaseModel):
    projects: list[ProjectOut]
    total: int
    page: int
    pageSize: int
    types: list[str]
    categories: list[str]
    campuses: list[str]
    skills: list[SkillOut]


class ManageOut(BaseModel):
    pendingCount: int = 0
    project: ProjectOut
    skills: list[SkillOut]

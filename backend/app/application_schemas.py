from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, TypeAdapter, field_validator

Status = Literal["pending", "accepted", "rejected", "withdrawn"]


class ApplicationInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    roleId: UUID
    motivation: str = Field(min_length=50, max_length=2000)
    experience: str = Field(min_length=20, max_length=2000)
    portfolio: str = Field(default="", max_length=300)

    @field_validator("portfolio")
    @classmethod
    def valid_url(cls, value):
        if value:
            TypeAdapter(HttpUrl).validate_python(value)
        return value


class ApplicationOut(BaseModel):
    id: UUID
    projectId: UUID
    roleId: UUID
    studentId: UUID
    motivation: str
    experience: str
    portfolio: str
    status: Status
    createdAt: datetime
    decidedAt: datetime | None
    withdrawnAt: datetime | None


class ApplicantEntry(BaseModel):
    application: ApplicationOut
    projectTitle: str
    projectType: str
    roleTitle: str
    projectStatus: Literal["published", "archived", "unavailable"]
    projectHref: str | None
    isMember: bool


class Counts(BaseModel):
    all: int = 0
    pending: int = 0
    accepted: int = 0
    rejected: int = 0
    withdrawn: int = 0


class ApplicantPage(BaseModel):
    applications: list[ApplicantEntry]
    counts: Counts
    total: int
    page: int
    pageSize: int

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    HttpUrl,
    SecretStr,
    TypeAdapter,
    field_validator,
)

Name = Annotated[str, Field(min_length=2, max_length=80)]
Academic = Annotated[str, Field(min_length=2, max_length=100)]
Bio = Annotated[str, Field(min_length=20, max_length=300)]
Semester = Literal["1", "2", "3", "4", "5", "6", "7", "8"]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LoginInput(Input):
    email: EmailStr = Field(max_length=254)
    password: SecretStr = Field(min_length=1, max_length=128)

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value):
        return value.strip().lower() if isinstance(value, str) else value


class RegisterInput(LoginInput):
    name: Name
    password: SecretStr = Field(min_length=12, max_length=128)

    @field_validator("name", mode="before")
    @classmethod
    def trim_name(cls, value):
        return value.strip() if isinstance(value, str) else value


class UserOut(BaseModel):
    emailVerifiedAt: datetime | None = None
    verificationEmailStatus: Literal["sent", "unavailable"] | None = None
    id: UUID
    name: str
    email: str
    createdAt: datetime


class ProfilePatch(Input):
    name: Name | None = None
    campus: Academic | None = None
    department: Academic | None = None
    semester: Semester | None = None
    bio: Bio | None = None
    github: str | None = Field(default=None, max_length=300)
    linkedin: str | None = Field(default=None, max_length=300)
    website: str | None = Field(default=None, max_length=300)
    skillIds: list[str] | None = None

    @field_validator(
        "name", "campus", "department", "bio", "github", "linkedin", "website", mode="before"
    )
    @classmethod
    def trim_text(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("name")
    @classmethod
    def name_not_null(cls, value):
        if value is None:
            raise ValueError("name cannot be null")
        return value

    @field_validator("github", "linkedin", "website")
    @classmethod
    def validate_url(cls, value):
        if value in (None, ""):
            return None
        parsed = TypeAdapter(HttpUrl).validate_python(value)
        if parsed.username or parsed.password:
            raise ValueError("URLs must not include credentials")
        return value

    @field_validator("skillIds", mode="before")
    @classmethod
    def normalize_skills(cls, value):
        if value is None:
            raise ValueError("skillIds cannot be null; use [] to clear")
        if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
            raise ValueError("skillIds must be a list of catalog IDs")
        unique = list(dict.fromkeys(value))
        if len(unique) > 15 or len(value) > 100:
            raise ValueError("Select at most 15 unique skills")
        return unique


class ProfileOut(UserOut):
    campus: str | None
    department: str | None
    semester: str | None
    bio: str | None
    github: str | None
    linkedin: str | None
    website: str | None
    skillIds: list[str]
    updatedAt: datetime


class SkillOut(BaseModel):
    id: str  # Stable catalog slug, mapped to an internal deterministic UUID.
    name: str


class CsrfOut(BaseModel):
    csrfToken: str


class HealthOut(BaseModel):
    status: str

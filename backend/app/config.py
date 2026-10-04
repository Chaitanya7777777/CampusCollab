from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", hide_input_in_errors=True)

    app_env: Literal["development", "test", "production"] = "development"
    database_url: SecretStr
    csrf_secret: SecretStr
    allowed_origins: list[str] = ["http://localhost:3000", "http://localhost:8000"]
    session_ttl_seconds: int = Field(default=604800, ge=60, le=2592000)
    csrf_ttl_seconds: int = Field(default=3600, ge=60, le=86400)
    cookie_secure: bool = False
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    session_cookie: str = "cc_session"
    csrf_cookie: str = "cc_csrf"

    @model_validator(mode="after")
    def secure_configuration(self):
        secret = self.csrf_secret.get_secret_value()
        if len(secret) < 32 or secret.startswith("replace-"):
            raise ValueError("Set a random CSRF_SECRET of at least 32 characters")
        if make_url(self.database_url.get_secret_value()).drivername != "postgresql+asyncpg":
            raise ValueError("DATABASE_URL must use postgresql+asyncpg")
        if not self.allowed_origins:
            raise ValueError("Explicit allowed origins are required")
        for origin in self.allowed_origins:
            parsed = urlsplit(origin)
            if (
                parsed.scheme not in ("http", "https")
                or not parsed.netloc
                or parsed.path
                or parsed.query
                or parsed.fragment
                or parsed.username
                or "*" in origin
            ):
                raise ValueError("Origins must be explicit scheme://host[:port] values")
            if self.app_env == "production" and parsed.scheme != "https":
                raise ValueError("Production origins must use HTTPS")
        if (
            self.app_env == "production" or self.cookie_samesite == "none"
        ) and not self.cookie_secure:
            raise ValueError("Production and SameSite=None require Secure cookies")
        if self.session_cookie == self.csrf_cookie:
            raise ValueError("Session and CSRF cookie names must differ")
        return self

from ipaddress import ip_network
from typing import Literal
from urllib.parse import urlsplit

from pydantic import EmailStr, Field, HttpUrl, SecretStr, TypeAdapter, model_validator
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
    frontend_base_url: str = "http://localhost:3000"
    reset_ttl_seconds: int = Field(default=1800, ge=60, le=86400)
    verification_ttl_seconds: int = Field(default=86400, ge=60, le=604800)
    signup_code_ttl_seconds: int = Field(default=600, ge=60, le=1800)
    signup_code_attempts: int = Field(default=5, ge=1, le=10)
    signup_resend_cooldown_seconds: int = Field(default=60, ge=1, le=600)
    email_provider: Literal["smtp", "brevo"] = "smtp"
    brevo_api_key: SecretStr | None = None
    brevo_sender_email: EmailStr | None = None
    brevo_sender_name: str = Field(default="CampusCollab", min_length=1, max_length=100)
    brevo_timeout_seconds: float = Field(default=5, ge=1, le=10)
    smtp_host: str = "127.0.0.1"
    smtp_port: int = Field(default=1025, ge=1, le=65535)
    smtp_username: str | None = None
    smtp_password: SecretStr | None = None
    smtp_from: str = "CampusCollab <noreply@campuscollab.local>"
    smtp_tls: Literal["none", "starttls", "tls"] = "none"
    smtp_timeout_seconds: float = Field(default=5, ge=1, le=10)
    trusted_proxy_networks: list[str] = []
    rate_window_seconds: int = Field(default=900, ge=1, le=86400)
    rate_ip_limit: int = Field(default=300, ge=1, le=10000)
    rate_login_limit: int = Field(default=10, ge=1, le=1000)
    rate_signup_limit: int = Field(default=5, ge=1, le=1000)
    rate_email_limit: int = Field(default=3, ge=1, le=1000)
    rate_token_limit: int = Field(default=10, ge=1, le=1000)

    @model_validator(mode="after")
    def secure_configuration(self):
        TypeAdapter(HttpUrl).validate_python(self.frontend_base_url)
        front = urlsplit(self.frontend_base_url)
        if (
            front.scheme not in ("http", "https")
            or not front.hostname
            or front.username
            or front.password
            or front.query
            or front.fragment
            or front.path not in ("", "/")
        ):
            raise ValueError("FRONTEND_BASE_URL must be one explicit HTTP(S) origin")
        if self.app_env == "production" and (
            front.scheme != "https" or (self.email_provider == "smtp" and self.smtp_tls == "none")
        ):
            raise ValueError("Production requires HTTPS frontend links and TLS for SMTP delivery")
        if self.email_provider == "brevo":
            key = self.brevo_api_key.get_secret_value() if self.brevo_api_key else ""
            if (
                not key
                or key.lower().startswith(("replace-", "your-", "your_", "<"))
                or not key.isascii()
                or any(ord(c) <= 32 or ord(c) == 127 for c in key)
            ):
                raise ValueError("Set BREVO_API_KEY privately when EMAIL_PROVIDER=brevo")
            if not self.brevo_sender_email:
                raise ValueError("BREVO_SENDER_EMAIL is required when EMAIL_PROVIDER=brevo")
            if not self.brevo_sender_name.strip() or any(
                ord(c) < 32 or ord(c) == 127 for c in self.brevo_sender_name
            ):
                raise ValueError("BREVO_SENDER_NAME must be a nonempty, single-line name")
        if "\r" in self.smtp_from or "\n" in self.smtp_from:
            raise ValueError("Invalid SMTP sender")
        for network in self.trusted_proxy_networks:
            if ip_network(network).prefixlen == 0:
                raise ValueError("Wildcard proxy trust is prohibited")
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

    @property
    def email_timeout_seconds(self) -> float:
        return (
            self.brevo_timeout_seconds
            if self.email_provider == "brevo"
            else self.smtp_timeout_seconds
        )

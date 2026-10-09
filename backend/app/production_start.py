"""Render Free entry point: migrate successfully before binding a public port."""

import os
from pathlib import Path

import uvicorn
from alembic import command
from alembic.config import Config

from app.config import Settings
from app.startup_diagnostics import StartupSettingError, report


def main():
    stage = "configuration_validation"

    def set_stage(value):
        nonlocal stage
        stage = value

    try:
        settings = Settings()
        if settings.app_env != "production":
            raise StartupSettingError("APP_ENV")
        try:
            port = int(os.environ.get("PORT", "10000"))
        except ValueError:
            raise StartupSettingError("PORT") from None
        if not 1 <= port <= 65535:
            raise StartupSettingError("PORT")
        config = Config(str(Path(__file__).parents[1] / "alembic.ini"))
        config.attributes["startup_stage"] = set_stage
        stage = "migration"
        command.upgrade(config, "head")
        stage = "server_launch"
        # Construct before Uvicorn so factory failures cannot print raw configuration errors.
        from app.main import create_app

        app = create_app(settings)
        uvicorn.run(
            app,
            host="0.0.0.0",
            port=port,
            access_log=False,
            proxy_headers=False,
        )
    except (Exception, SystemExit) as exc:
        if isinstance(exc, SystemExit) and exc.code in (None, 0):
            raise
        report(exc, stage)
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()

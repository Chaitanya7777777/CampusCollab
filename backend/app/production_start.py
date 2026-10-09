"""Render Free entry point: migrate successfully before binding a public port."""

import logging
import os
from pathlib import Path

import uvicorn
from alembic import command
from alembic.config import Config

from app.config import Settings


def main():
    try:
        settings = Settings()
        if settings.app_env != "production":
            raise ValueError("Production settings required")
        port = int(os.environ.get("PORT", "10000"))
        if not 1 <= port <= 65535:
            raise ValueError("Invalid port")
        command.upgrade(Config(str(Path(__file__).parents[1] / "alembic.ini")), "head")
    except Exception:
        logging.getLogger("campuscollab").error("production_startup_failed")
        raise SystemExit(1) from None
    uvicorn.run(
        "app.main:create_app",
        factory=True,
        host="0.0.0.0",
        port=port,
        access_log=False,
        proxy_headers=False,
    )


if __name__ == "__main__":
    main()

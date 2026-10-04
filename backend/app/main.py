import json
import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app import applications, auth, profiles, projects, skills
from app.config import Settings
from app.db import database
from app.schemas import HealthOut

logger = logging.getLogger("campuscollab")


class JsonFormatter(logging.Formatter):
    def format(self, record):
        return json.dumps(
            {
                "level": record.levelname,
                "event": record.getMessage(),
                **getattr(record, "fields", {}),
            }
        )


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    engine, factory = database(settings)

    @asynccontextmanager
    async def lifespan(app):
        yield
        await engine.dispose()

    app = FastAPI(title="CampusCollab API", version="0.1.0", lifespan=lifespan)
    app.state.settings, app.state.engine, app.state.session_factory = settings, engine, factory
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(JsonFormatter())
        logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False

    @app.middleware("http")
    async def request_log(request: Request, call_next):
        start = time.monotonic()
        request_id = str(uuid.uuid4())
        try:
            response = await call_next(request)
        except Exception:
            # Never log exception text: DB errors may embed parameters or DSNs.
            logger.error("request_failed", extra={"fields": {"request_id": request_id}})
            response = JSONResponse({"detail": "Internal server error"}, status_code=500)
        response.headers["X-Request-ID"] = request_id
        response.headers["Cache-Control"] = "no-store"
        route = request.scope.get("route")
        logger.info(
            "request_completed",
            extra={
                "fields": {
                    "request_id": request_id,
                    "method": request.method,
                    "route": getattr(route, "path", "unmatched"),
                    "status": response.status_code,
                    "duration_ms": round((time.monotonic() - start) * 1000),
                }
            },
        )
        return response

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH"],
        allow_headers=["Content-Type", "X-CSRF-Token"],
        expose_headers=["X-Request-ID"],
    )

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        # FastAPI's default errors include submitted input, including plaintext passwords.
        return JSONResponse(
            {
                "detail": [
                    {"loc": list(e["loc"]), "type": e["type"], "msg": "Invalid value"}
                    for e in exc.errors()
                ]
            },
            status_code=422,
        )

    @app.exception_handler(SQLAlchemyError)
    async def database_error(request, exc):
        logger.error("database_error")
        return JSONResponse({"detail": "Database temporarily unavailable"}, status_code=503)

    @app.get("/health/live", response_model=HealthOut)
    async def live():
        return HealthOut(status="ok")

    @app.get("/health/ready", response_model=HealthOut)
    async def ready():
        try:
            async with engine.connect() as connection:
                await connection.execute(text("SELECT 1"))
        except Exception:
            return JSONResponse({"status": "unavailable"}, status_code=503)
        return HealthOut(status="ready")

    for router in (
        auth.router,
        profiles.router,
        skills.router,
        projects.router,
        applications.router,
    ):
        app.include_router(router, prefix="/api/v1")
    return app

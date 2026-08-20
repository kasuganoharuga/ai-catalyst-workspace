from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging
from app.core.sentry import init_sentry
from app.middleware.request_id import request_id_middleware
from app.routers import ai, health


def create_app() -> FastAPI:
    configure_logging(settings)
    init_sentry(settings)

    app = FastAPI(
        title=settings.app_name,
        description="Reserved AI service for future workflow execution.",
        version="0.1.0",
    )

    app.middleware("http")(request_id_middleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_exception_handlers(app)

    app.include_router(health.router, prefix="/health", tags=["health"])
    app.include_router(ai.router, prefix="/ai", tags=["ai"])

    return app


app = create_app()

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration

from app.core.config import Settings
from app.core.denied_keys import redact_value
from app.core.logging import SERVICE_NAME


def _scrub_event(event: dict, _hint: dict) -> dict | None:
    for section in ("extra", "contexts", "tags", "request"):
        if section in event and isinstance(event[section], dict):
            event[section] = redact_value(event[section])  # type: ignore[assignment]
    return event


def init_sentry(settings: Settings) -> None:
    dsn = (settings.sentry_dsn or "").strip()
    if not dsn:
        return

    sentry_sdk.init(
        dsn=dsn,
        environment=settings.app_env,
        release=settings.release,
        send_default_pii=False,
        traces_sample_rate=0.1 if settings.app_env == "production" else 0.2,
        integrations=[
            StarletteIntegration(transaction_style="endpoint"),
            FastApiIntegration(transaction_style="endpoint"),
        ],
        before_send=_scrub_event,
    )
    sentry_sdk.set_tag("service", SERVICE_NAME)

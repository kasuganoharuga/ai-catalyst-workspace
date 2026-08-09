import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration

from app.core.config import Settings
from app.core.logging import SERVICE_NAME

_DENIED_KEYS = {
    "password",
    "passwd",
    "secret",
    "token",
    "authorization",
    "cookie",
    "set-cookie",
    "api_key",
    "api-key",
    "access_token",
    "refresh_token",
    "id_token",
    "bearer",
    "private_key",
    "client_secret",
    "session",
    "answer",
    "answer_text",
    "answers",
    "prompt",
    "prompts",
    "markdown",
    "email",
    "phone",
}


def _scrub_event(event: dict, _hint: dict) -> dict | None:
    def scrub(value: object, key: str | None = None) -> object:
        if key and key.lower().replace("-", "_") in _DENIED_KEYS:
            return "[Redacted]"
        if isinstance(value, dict):
            return {k: scrub(v, k) for k, v in value.items()}
        if isinstance(value, list):
            return [scrub(item) for item in value]
        return value

    for section in ("extra", "contexts", "tags", "request"):
        if section in event and isinstance(event[section], dict):
            event[section] = scrub(event[section])  # type: ignore[assignment]
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

import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any

from app.core.config import Settings
from app.core.denied_keys import redact_value

SERVICE_NAME = "aicatalyst-api"

_RESERVED_RECORD_KEYS = {
    "name",
    "msg",
    "args",
    "levelname",
    "levelno",
    "pathname",
    "filename",
    "module",
    "exc_info",
    "exc_text",
    "stack_info",
    "lineno",
    "funcName",
    "created",
    "msecs",
    "relativeCreated",
    "thread",
    "threadName",
    "processName",
    "process",
    "message",
    "asctime",
    "taskName",
}


class JsonFormatter(logging.Formatter):
    """One-line JSON for CloudWatch; keeps a stable `event` field."""

    def __init__(self, *, environment: str, service: str = SERVICE_NAME) -> None:
        super().__init__()
        self.environment = environment
        self.service = service

    def format(self, record: logging.LogRecord) -> str:
        event = getattr(record, "event", None)
        if not isinstance(event, str) or not event:
            event = "log_message"

        payload: dict[str, Any] = {
            "event": event,
            "message": record.getMessage(),
            "level": record.levelname.lower(),
            "service": self.service,
            "environment": self.environment,
            "logger": record.name,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        for key, value in record.__dict__.items():
            if key in _RESERVED_RECORD_KEYS or key == "event":
                continue
            if value is None:
                continue
            payload[key] = value

        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)

        return json.dumps(redact_value(payload), default=str)


def configure_logging(settings: Settings) -> None:
    root = logging.getLogger()
    root.handlers.clear()
    root.setLevel(settings.log_level.upper())

    handler = logging.StreamHandler(sys.stdout)
    if settings.app_env in ("staging", "production"):
        handler.setFormatter(
            JsonFormatter(environment=settings.app_env, service=SERVICE_NAME)
        )
    else:
        handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
        )
    root.addHandler(handler)

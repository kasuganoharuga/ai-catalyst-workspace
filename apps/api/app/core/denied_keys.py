"""Load the shared deny-list from packages/observability/denied-keys.json.

Canonical source is the monorepo JSON file. The API Docker image copies it
next to this module as denied-keys.json.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path


@lru_cache
def denied_key_set() -> frozenset[str]:
    candidates = [
        Path(__file__).with_name("denied-keys.json"),
        Path(__file__).resolve().parents[4]
        / "packages"
        / "observability"
        / "denied-keys.json",
    ]
    for path in candidates:
        if path.is_file():
            raw = json.loads(path.read_text(encoding="utf-8"))
            keys = [
                *(raw.get("secretKeys") or []),
                *(raw.get("contentKeys") or []),
            ]
            return frozenset(k.lower().replace("-", "_") for k in keys)
    raise FileNotFoundError(
        "denied-keys.json not found next to denied_keys.py or at "
        "packages/observability/denied-keys.json"
    )


def is_denied_key(key: str) -> bool:
    return key.lower().replace("-", "_") in denied_key_set()


def redact_value(value: object, key: str | None = None) -> object:
    if key and is_denied_key(key):
        return "[Redacted]"
    if isinstance(value, dict):
        return {k: redact_value(v, k) for k, v in value.items()}
    if isinstance(value, list):
        return [redact_value(item) for item in value]
    return value

import base64
import hashlib
import hmac
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from threading import Lock
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field

from app.core.config import settings
from app.core.errors import ApiError


def new_uuid() -> UUID:
    return uuid4()


def utc_now() -> datetime:
    return datetime.now(UTC)


class PageParams(BaseModel):
    model_config = ConfigDict(extra="forbid")

    limit: int = Field(default=25, ge=1, le=100)
    cursor: str | None = None


def _sign(value: str) -> str:
    return hmac.new(settings.session_secret.encode(), value.encode(), hashlib.sha256).hexdigest()


def encode_cursor(payload: dict[str, Any]) -> str:
    body = json.dumps(payload, separators=(",", ":"), sort_keys=True)
    encoded = base64.urlsafe_b64encode(body.encode()).decode().rstrip("=")
    return f"{encoded}.{_sign(encoded)}"


def decode_cursor(cursor: str) -> dict[str, Any]:
    try:
        encoded, signature = cursor.split(".", 1)
        if not hmac.compare_digest(signature, _sign(encoded)):
            raise ValueError
        padded = encoded + "=" * (-len(encoded) % 4)
        value = json.loads(base64.urlsafe_b64decode(padded).decode())
        if not isinstance(value, dict):
            raise ValueError
        return value
    except (ValueError, json.JSONDecodeError, UnicodeDecodeError):
        raise ApiError(422, "VALIDATION_ERROR", "The cursor is invalid.") from None


def parse_if_match(value: str | None) -> int:
    if value is None or len(value) < 3 or not (value.startswith('"') and value.endswith('"')):
        raise ApiError(422, "VALIDATION_ERROR", "If-Match must contain a quoted version.")
    try:
        version = int(value[1:-1])
    except ValueError:
        raise ApiError(422, "VALIDATION_ERROR", "If-Match must contain a quoted version.") from None
    if version < 1:
        raise ApiError(422, "VALIDATION_ERROR", "If-Match must contain a positive version.")
    return version


@dataclass(frozen=True)
class IdempotentResult:
    fingerprint: str
    status_code: int
    body: dict[str, Any]


class IdempotencyStore:
    """M1 in-memory primitive; replace storage with a durable table before production mutations."""

    def __init__(self) -> None:
        self._items: dict[str, IdempotentResult] = {}
        self._lock = Lock()

    def get(self, key: str, fingerprint: str) -> IdempotentResult | None:
        with self._lock:
            item = self._items.get(key)
        if item is None:
            return None
        if not hmac.compare_digest(item.fingerprint, fingerprint):
            raise ApiError(
                409,
                "IDEMPOTENCY_CONFLICT",
                "The idempotency key was reused with different content.",
            )
        return item

    def put(
        self,
        key: str,
        fingerprint: str,
        status_code: int,
        body: dict[str, Any],
    ) -> IdempotentResult:
        item = IdempotentResult(fingerprint, status_code, body)
        with self._lock:
            existing = self._items.get(key)
            if existing is not None:
                if not hmac.compare_digest(existing.fingerprint, fingerprint):
                    raise ApiError(
                        409,
                        "IDEMPOTENCY_CONFLICT",
                        "The idempotency key was reused with different content.",
                    )
                return existing
            self._items[key] = item
        return item

    def clear(self) -> None:
        with self._lock:
            self._items.clear()


idempotency_store = IdempotencyStore()


def request_fingerprint(actor: str, method: str, path: str, body: Any) -> str:
    canonical = json.dumps(
        {"actor": actor, "method": method, "path": path, "body": body},
        separators=(",", ":"),
        sort_keys=True,
    )
    return hmac.new(
        settings.session_secret.encode(), canonical.encode(), hashlib.sha256
    ).hexdigest()

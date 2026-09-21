from datetime import UTC, datetime

_override: datetime | None = None


def now() -> datetime:
    return _override or datetime.now(UTC)


def set_override(value: datetime | None) -> None:
    global _override
    _override = value


def utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def z(value: datetime) -> str:
    return utc(value).isoformat(timespec="seconds").replace("+00:00", "Z")

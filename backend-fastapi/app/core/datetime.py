from __future__ import annotations

from datetime import UTC, datetime


def utc_now() -> datetime:
    """Return the current UTC timestamp as a naive datetime.

    The app stores UTC timestamps without tzinfo in most SQLModel fields, so
    this helper avoids `datetime.utcnow()` deprecations while preserving that
    storage contract.
    """

    return datetime.now(UTC).replace(tzinfo=None)

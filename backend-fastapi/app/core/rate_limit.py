from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import DefaultDict, Tuple

from fastapi import HTTPException, Request, status

from app.core.config import settings


_BUCKETS: DefaultDict[Tuple[str, str], list[datetime]] = defaultdict(list)


def enforce_rate_limit(request: Request, key: str, limit: int, window_seconds: int) -> None:
    """
    Rate limiting muy simple en memoria, pensado para proteger endpoints
    sensibles (login, MFA) en entornos pequeños.

    - `key` permite separar distintos buckets lógicos.
    - `limit` es el número máximo de peticiones permitidas en el intervalo.
    - `window_seconds` es la ventana de tiempo en segundos.

    En entorno `local` no se aplica para no molestar en desarrollo/tests.
    """

    if settings.env == "local":
        return

    client_host = request.client.host if request.client else "unknown"
    bucket_id = (key, client_host)

    now = datetime.now(timezone.utc)
    window_start = now - timedelta(seconds=window_seconds)

    # Limpiamos timestamps antiguos
    timestamps = [ts for ts in _BUCKETS[bucket_id] if ts >= window_start]
    timestamps.append(now)
    _BUCKETS[bucket_id] = timestamps

    if len(timestamps) > limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiados intentos, inténtalo de nuevo en unos instantes.",
        )


import redis

from app.ai.client import OllamaClient
from app.core.config import settings
from app.workers.celery_app import celery_app


def _redis_client() -> redis.Redis:
    return redis.Redis.from_url(settings.redis_url, decode_responses=True)


@celery_app.task(name="app.workers.tasks.health.ai_health_check")
def ai_health_check() -> None:
    client = OllamaClient()
    redis_client = _redis_client()

    is_ok = client.health_check(timeout=settings.ai_health_check_timeout_seconds)
    if is_ok:
        redis_client.delete("ai:down")
    else:
        redis_client.set("ai:down", "1", ex=settings.ai_circuit_breaker_ttl_seconds)

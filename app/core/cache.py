"""Small cache abstraction with safe memory and Redis backends."""

from __future__ import annotations

import hashlib
import json
import time
from collections.abc import Callable
from functools import lru_cache
from typing import Any, Protocol

from loguru import logger

from app.config import settings


class CacheBackend(Protocol):
    backend_name: str
    namespace: str

    def get(self, key: str) -> Any | None: ...
    def set(self, key: str, value: Any, ttl_seconds: int | None = None) -> None: ...
    def delete(self, key: str) -> None: ...
    def clear_namespace(self, namespace: str | None = None) -> None: ...


class NoopCache:
    backend_name = "noop"

    def __init__(self, namespace: str) -> None:
        self.namespace = namespace

    def get(self, key: str) -> Any | None:
        _record_cache_miss(self.backend_name, self.namespace)
        return None

    def set(self, key: str, value: Any, ttl_seconds: int | None = None) -> None:
        return None

    def delete(self, key: str) -> None:
        return None

    def clear_namespace(self, namespace: str | None = None) -> None:
        return None


class MemoryCache:
    backend_name = "memory"

    def __init__(
        self,
        namespace: str,
        *,
        time_func: Callable[[], float] | None = None,
    ) -> None:
        self.namespace = namespace
        self._time = time_func or time.monotonic
        self._store: dict[str, tuple[float | None, Any]] = {}

    def get(self, key: str) -> Any | None:
        item = self._store.get(key)
        if item is None:
            _record_cache_miss(self.backend_name, self.namespace)
            return None

        expires_at, value = item
        if expires_at is not None and expires_at <= self._time():
            self._store.pop(key, None)
            _record_cache_miss(self.backend_name, self.namespace)
            return None
        _record_cache_hit(self.backend_name, self.namespace)
        return value

    def set(self, key: str, value: Any, ttl_seconds: int | None = None) -> None:
        expires_at = None
        if ttl_seconds is not None and ttl_seconds > 0:
            expires_at = self._time() + ttl_seconds
        self._store[key] = (expires_at, value)

    def delete(self, key: str) -> None:
        self._store.pop(key, None)

    def clear_namespace(self, namespace: str | None = None) -> None:
        prefix = f"{namespace or self.namespace}:"
        for key in list(self._store):
            if key.startswith(prefix):
                self._store.pop(key, None)


class RedisCache:
    backend_name = "redis"

    def __init__(self, redis_client: Any, namespace: str) -> None:
        self.client = redis_client
        self.namespace = namespace

    def get(self, key: str) -> Any | None:
        try:
            raw = self.client.get(key)
            if raw is None:
                _record_cache_miss(self.backend_name, self.namespace)
                return None
            if isinstance(raw, bytes):
                raw = raw.decode("utf-8")
            value = json.loads(raw)
            _record_cache_hit(self.backend_name, self.namespace)
            return value
        except Exception:
            logger.warning("Redis cache get failed; treating as cache miss")
            _record_cache_miss(self.backend_name, self.namespace)
            return None

    def set(self, key: str, value: Any, ttl_seconds: int | None = None) -> None:
        try:
            payload = json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)
            if ttl_seconds is not None and ttl_seconds > 0:
                self.client.setex(key, ttl_seconds, payload)
            else:
                self.client.set(key, payload)
        except Exception:
            logger.warning("Redis cache set failed; request will continue without cached value")

    def delete(self, key: str) -> None:
        try:
            self.client.delete(key)
        except Exception:
            logger.warning("Redis cache delete failed")

    def clear_namespace(self, namespace: str | None = None) -> None:
        prefix = f"{namespace or self.namespace}:"
        try:
            keys = list(self.client.scan_iter(f"{prefix}*"))
            if keys:
                self.client.delete(*keys)
        except Exception:
            logger.warning("Redis cache namespace clear failed")


def get_cache() -> CacheBackend:
    return _get_cache_cached(
        settings.cache_enabled,
        settings.cache_backend,
        settings.cache_namespace,
        settings.redis_url,
    )


@lru_cache(maxsize=1)
def _get_cache_cached(
    enabled: bool,
    backend: str,
    namespace: str,
    redis_url: str,
) -> CacheBackend:
    if not enabled:
        return NoopCache(namespace=namespace)

    normalized_backend = (backend or "memory").strip().lower()
    if normalized_backend == "redis":
        redis_cache = _build_redis_cache(redis_url=redis_url, namespace=namespace)
        if redis_cache is not None:
            return redis_cache
        logger.warning("Redis cache unavailable; falling back to memory cache")
        return MemoryCache(namespace=namespace)

    if normalized_backend != "memory":
        logger.warning("Unknown cache backend {!r}; falling back to memory cache", backend)
    return MemoryCache(namespace=namespace)


def reset_cache() -> None:
    _get_cache_cached.cache_clear()


def _build_redis_cache(redis_url: str, namespace: str) -> RedisCache | None:
    try:
        import redis

        client = redis.Redis.from_url(redis_url, decode_responses=False)
        client.ping()
        return RedisCache(redis_client=client, namespace=namespace)
    except Exception:
        return None


def make_cache_key(*parts: object, namespace: str | None = None) -> str:
    prefix = _safe_key_part(namespace or settings.cache_namespace)
    safe_parts = [_safe_key_part(part) for part in parts]
    return ":".join([prefix, *safe_parts])


def make_hashed_cache_key(*parts: object, namespace: str | None = None) -> str:
    if len(parts) < 2:
        raise ValueError("make_hashed_cache_key requires at least one prefix part and one payload")
    *prefix_parts, payload = parts
    digest = hashlib.sha256(_stable_json(payload).encode("utf-8")).hexdigest()
    return make_cache_key(*prefix_parts, digest, namespace=namespace)


def _stable_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)


def _safe_key_part(value: object) -> str:
    text = str(value).strip().lower()
    safe_chars = []
    for char in text:
        if char.isalnum() or char in {"_", "-"}:
            safe_chars.append(char)
        else:
            safe_chars.append("_")
    return "".join(safe_chars).strip("_") or "unknown"


def _record_cache_hit(backend: str, namespace: str) -> None:
    try:
        from app.core import metrics

        metrics.record_cache_hit(backend, namespace)
    except Exception:
        return None


def _record_cache_miss(backend: str, namespace: str) -> None:
    try:
        from app.core import metrics

        metrics.record_cache_miss(backend, namespace)
    except Exception:
        return None

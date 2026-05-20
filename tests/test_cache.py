from __future__ import annotations

from app.core import cache as cache_module
from app.core.cache import MemoryCache, NoopCache, make_cache_key, make_hashed_cache_key


class ManualClock:
    def __init__(self) -> None:
        self.now = 100.0

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


def test_memory_cache_set_get_round_trip() -> None:
    cache = MemoryCache(namespace="pytest")

    cache.set("pytest:agentops:summary:v1", {"total_runs": 3}, ttl_seconds=30)

    assert cache.get("pytest:agentops:summary:v1") == {"total_runs": 3}


def test_memory_cache_ttl_expiry_returns_miss() -> None:
    clock = ManualClock()
    cache = MemoryCache(namespace="pytest", time_func=clock)
    cache.set("pytest:agentops:summary:v1", "cached", ttl_seconds=10)

    clock.advance(11)

    assert cache.get("pytest:agentops:summary:v1") is None


def test_memory_cache_delete_removes_key() -> None:
    cache = MemoryCache(namespace="pytest")
    cache.set("pytest:agentops:summary:v1", "cached", ttl_seconds=30)

    cache.delete("pytest:agentops:summary:v1")

    assert cache.get("pytest:agentops:summary:v1") is None


def test_noop_cache_never_persists_values() -> None:
    cache = NoopCache(namespace="pytest")

    cache.set("pytest:agentops:summary:v1", "cached", ttl_seconds=30)

    assert cache.get("pytest:agentops:summary:v1") is None


def test_cache_key_helpers_namespace_and_hash_raw_inputs() -> None:
    raw_query = "redis outage with api token sk-test-secret"

    plain_key = make_cache_key("agentops", "summary", "v1", namespace="multi_rag_agent")
    hashed_key = make_hashed_cache_key(
        "web_search",
        "v1",
        {"query": raw_query, "max_results": 3},
        namespace="multi_rag_agent",
    )

    assert plain_key == "multi_rag_agent:agentops:summary:v1"
    assert hashed_key.startswith("multi_rag_agent:web_search:v1:")
    assert raw_query not in hashed_key
    assert "sk-test-secret" not in hashed_key
    assert len(hashed_key.rsplit(":", 1)[-1]) == 64


def test_redis_backend_falls_back_to_memory_when_unavailable(monkeypatch) -> None:
    monkeypatch.setattr(cache_module, "_build_redis_cache", lambda redis_url, namespace: None)
    cache_module.reset_cache()
    try:
        backend = cache_module._get_cache_cached(
            True,
            "redis",
            "pytest",
            "redis://127.0.0.1:6379/15",
        )
    finally:
        cache_module.reset_cache()

    assert isinstance(backend, MemoryCache)

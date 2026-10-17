from __future__ import annotations

import sys
from types import ModuleType

import httpx
import pytest

from app.config import settings
from app.core import web_search


def _response(monkeypatch, data: dict):
    calls = []

    def post(url, *, json, timeout):
        calls.append({"url": url, "json": json, "timeout": timeout})
        return httpx.Response(
            200,
            json={"status": "ok", "data": data},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(httpx, "post", post)
    return calls


def test_settings_timeout_fallback_allows_browser_retry(monkeypatch):
    monkeypatch.setattr(settings, "open_websearch_timeout_sec", None)
    assert web_search.get_open_websearch_config()["timeout"] == 90.0


def test_settings_explicit_timeout_is_preserved(monkeypatch):
    monkeypatch.setattr(settings, "open_websearch_timeout_sec", 7.5)
    assert web_search.get_open_websearch_config()["timeout"] == 7.5


def test_environment_timeout_fallback_allows_browser_retry(monkeypatch):
    monkeypatch.setitem(sys.modules, "app.config", ModuleType("app.config"))
    monkeypatch.delenv("OPEN_WEBSEARCH_TIMEOUT_SEC", raising=False)
    assert web_search.get_open_websearch_config()["timeout"] == 90.0


def test_environment_explicit_timeout_is_preserved(monkeypatch):
    monkeypatch.setitem(sys.modules, "app.config", ModuleType("app.config"))
    monkeypatch.setenv("OPEN_WEBSEARCH_TIMEOUT_SEC", "12.5")
    assert web_search.get_open_websearch_config()["timeout"] == 12.5


def test_request_timeout_fallback_allows_browser_retry(monkeypatch):
    monkeypatch.setattr(
        web_search, "get_open_websearch_config",
        lambda: {"base_url": "http://127.0.0.1:3210"},
    )
    calls = _response(monkeypatch, {"results": []})
    assert web_search.search_open_websearch("nginx documentation", 3) == []
    assert calls[0]["timeout"] == 90.0


@pytest.mark.parametrize("search_mode", ["auto", "playwright"])
def test_daemon_protocol_and_result_mapping(monkeypatch, search_mode):
    monkeypatch.setattr(
        web_search, "get_open_websearch_config",
        lambda: {
            "base_url": "http://127.0.0.1:3210/",
            "engine": "bing",
            "search_mode": search_mode,
            "timeout": 42.0,
        },
    )
    calls = _response(monkeypatch, {"results": [{
        "title": "nginx documentation", "url": "https://nginx.org/en/docs/",
        "description": "Official reference", "engine": "bing", "source": "web",
    }]})
    assert web_search.search_open_websearch("nginx documentation", 2) == [{
        "title": "nginx documentation", "url": "https://nginx.org/en/docs/",
        "snippet": "Official reference", "engine": "bing", "source": "web",
    }]
    expected_payload = {"query": "nginx documentation", "limit": 2, "engines": ["bing"]}
    if search_mode == "playwright":
        expected_payload["searchMode"] = "playwright"
    assert calls == [{
        "url": "http://127.0.0.1:3210/search", "json": expected_payload, "timeout": 42.0,
    }]


def test_empty_results_surface_real_engine_failure(monkeypatch):
    _response(monkeypatch, {
        "results": [],
        "partialFailures": [{"engine": "bing", "code": "engine_error", "message": "request timed out"}],
    })
    with pytest.raises(RuntimeError, match="bing.*request timed out"):
        web_search.search_open_websearch("nginx documentation", 2)


def test_engine_failure_is_concise_single_line(monkeypatch):
    _response(monkeypatch, {
        "results": [],
        "partialFailures": [{"engine": "bing", "message": "request timed out\n" + "detail " * 100}],
    })
    with pytest.raises(RuntimeError) as raised:
        web_search.search_open_websearch("nginx documentation", 2)
    message = str(raised.value)
    assert "request timed out" in message
    assert "\n" not in message
    assert len(message) <= 320


def test_engine_failure_without_message_preserves_code(monkeypatch):
    _response(monkeypatch, {
        "results": [],
        "partialFailures": [{"engine": "bing", "code": "unsupported_engine"}],
    })
    with pytest.raises(RuntimeError, match="bing.*unsupported_engine"):
        web_search.search_open_websearch("nginx documentation", 2)


def test_partial_success_keeps_valid_results(monkeypatch):
    _response(monkeypatch, {
        "results": [{"title": "Reference", "url": "https://nginx.org/en/docs/", "description": "Official"}],
        "partialFailures": [{"engine": "other", "message": "request timed out"}],
    })
    hits = web_search.search_open_websearch("nginx documentation", 2)
    assert len(hits) == 1
    assert hits[0]["url"] == "https://nginx.org/en/docs/"


def test_genuine_no_results_stays_empty(monkeypatch):
    _response(monkeypatch, {"results": [], "partialFailures": []})
    assert web_search.search_open_websearch("unmatched phrase", 2) == []

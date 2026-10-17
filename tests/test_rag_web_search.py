"""The shipped setup must honor RAG's independent Web and MCP switches."""

from pathlib import Path
from types import SimpleNamespace

import pytest
from langchain_core.messages import AIMessage, AIMessageChunk

from app.config import Settings
import app.services.rag_service as rag_service
import app.services.rag.web_context as web_context


URL = "https://nginx.org/en/docs/http/ngx_http_proxy_module.html"
HIT = {"title": "Nginx proxy module", "url": URL, "snippet": "proxy_read_timeout defaults to 60s."}


@pytest.fixture
def deployed_config(monkeypatch):
    monkeypatch.delenv("RAG_CHAT_WEB_SEARCH_ENABLED", raising=False)
    config = Settings(_env_file=Path(__file__).resolve().parents[1] / ".env.example")
    monkeypatch.setattr(web_context, "settings", config)
    monkeypatch.setattr(rag_service, "settings", config)

    async def no_reports(**_kwargs):
        return []

    monkeypatch.setattr(web_context.chat_memory, "get_recent_diagnosis_reports", no_reports)
    return config


@pytest.mark.asyncio
@pytest.mark.parametrize("mcp_enabled", [False, True])
@pytest.mark.parametrize("web_enabled", [False, True])
async def test_shipped_config_searches_independently_of_mcp(monkeypatch, deployed_config, mcp_enabled, web_enabled):
    searches = []
    prompts = []

    def search(query, limit, provider):
        searches.append((query, limit, provider))
        return [HIT]

    async def session(_session_id):
        return {"summary": "", "recent_messages": []}

    async def no_op(*_args, **_kwargs):
        return None

    async def unchanged(question, **_kwargs):
        return question

    async def context(_question, _top_k):
        return "Local SOP", 1, ["sop.md"], [{"source": "sop.md"}]

    class Llm:
        async def astream(self, messages):
            prompts.append(messages[-1].content)
            yield AIMessageChunk(content="Public documentation answer")

    async def runner(**kwargs):
        prompts.append(kwargs["inputs"]["messages"][-1][1])
        return {"messages": [AIMessage(content="Public documentation answer")]}

    monkeypatch.setattr(web_context, "search", search)
    monkeypatch.setattr(rag_service.chat_memory, "load_session", session)
    monkeypatch.setattr(rag_service.chat_memory, "append_message", no_op)
    monkeypatch.setattr(rag_service, "compact_if_needed", no_op)
    monkeypatch.setattr(rag_service, "rewrite_question", unchanged)
    monkeypatch.setattr(rag_service, "build_context", context)
    monkeypatch.setattr(rag_service, "get_chat_llm", lambda **_kwargs: Llm())
    monkeypatch.setattr(rag_service, "_select_rag_tools", lambda: [SimpleNamespace(name="get_local_cpu_memory")])
    monkeypatch.setattr(rag_service, "run_parallel_agent", runner)

    events = [event async for event in rag_service.stream_chat(
        "Nginx proxy_read_timeout documentation", session_id="pytest-web-switches",
        web_search=web_enabled, mcp_tools=mcp_enabled,
    )]

    assert len(searches) == int(web_enabled)
    assert prompts and (URL in prompts[0]) == web_enabled
    llm_start = next(event for event in events if event.get("stage") == "llm_start")
    assert llm_start["data"]["tools_enabled"] == mcp_enabled
    web_events = [event for event in events if event.get("stage") == "web_done"]
    if web_enabled:
        assert web_events[0]["data"]["results"][0]["url"] == URL
        assert not web_events[0]["data"].get("skip_reason")
    else:
        assert not web_events
    assert not any(event.get("type") == "error" for event in events)


@pytest.mark.asyncio
async def test_explicit_server_disable_still_blocks_search(monkeypatch, deployed_config):
    deployed_config.rag_chat_web_search_enabled = False
    monkeypatch.setattr(web_context, "search", lambda *_args: pytest.fail("Server-disabled search was called"))
    _, _, hits, reason = await web_context.build_web_context(
        "Nginx documentation", summary="", recent_messages=[], enabled=True,
    )
    assert not hits
    assert "RAG_CHAT_WEB_SEARCH_ENABLED=false" in reason


@pytest.mark.asyncio
async def test_sensitive_query_remains_blocked_when_search_is_enabled(monkeypatch, deployed_config):
    deployed_config.rag_chat_web_search_enabled = True
    monkeypatch.setattr(web_context, "search", lambda *_args: pytest.fail("Blocked query was searched"))
    _, _, hits, reason = await web_context.build_web_context(
        "Nginx api_key test-value", summary="", recent_messages=[], enabled=True,
    )
    assert not hits
    assert "禁止联网关键词" in reason

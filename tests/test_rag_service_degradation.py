from __future__ import annotations

import pytest

import app.services.rag_service as rag_service


async def _empty_session(_session_id: str) -> dict:
    return {"summary": "", "recent_messages": []}


async def _context_with_hit(_question: str, _top_k: int):
    return "known context", 1, ["sop.md"], [{"source": "sop.md", "score": 0.9}]


async def _no_web_context(*_args, **_kwargs):
    return "", [], [], "disabled"


class _Tool:
    name = "get_local_cpu_memory"


class _Llm:
    async def astream(self, _messages):
        if False:
            yield None
        raise RuntimeError("provider unavailable")


@pytest.mark.asyncio
async def test_rag_chat_returns_degraded_token_when_tool_runner_fails(monkeypatch):
    async def failing_runner(**_kwargs):
        raise RuntimeError("provider arrearage")

    async def append_message(*_args, **_kwargs):
        return None

    async def compact(_session_id: str):
        return None

    monkeypatch.setattr(rag_service.chat_memory, "load_session", _empty_session)
    monkeypatch.setattr(rag_service.chat_memory, "append_message", append_message)
    monkeypatch.setattr(rag_service, "compact_if_needed", compact)
    monkeypatch.setattr(rag_service, "build_context", _context_with_hit)
    monkeypatch.setattr(rag_service, "build_web_context", _no_web_context)
    monkeypatch.setattr(rag_service, "_select_rag_tools", lambda: [_Tool()])
    monkeypatch.setattr(rag_service, "run_parallel_agent", failing_runner)
    monkeypatch.setattr(rag_service, "get_chat_llm", lambda **_kwargs: _Llm())

    events = [
        event
        async for event in rag_service.stream_chat(
            "why is my host slow?",
            session_id="pytest-rag",
            top_k=3,
            web_search=False,
            mcp_tools=True,
        )
    ]

    token_events = [event for event in events if event.get("type") == "token"]
    assert token_events, events
    assert "模型调用失败" in token_events[-1]["content"]
    assert any(event.get("stage") == "llm_degraded" for event in events)
    assert events[-1].get("stage") == "stats"


@pytest.mark.asyncio
async def test_rag_chat_returns_degraded_token_when_plain_llm_stream_fails(monkeypatch):
    async def append_message(*_args, **_kwargs):
        return None

    async def compact(_session_id: str):
        return None

    monkeypatch.setattr(rag_service.chat_memory, "load_session", _empty_session)
    monkeypatch.setattr(rag_service.chat_memory, "append_message", append_message)
    monkeypatch.setattr(rag_service, "compact_if_needed", compact)
    monkeypatch.setattr(rag_service, "build_context", _context_with_hit)
    monkeypatch.setattr(rag_service, "build_web_context", _no_web_context)
    monkeypatch.setattr(rag_service, "get_chat_llm", lambda **_kwargs: _Llm())

    events = [
        event
        async for event in rag_service.stream_chat(
            "why is my host slow?",
            session_id="pytest-rag",
            top_k=3,
            web_search=False,
            mcp_tools=False,
        )
    ]

    token_events = [event for event in events if event.get("type") == "token"]
    assert token_events, events
    assert "模型调用失败" in token_events[-1]["content"]
    assert any(event.get("stage") == "llm_degraded" for event in events)
    assert events[-1].get("stage") == "stats"

"""AIOps streaming diagnosis API."""

import asyncio
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from time import perf_counter
from typing import AsyncIterator, Callable

from fastapi import APIRouter
from loguru import logger
from sse_starlette.sse import EventSourceResponse

from app.agentops.schemas import DiagnosisRunCreate
from app.config import settings
from app.schemas.aiops import DiagnosisRequest
import app.services.aiops_service as aiops_service

router = APIRouter(prefix="/aiops", tags=["aiops"])


@dataclass
class _DiagnosisRunAggregation:
    input_text: str
    session_id: str
    started_at: datetime
    started_perf: float
    selected_skill: str | None = None
    event_count: int = 0
    tool_call_count: int = 0
    report_markdown: str | None = None
    error_message: str | None = None
    complete_seen: bool = False


def _run_title(input_text: str) -> str:
    preview = " ".join(input_text.split())
    return preview[:60] or "Untitled diagnosis"


def _event_data(event: dict) -> dict:
    data = event.get("data")
    return data if isinstance(data, dict) else {}


def _observe_diagnosis_event(state: _DiagnosisRunAggregation, event: dict) -> None:
    state.event_count += 1
    event_type = str(event.get("type") or "")
    stage = str(event.get("stage") or "")
    data = _event_data(event)

    if event_type == "skill_selected":
        skill = data.get("skill") or event.get("skill")
        if skill:
            state.selected_skill = str(skill)

    if event_type == "tool_call" or stage == "tool_call":
        state.tool_call_count += 1

    if event_type == "report":
        report = data.get("report") or event.get("report")
        if report:
            state.report_markdown = str(report)

    if event_type == "error":
        message = str(event.get("message") or "").strip()
        error_type = str(data.get("error_type") or "").strip()
        state.error_message = message or error_type or "diagnosis error"

    if event_type == "complete":
        state.complete_seen = True


def _diagnosis_run_payload(state: _DiagnosisRunAggregation) -> DiagnosisRunCreate:
    finished_at = datetime.now(timezone.utc)
    duration_ms = int((perf_counter() - state.started_perf) * 1000)
    status = (
        "succeeded"
        if not state.error_message and (state.report_markdown or state.complete_seen)
        else "failed"
    )
    return DiagnosisRunCreate(
        session_id=state.session_id,
        title=_run_title(state.input_text),
        input_text=state.input_text,
        selected_skill=state.selected_skill,
        status=status,
        started_at=state.started_at,
        finished_at=finished_at,
        duration_ms=duration_ms,
        event_count=state.event_count,
        tool_call_count=state.tool_call_count,
        report_markdown=state.report_markdown,
        error_message=state.error_message,
    )


def _persist_agentops_run_best_effort(payload: DiagnosisRunCreate) -> None:
    if not settings.agentops_enabled:
        return
    try:
        from app.agentops.service import agentops_service

        agentops_service.create_diagnosis_run(payload)
    except Exception as exc:
        logger.warning(
            "[agentops] failed to persist diagnosis run summary: "
            f"{type(exc).__name__}: {exc}"
        )


async def _persisting_sse_event_generator(
    source: AsyncIterator[dict],
    *,
    input_text: str,
    session_id: str,
    persist_func: Callable[[DiagnosisRunCreate], None] | None = None,
) -> AsyncIterator[dict]:
    state = _DiagnosisRunAggregation(
        input_text=input_text,
        session_id=session_id,
        started_at=datetime.now(timezone.utc),
        started_perf=perf_counter(),
    )
    cancelled = False

    try:
        async for sse_event in source:
            _observe_diagnosis_event(state, sse_event)
            yield {
                "event": "message",
                "data": json.dumps(sse_event, ensure_ascii=False),
            }
    except asyncio.CancelledError:
        cancelled = True
        raise
    except Exception as e:
        logger.exception(f"[aiops] stream exception: {e}")
        error_event = {
            "type": "error",
            "stage": "stream_failure",
            "message": str(e),
            "data": {"error_type": type(e).__name__},
        }
        _observe_diagnosis_event(state, error_event)
        yield {
            "event": "message",
            "data": json.dumps(error_event, ensure_ascii=False),
        }
    finally:
        if not cancelled:
            payload = _diagnosis_run_payload(state)
            try:
                if persist_func is None:
                    _persist_agentops_run_best_effort(payload)
                else:
                    persist_func(payload)
            except Exception as exc:
                logger.warning(
                    "[agentops] diagnosis run persistence hook failed: "
                    f"{type(exc).__name__}: {exc}"
                )


@router.post(
    "/diagnose",
    summary="AIOps streaming diagnosis",
    description=(
        "Streams the existing AIOps diagnosis events as SSE message frames. "
        "AgentOps persistence is best-effort and does not change outgoing event payloads."
    ),
)
async def aiops_diagnose(req: DiagnosisRequest) -> EventSourceResponse:
    logger.info(f"[aiops] session={req.session_id}, q={req.query[:60]}...")

    async def raw_events() -> AsyncIterator[dict]:
        async for sse_event in aiops_service.stream_diagnose(
            req.query,
            session_id=req.session_id,
        ):
            yield sse_event

    return EventSourceResponse(
        _persisting_sse_event_generator(
            raw_events(),
            input_text=req.query,
            session_id=req.session_id,
        )
    )

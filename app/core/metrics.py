"""Prometheus metrics helpers.

Keep metric labels coarse. Never place user input, report text, API keys, or
raw URLs in labels.
"""

from __future__ import annotations

import re
from time import perf_counter
from typing import Callable

from fastapi import FastAPI, Request, Response
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, Histogram, generate_latest
from starlette.middleware.base import BaseHTTPMiddleware


_HEXISH_RE = re.compile(r"^[a-f0-9]{12,}$", re.IGNORECASE)
_INT_RE = re.compile(r"^\d+$")


HTTP_REQUESTS = Counter(
    "http_requests",
    "Total HTTP requests.",
    ("method", "path", "status"),
)
HTTP_REQUEST_DURATION = Histogram(
    "http_request_duration_seconds",
    "HTTP request duration in seconds.",
    ("method", "path"),
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0),
)

AIOPS_RUNS = Counter("aiops_runs", "AIOps runs by terminal status.", ("status",))
AIOPS_RUN_DURATION = Histogram(
    "aiops_run_duration_seconds",
    "AIOps run duration in seconds.",
    buckets=(0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0, 120.0),
)
AIOPS_SSE_EVENTS = Counter("aiops_sse_events", "AIOps SSE events by event type.", ("event",))
AIOPS_TOOL_CALLS = Counter("aiops_tool_calls", "AIOps tool calls observed in SSE streams.")
AIOPS_ERRORS = Counter("aiops_errors", "AIOps errors by coarse type.", ("type",))

AGENTOPS_RUNS = Counter("agentops_runs", "AgentOps persisted runs by status.", ("status",))
AGENTOPS_CRUD_REQUESTS = Counter(
    "agentops_crud_requests",
    "AgentOps CRUD API requests.",
    ("resource", "operation", "status"),
)

EVAL_RUNS = Counter("eval_runs", "EvalOps runs by mode and status.", ("mode", "status"))
EVAL_SCORE_LATEST = Gauge("eval_score_latest", "Latest EvalOps aggregate score.")
EVAL_CASES_TOTAL = Gauge("eval_cases_total", "Eval cases considered by latest run.")

CACHE_HITS = Counter("cache_hits", "Cache hits by backend and namespace.", ("backend", "namespace"))
CACHE_MISSES = Counter("cache_misses", "Cache misses by backend and namespace.", ("backend", "namespace"))


def prometheus_response() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


class PrometheusHTTPMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        start = perf_counter()
        response: Response | None = None
        try:
            response = await call_next(request)
            return response
        finally:
            elapsed = perf_counter() - start
            path = route_template(request)
            status_code = str(response.status_code if response is not None else 500)
            method = request.method.upper()
            HTTP_REQUESTS.labels(method=method, path=path, status=status_code).inc()
            HTTP_REQUEST_DURATION.labels(method=method, path=path).observe(elapsed)


def setup_metrics(app: FastAPI) -> None:
    initialize_metric_series()
    app.add_middleware(PrometheusHTTPMiddleware)


def initialize_metric_series() -> None:
    HTTP_REQUESTS.labels(method="GET", path="/metrics", status="200").inc(0)
    HTTP_REQUEST_DURATION.labels(method="GET", path="/metrics")


def route_template(request: Request) -> str:
    route = request.scope.get("route")
    route_path = getattr(route, "path", None)
    if route_path:
        return str(route_path)
    return "/unmatched"


def sanitize_path(path: str) -> str:
    if not path:
        return "/"
    parts = []
    for part in path.split("/"):
        if not part:
            continue
        if _INT_RE.fullmatch(part) or _HEXISH_RE.fullmatch(part):
            parts.append("{id}")
        else:
            parts.append(part[:80])
    return "/" + "/".join(parts)


def record_aiops_sse_event(event_type: str | None) -> None:
    AIOPS_SSE_EVENTS.labels(event=_safe_label(event_type or "unknown")).inc()


def record_aiops_tool_call() -> None:
    AIOPS_TOOL_CALLS.inc()


def record_aiops_run(status: str, duration_ms: int | None = None) -> None:
    normalized = _safe_status(status)
    AIOPS_RUNS.labels(status=normalized).inc()
    AGENTOPS_RUNS.labels(status=normalized).inc()
    if duration_ms is not None and duration_ms >= 0:
        AIOPS_RUN_DURATION.observe(duration_ms / 1000)


def record_aiops_error(error_type: str) -> None:
    AIOPS_ERRORS.labels(type=_safe_label(error_type)).inc()


def record_agentops_crud(resource: str, operation: str, status: str) -> None:
    AGENTOPS_CRUD_REQUESTS.labels(
        resource=_safe_label(resource),
        operation=_safe_label(operation),
        status=_safe_status(status),
    ).inc()


def record_eval_run(mode: str, status: str, score: float | None = None, cases: int | None = None) -> None:
    EVAL_RUNS.labels(mode=_safe_label(mode), status=_safe_status(status)).inc()
    if score is not None:
        EVAL_SCORE_LATEST.set(score)
    if cases is not None:
        EVAL_CASES_TOTAL.set(cases)


def record_cache_hit(backend: str, namespace: str) -> None:
    CACHE_HITS.labels(backend=_safe_label(backend), namespace=_safe_label(namespace)).inc()


def record_cache_miss(backend: str, namespace: str) -> None:
    CACHE_MISSES.labels(backend=_safe_label(backend), namespace=_safe_label(namespace)).inc()


def _safe_status(value: str | None) -> str:
    text = _safe_label(value or "unknown")
    if text in {"succeeded", "success", "ok"}:
        return "success"
    if text in {"failed", "failure", "error"}:
        return "error"
    if text in {"not_found", "disabled"}:
        return text
    return text or "unknown"


def _safe_label(value: str | None) -> str:
    text = str(value or "unknown").strip().lower()
    text = re.sub(r"[^a-z0-9_:-]+", "_", text)
    return text[:64] or "unknown"

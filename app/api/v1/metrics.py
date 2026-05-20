"""Prometheus metrics endpoint."""

from fastapi import APIRouter, Response

from app.core.metrics import prometheus_response

router = APIRouter(tags=["metrics"])


@router.get("/metrics", include_in_schema=False)
async def metrics() -> Response:
    return prometheus_response()

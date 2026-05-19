"""AgentOps CRUD API."""

from collections.abc import Callable

from fastapi import APIRouter, Depends, HTTPException, Query, status
from loguru import logger
from sqlalchemy.exc import SQLAlchemyError

from app.agentops.schemas import (
    AgentOpsSummary,
    DeleteResult,
    DemoScenarioCreate,
    DemoScenarioList,
    DemoScenarioRead,
    DemoScenarioUpdate,
    DiagnosisRunList,
    DiagnosisRunRead,
    EvalCaseCreate,
    EvalCaseList,
    EvalCaseRead,
    EvalCaseUpdate,
    EvalResultList,
)
from app.agentops.service import AgentOpsService, agentops_service
from app.config import settings
from app.core import metrics
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/agentops", tags=["AgentOps"])


def get_agentops_service() -> AgentOpsService:
    return agentops_service


def require_agentops_enabled() -> None:
    if not settings.agentops_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AgentOps database is disabled by configuration.",
        )


def _run_db(call: Callable[[], object]) -> object:
    try:
        return call()
    except HTTPException:
        raise
    except SQLAlchemyError:
        logger.exception("AgentOps database operation failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="AgentOps database operation failed.",
        ) from None


def _not_found(entity: str, entity_id: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"{entity} not found: {entity_id}",
    )


@router.get(
    "/runs",
    response_model=ApiResponse[DiagnosisRunList],
    dependencies=[Depends(require_agentops_enabled)],
    summary="List diagnosis runs",
)
async def list_runs(
    limit: int = Query(default=20, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    service: AgentOpsService = Depends(get_agentops_service),
) -> ApiResponse[DiagnosisRunList]:
    data = _run_db(lambda: service.list_diagnosis_runs(limit=limit, offset=offset))
    metrics.record_agentops_crud("runs", "list", "success")
    return ApiResponse.success(data=data)


@router.get(
    "/runs/{run_id}",
    response_model=ApiResponse[DiagnosisRunRead],
    dependencies=[Depends(require_agentops_enabled)],
    summary="Get one diagnosis run",
)
async def get_run(
    run_id: str,
    service: AgentOpsService = Depends(get_agentops_service),
) -> ApiResponse[DiagnosisRunRead]:
    run = _run_db(lambda: service.get_diagnosis_run(run_id))
    if run is None:
        metrics.record_agentops_crud("runs", "get", "not_found")
        raise _not_found("diagnosis run", run_id)
    metrics.record_agentops_crud("runs", "get", "success")
    return ApiResponse.success(data=run)


@router.delete(
    "/runs/{run_id}",
    response_model=ApiResponse[DeleteResult],
    dependencies=[Depends(require_agentops_enabled)],
    summary="Delete one diagnosis run",
)
async def delete_run(
    run_id: str,
    service: AgentOpsService = Depends(get_agentops_service),
) -> ApiResponse[DeleteResult]:
    deleted = _run_db(lambda: service.delete_diagnosis_run(run_id))
    if not deleted:
        metrics.record_agentops_crud("runs", "delete", "not_found")
        raise _not_found("diagnosis run", run_id)
    metrics.record_agentops_crud("runs", "delete", "success")
    return ApiResponse.success(data=DeleteResult(id=run_id, deleted=True))


@router.get(
    "/scenarios",
    response_model=ApiResponse[DemoScenarioList],
    dependencies=[Depends(require_agentops_enabled)],
    summary="List demo scenarios",
)
async def list_scenarios(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    service: AgentOpsService = Depends(get_agentops_service),
) -> ApiResponse[DemoScenarioList]:
    data = _run_db(lambda: service.list_demo_scenarios(limit=limit, offset=offset))
    metrics.record_agentops_crud("scenarios", "list", "success")
    return ApiResponse.success(data=data)


@router.post(
    "/scenarios",
    response_model=ApiResponse[DemoScenarioRead],
    dependencies=[Depends(require_agentops_enabled)],
    summary="Create a demo scenario",
)
async def create_scenario(
    payload: DemoScenarioCreate,
    service: AgentOpsService = Depends(get_agentops_service),
) -> ApiResponse[DemoScenarioRead]:
    data = _run_db(lambda: service.create_demo_scenario(payload))
    metrics.record_agentops_crud("scenarios", "create", "success")
    return ApiResponse.success(data=data)


@router.put(
    "/scenarios/{scenario_id}",
    response_model=ApiResponse[DemoScenarioRead],
    dependencies=[Depends(require_agentops_enabled)],
    summary="Update a demo scenario",
)
async def update_scenario(
    scenario_id: str,
    payload: DemoScenarioUpdate,
    service: AgentOpsService = Depends(get_agentops_service),
) -> ApiResponse[DemoScenarioRead]:
    data = _run_db(lambda: service.update_demo_scenario(scenario_id, payload))
    if data is None:
        metrics.record_agentops_crud("scenarios", "update", "not_found")
        raise _not_found("demo scenario", scenario_id)
    metrics.record_agentops_crud("scenarios", "update", "success")
    return ApiResponse.success(data=data)


@router.delete(
    "/scenarios/{scenario_id}",
    response_model=ApiResponse[DeleteResult],
    dependencies=[Depends(require_agentops_enabled)],
    summary="Delete a demo scenario",
)
async def delete_scenario(
    scenario_id: str,
    service: AgentOpsService = Depends(get_agentops_service),
) -> ApiResponse[DeleteResult]:
    deleted = _run_db(lambda: service.delete_demo_scenario(scenario_id))
    if not deleted:
        metrics.record_agentops_crud("scenarios", "delete", "not_found")
        raise _not_found("demo scenario", scenario_id)
    metrics.record_agentops_crud("scenarios", "delete", "success")
    return ApiResponse.success(data=DeleteResult(id=scenario_id, deleted=True))


@router.get(
    "/eval-cases",
    response_model=ApiResponse[EvalCaseList],
    dependencies=[Depends(require_agentops_enabled)],
    summary="List eval cases",
)
async def list_eval_cases(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    enabled_only: bool = False,
    service: AgentOpsService = Depends(get_agentops_service),
) -> ApiResponse[EvalCaseList]:
    data = _run_db(
        lambda: service.list_eval_cases(
            limit=limit,
            offset=offset,
            enabled_only=enabled_only,
        )
    )
    metrics.record_agentops_crud("eval_cases", "list", "success")
    return ApiResponse.success(data=data)


@router.post(
    "/eval-cases",
    response_model=ApiResponse[EvalCaseRead],
    dependencies=[Depends(require_agentops_enabled)],
    summary="Create an eval case",
)
async def create_eval_case(
    payload: EvalCaseCreate,
    service: AgentOpsService = Depends(get_agentops_service),
) -> ApiResponse[EvalCaseRead]:
    data = _run_db(lambda: service.create_eval_case(payload))
    metrics.record_agentops_crud("eval_cases", "create", "success")
    return ApiResponse.success(data=data)


@router.put(
    "/eval-cases/{case_id}",
    response_model=ApiResponse[EvalCaseRead],
    dependencies=[Depends(require_agentops_enabled)],
    summary="Update an eval case",
)
async def update_eval_case(
    case_id: str,
    payload: EvalCaseUpdate,
    service: AgentOpsService = Depends(get_agentops_service),
) -> ApiResponse[EvalCaseRead]:
    data = _run_db(lambda: service.update_eval_case(case_id, payload))
    if data is None:
        metrics.record_agentops_crud("eval_cases", "update", "not_found")
        raise _not_found("eval case", case_id)
    metrics.record_agentops_crud("eval_cases", "update", "success")
    return ApiResponse.success(data=data)


@router.delete(
    "/eval-cases/{case_id}",
    response_model=ApiResponse[DeleteResult],
    dependencies=[Depends(require_agentops_enabled)],
    summary="Delete an eval case",
)
async def delete_eval_case(
    case_id: str,
    service: AgentOpsService = Depends(get_agentops_service),
) -> ApiResponse[DeleteResult]:
    deleted = _run_db(lambda: service.delete_eval_case(case_id))
    if not deleted:
        metrics.record_agentops_crud("eval_cases", "delete", "not_found")
        raise _not_found("eval case", case_id)
    metrics.record_agentops_crud("eval_cases", "delete", "success")
    return ApiResponse.success(data=DeleteResult(id=case_id, deleted=True))


@router.get(
    "/eval-results",
    response_model=ApiResponse[EvalResultList],
    dependencies=[Depends(require_agentops_enabled)],
    summary="List eval results",
)
async def list_eval_results(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    service: AgentOpsService = Depends(get_agentops_service),
) -> ApiResponse[EvalResultList]:
    data = _run_db(lambda: service.list_eval_results(limit=limit, offset=offset))
    metrics.record_agentops_crud("eval_results", "list", "success")
    return ApiResponse.success(data=data)


@router.get(
    "/summary",
    response_model=ApiResponse[AgentOpsSummary],
    dependencies=[Depends(require_agentops_enabled)],
    summary="AgentOps summary",
)
async def get_summary(
    service: AgentOpsService = Depends(get_agentops_service),
) -> ApiResponse[AgentOpsSummary]:
    data = _run_db(service.get_agentops_summary)
    metrics.record_agentops_crud("summary", "get", "success")
    return ApiResponse.success(data=data)

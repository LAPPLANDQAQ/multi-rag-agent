from __future__ import annotations

from pathlib import Path

import pytest

from app.agentops.db import Base, create_engine, create_session_factory
from app.agentops.repository import AgentOpsRepository
from app.agentops.schemas import (
    DemoScenarioCreate,
    DiagnosisRunCreate,
    EvalCaseCreate,
    EvalResultCreate,
)
from app.agentops.service import AgentOpsService


@pytest.fixture()
def agentops_db_path(tmp_path: Path) -> Path:
    return tmp_path / "agentops-test.db"


@pytest.fixture()
def agentops_engine(agentops_db_path: Path):
    engine = create_engine(f"sqlite:///{agentops_db_path}")
    Base.metadata.create_all(bind=engine)
    try:
        yield engine
    finally:
        engine.dispose()


@pytest.fixture()
def agentops_session_factory(agentops_engine):
    return create_session_factory(agentops_engine)


@pytest.fixture()
def agentops_session(agentops_session_factory):
    with agentops_session_factory() as session:
        yield session


@pytest.fixture()
def agentops_repo(agentops_session) -> AgentOpsRepository:
    return AgentOpsRepository(agentops_session)


@pytest.fixture()
def agentops_service(agentops_session_factory) -> AgentOpsService:
    return AgentOpsService(agentops_session_factory)


@pytest.fixture()
def sample_diagnosis_run() -> DiagnosisRunCreate:
    return DiagnosisRunCreate(
        session_id="pytest-session",
        input_text="Host CPU remains above 95%",
        selected_skill="host_resource_diagnosis",
        status="succeeded",
        duration_ms=1200,
        event_count=5,
        tool_call_count=2,
        report_markdown="# Diagnosis\nCPU pressure detected",
    )


@pytest.fixture()
def sample_demo_scenario() -> DemoScenarioCreate:
    return DemoScenarioCreate(
        id="host-cpu",
        title="Host CPU",
        input_text="Host CPU remains above 95%",
        expected_skill="host_resource_diagnosis",
        tags=["host", "cpu"],
    )


@pytest.fixture()
def sample_eval_case() -> EvalCaseCreate:
    return EvalCaseCreate(
        id="host-cpu",
        name="Host CPU routes to host resource skill",
        input_text="Host CPU remains above 95%",
        expected_skill="host_resource_diagnosis",
        expected_tools=["get_local_cpu_memory"],
        tags=["host", "cpu"],
    )


@pytest.fixture()
def sample_eval_result() -> EvalResultCreate:
    return EvalResultCreate(
        case_id="host-cpu",
        mode="offline",
        skill_match=True,
        has_report=True,
        has_error=False,
        event_count=5,
        tool_call_count=2,
        duration_ms=1200,
        score=1.0,
        detail_json='{"fixture":"host-cpu.json"}',
    )


@pytest.fixture()
def sample_real_sse_fixture() -> dict:
    return {
        "metadata": {
            "schema_version": 1,
            "source": "real_sse",
            "scenario_id": "host-cpu",
            "input": "Host CPU remains above 95%",
            "event_count": 5,
            "duration_ms": 1200,
        },
        "events": [
            {"event": "message", "data": {"type": "start"}, "offset_ms": 0},
            {
                "event": "message",
                "data": {
                    "type": "skill_selected",
                    "data": {"skill": "host_resource_diagnosis"},
                },
                "offset_ms": 100,
            },
            {
                "event": "message",
                "data": {
                    "type": "tool_call",
                    "data": {"name": "get_local_cpu_memory", "status": "ok"},
                },
                "offset_ms": 400,
            },
            {
                "event": "message",
                "data": {
                    "type": "report",
                    "data": {"report": "# Diagnosis\nCPU pressure detected"},
                },
                "offset_ms": 1000,
            },
            {"event": "message", "data": {"type": "complete"}, "offset_ms": 1200},
        ],
    }

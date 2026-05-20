"""Service facade for AgentOps persistence."""

from collections.abc import Callable

from sqlalchemy.orm import Session

from app.agentops.db import SessionLocal
from app.agentops.repository import AgentOpsRepository
from app.agentops.schemas import (
    DemoScenarioCreate,
    DemoScenarioUpdate,
    DiagnosisRunCreate,
    DiagnosisRunUpdate,
    EvalCaseCreate,
    EvalCaseUpdate,
    EvalResultCreate,
)


class AgentOpsService:
    """Open a short-lived session for each AgentOps operation."""

    def __init__(self, session_factory: Callable[[], Session] = SessionLocal):
        self.session_factory = session_factory

    def create_diagnosis_run(self, payload: DiagnosisRunCreate):
        with self.session_factory() as session:
            return AgentOpsRepository(session).create_diagnosis_run(payload)

    def list_diagnosis_runs(self, limit: int = 50, offset: int = 0):
        with self.session_factory() as session:
            return AgentOpsRepository(session).list_diagnosis_runs(limit=limit, offset=offset)

    def get_diagnosis_run(self, run_id: str):
        with self.session_factory() as session:
            return AgentOpsRepository(session).get_diagnosis_run(run_id)

    def update_diagnosis_run(self, run_id: str, payload: DiagnosisRunUpdate):
        with self.session_factory() as session:
            return AgentOpsRepository(session).update_diagnosis_run(run_id, payload)

    def delete_diagnosis_run(self, run_id: str) -> bool:
        with self.session_factory() as session:
            return AgentOpsRepository(session).delete_diagnosis_run(run_id)

    def create_demo_scenario(self, payload: DemoScenarioCreate):
        with self.session_factory() as session:
            return AgentOpsRepository(session).create_demo_scenario(payload)

    def list_demo_scenarios(self, limit: int = 50, offset: int = 0):
        with self.session_factory() as session:
            return AgentOpsRepository(session).list_demo_scenarios(limit=limit, offset=offset)

    def get_demo_scenario(self, scenario_id: str):
        with self.session_factory() as session:
            return AgentOpsRepository(session).get_demo_scenario(scenario_id)

    def update_demo_scenario(self, scenario_id: str, payload: DemoScenarioUpdate):
        with self.session_factory() as session:
            return AgentOpsRepository(session).update_demo_scenario(scenario_id, payload)

    def delete_demo_scenario(self, scenario_id: str) -> bool:
        with self.session_factory() as session:
            return AgentOpsRepository(session).delete_demo_scenario(scenario_id)

    def create_eval_case(self, payload: EvalCaseCreate):
        with self.session_factory() as session:
            return AgentOpsRepository(session).create_eval_case(payload)

    def list_eval_cases(self, limit: int = 50, offset: int = 0, enabled_only: bool = False):
        with self.session_factory() as session:
            return AgentOpsRepository(session).list_eval_cases(
                limit=limit,
                offset=offset,
                enabled_only=enabled_only,
            )

    def get_eval_case(self, case_id: str):
        with self.session_factory() as session:
            return AgentOpsRepository(session).get_eval_case(case_id)

    def update_eval_case(self, case_id: str, payload: EvalCaseUpdate):
        with self.session_factory() as session:
            return AgentOpsRepository(session).update_eval_case(case_id, payload)

    def delete_eval_case(self, case_id: str) -> bool:
        with self.session_factory() as session:
            return AgentOpsRepository(session).delete_eval_case(case_id)

    def create_eval_result(self, payload: EvalResultCreate):
        with self.session_factory() as session:
            return AgentOpsRepository(session).create_eval_result(payload)

    def list_eval_results(self, limit: int = 50, offset: int = 0):
        with self.session_factory() as session:
            return AgentOpsRepository(session).list_eval_results(limit=limit, offset=offset)

    def get_eval_result(self, result_id: str):
        with self.session_factory() as session:
            return AgentOpsRepository(session).get_eval_result(result_id)

    def get_eval_result_summary(self):
        with self.session_factory() as session:
            return AgentOpsRepository(session).get_eval_result_summary()

    def get_agentops_summary(self):
        with self.session_factory() as session:
            return AgentOpsRepository(session).get_agentops_summary()


agentops_service = AgentOpsService()

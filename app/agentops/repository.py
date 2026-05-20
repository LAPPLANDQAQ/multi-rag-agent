"""Repository functions for AgentOps persistence."""

from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.agentops import models
from app.agentops.schemas import (
    DemoScenarioCreate,
    DemoScenarioList,
    DemoScenarioRead,
    DemoScenarioUpdate,
    DiagnosisRunCreate,
    DiagnosisRunList,
    DiagnosisRunRead,
    DiagnosisRunUpdate,
    AgentOpsSummary,
    DeleteResult,
    EvalCaseCreate,
    EvalCaseList,
    EvalCaseRead,
    EvalCaseUpdate,
    EvalResultCreate,
    EvalResultList,
    EvalResultRead,
    EvalResultSummary,
)


def _join_values(value: list[str] | str | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    return ",".join(item.strip() for item in value if item.strip())


def _title_from_input(input_text: str, explicit_title: str | None = None) -> str:
    title = (explicit_title or "").strip()
    if title:
        return title[:200]

    preview = " ".join(input_text.split())
    return preview[:80] or "Untitled diagnosis"


class AgentOpsRepository:
    """Short-lived repository bound to one SQLAlchemy session."""

    def __init__(self, session: Session):
        self.session = session

    def create_diagnosis_run(self, payload: DiagnosisRunCreate) -> DiagnosisRunRead:
        values = payload.model_dump()
        values["title"] = _title_from_input(payload.input_text, payload.title)
        run = models.DiagnosisRun(**{k: v for k, v in values.items() if v is not None})
        self.session.add(run)
        self.session.commit()
        self.session.refresh(run)
        return DiagnosisRunRead.model_validate(run)

    def list_diagnosis_runs(self, limit: int = 50, offset: int = 0) -> DiagnosisRunList:
        total = self.session.scalar(select(func.count()).select_from(models.DiagnosisRun)) or 0
        rows = self.session.scalars(
            select(models.DiagnosisRun)
            .order_by(models.DiagnosisRun.created_at.desc())
            .limit(limit)
            .offset(offset)
        ).all()
        return DiagnosisRunList(
            items=[DiagnosisRunRead.model_validate(row) for row in rows],
            total=total,
            limit=limit,
            offset=offset,
        )

    def get_diagnosis_run(self, run_id: str) -> DiagnosisRunRead | None:
        row = self.session.get(models.DiagnosisRun, run_id)
        return DiagnosisRunRead.model_validate(row) if row else None

    def update_diagnosis_run(
        self,
        run_id: str,
        payload: DiagnosisRunUpdate,
    ) -> DiagnosisRunRead | None:
        row = self.session.get(models.DiagnosisRun, run_id)
        if row is None:
            return None
        values = payload.model_dump(exclude_unset=True)
        if "title" in values:
            values["title"] = _title_from_input(row.input_text, values["title"])
        self._apply_values(row, values)
        return DiagnosisRunRead.model_validate(row)

    def delete_diagnosis_run(self, run_id: str) -> bool:
        return self._delete(models.DiagnosisRun, run_id)

    def create_demo_scenario(self, payload: DemoScenarioCreate) -> DemoScenarioRead:
        values = payload.model_dump()
        values["tags"] = _join_values(payload.tags)
        row = models.DemoScenario(**values)
        self.session.add(row)
        self.session.commit()
        self.session.refresh(row)
        return DemoScenarioRead.model_validate(row)

    def list_demo_scenarios(self, limit: int = 50, offset: int = 0) -> DemoScenarioList:
        return self._list(
            models.DemoScenario,
            DemoScenarioRead,
            DemoScenarioList,
            limit,
            offset,
            models.DemoScenario.created_at.desc(),
        )

    def get_demo_scenario(self, scenario_id: str) -> DemoScenarioRead | None:
        row = self.session.get(models.DemoScenario, scenario_id)
        return DemoScenarioRead.model_validate(row) if row else None

    def update_demo_scenario(
        self,
        scenario_id: str,
        payload: DemoScenarioUpdate,
    ) -> DemoScenarioRead | None:
        row = self.session.get(models.DemoScenario, scenario_id)
        if row is None:
            return None
        values = payload.model_dump(exclude_unset=True)
        if "tags" in values:
            values["tags"] = _join_values(values["tags"])
        self._apply_values(row, values)
        return DemoScenarioRead.model_validate(row)

    def delete_demo_scenario(self, scenario_id: str) -> bool:
        return self._delete(models.DemoScenario, scenario_id)

    def create_eval_case(self, payload: EvalCaseCreate) -> EvalCaseRead:
        values = payload.model_dump()
        values["expected_tools"] = _join_values(payload.expected_tools)
        values["tags"] = _join_values(payload.tags)
        row = models.EvalCase(**values)
        self.session.add(row)
        self.session.commit()
        self.session.refresh(row)
        return EvalCaseRead.model_validate(row)

    def list_eval_cases(
        self,
        limit: int = 50,
        offset: int = 0,
        enabled_only: bool = False,
    ) -> EvalCaseList:
        where_clauses = [models.EvalCase.enabled.is_(True)] if enabled_only else None
        return self._list(
            models.EvalCase,
            EvalCaseRead,
            EvalCaseList,
            limit,
            offset,
            models.EvalCase.created_at.desc(),
            where_clauses=where_clauses,
        )

    def get_eval_case(self, case_id: str) -> EvalCaseRead | None:
        row = self.session.get(models.EvalCase, case_id)
        return EvalCaseRead.model_validate(row) if row else None

    def update_eval_case(self, case_id: str, payload: EvalCaseUpdate) -> EvalCaseRead | None:
        row = self.session.get(models.EvalCase, case_id)
        if row is None:
            return None
        values = payload.model_dump(exclude_unset=True)
        if "expected_tools" in values:
            values["expected_tools"] = _join_values(values["expected_tools"])
        if "tags" in values:
            values["tags"] = _join_values(values["tags"])
        self._apply_values(row, values)
        return EvalCaseRead.model_validate(row)

    def delete_eval_case(self, case_id: str) -> bool:
        return self._delete(models.EvalCase, case_id)

    def create_eval_result(self, payload: EvalResultCreate) -> EvalResultRead:
        row = models.EvalResult(**payload.model_dump())
        self.session.add(row)
        self.session.commit()
        self.session.refresh(row)
        return EvalResultRead.model_validate(row)

    def list_eval_results(self, limit: int = 50, offset: int = 0) -> EvalResultList:
        return self._list(
            models.EvalResult,
            EvalResultRead,
            EvalResultList,
            limit,
            offset,
            models.EvalResult.created_at.desc(),
        )

    def get_eval_result(self, result_id: str) -> EvalResultRead | None:
        row = self.session.get(models.EvalResult, result_id)
        return EvalResultRead.model_validate(row) if row else None

    def get_eval_result_summary(self) -> EvalResultSummary:
        total = self.session.scalar(select(func.count()).select_from(models.EvalResult)) or 0
        skill_match_count = (
            self.session.scalar(
                select(func.count()).where(models.EvalResult.skill_match.is_(True))
            )
            or 0
        )
        report_count = (
            self.session.scalar(select(func.count()).where(models.EvalResult.has_report.is_(True)))
            or 0
        )
        error_count = (
            self.session.scalar(select(func.count()).where(models.EvalResult.has_error.is_(True)))
            or 0
        )
        average_score = self.session.scalar(select(func.avg(models.EvalResult.score)))
        return EvalResultSummary(
            total=total,
            skill_match_count=skill_match_count,
            report_count=report_count,
            error_count=error_count,
            average_score=float(average_score) if average_score is not None else None,
        )

    def get_agentops_summary(self) -> AgentOpsSummary:
        total_runs = self.session.scalar(select(func.count()).select_from(models.DiagnosisRun)) or 0
        succeeded_runs = (
            self.session.scalar(
                select(func.count()).where(models.DiagnosisRun.status == "succeeded")
            )
            or 0
        )
        failed_runs = (
            self.session.scalar(select(func.count()).where(models.DiagnosisRun.status == "failed"))
            or 0
        )
        avg_duration_ms = self.session.scalar(select(func.avg(models.DiagnosisRun.duration_ms)))
        total_tool_calls = self.session.scalar(select(func.sum(models.DiagnosisRun.tool_call_count))) or 0
        eval_results = self.session.scalar(select(func.count()).select_from(models.EvalResult)) or 0
        latest_score = self.session.scalar(
            select(models.EvalResult.score)
            .where(models.EvalResult.score.is_not(None))
            .order_by(models.EvalResult.created_at.desc())
            .limit(1)
        )

        success_rate = float(succeeded_runs / total_runs) if total_runs else 0.0
        return AgentOpsSummary(
            total_runs=total_runs,
            succeeded_runs=succeeded_runs,
            failed_runs=failed_runs,
            success_rate=success_rate,
            avg_duration_ms=float(avg_duration_ms) if avg_duration_ms is not None else None,
            total_tool_calls=int(total_tool_calls),
            eval_results=eval_results,
            latest_eval_score=float(latest_score) if latest_score is not None else None,
        )

    def _apply_values(self, row: object, values: dict[str, object]) -> None:
        for key, value in values.items():
            setattr(row, key, value)
        self.session.commit()
        self.session.refresh(row)

    def _delete(self, model: type, item_id: str) -> bool:
        row = self.session.get(model, item_id)
        if row is None:
            return False
        self.session.delete(row)
        self.session.commit()
        return True

    def _list(
        self,
        model: type,
        read_schema: type,
        list_schema: type,
        limit: int,
        offset: int,
        order_by: object,
        where_clauses: list[object] | None = None,
    ):
        count_stmt = select(func.count()).select_from(model)
        query_stmt = select(model)
        for clause in where_clauses or []:
            count_stmt = count_stmt.where(clause)
            query_stmt = query_stmt.where(clause)

        total = self.session.scalar(count_stmt) or 0
        rows: Sequence[object] = self.session.scalars(
            query_stmt.order_by(order_by).limit(limit).offset(offset)
        ).all()
        return list_schema(
            items=[read_schema.model_validate(row) for row in rows],
            total=total,
            limit=limit,
            offset=offset,
        )

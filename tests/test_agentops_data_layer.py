import tempfile
import unittest
from pathlib import Path

from sqlalchemy import inspect

from app.agentops.db import Base, create_engine, create_session_factory
from app.agentops.repository import AgentOpsRepository
from app.agentops.schemas import (
    DemoScenarioCreate,
    DemoScenarioUpdate,
    DiagnosisRunCreate,
    EvalCaseCreate,
    EvalCaseUpdate,
    EvalResultCreate,
)


class AgentOpsDataLayerTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        db_path = Path(self.tmpdir.name) / "agentops-test.db"
        self.engine = create_engine(f"sqlite:///{db_path}")
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = create_session_factory(self.engine)

    def tearDown(self) -> None:
        self.engine.dispose()
        self.tmpdir.cleanup()

    def test_create_all_tables(self) -> None:
        table_names = set(inspect(self.engine).get_table_names())

        self.assertEqual(
            {
                "diagnosis_runs",
                "demo_scenarios",
                "eval_cases",
                "eval_results",
            },
            table_names,
        )

    def test_repository_crud_and_eval_summary(self) -> None:
        with self.SessionLocal() as session:
            repo = AgentOpsRepository(session)

            run = repo.create_diagnosis_run(
                DiagnosisRunCreate(
                    session_id="web-chat",
                    input_text="Host CPU is high and nginx is timing out",
                    selected_skill="host_resource_diagnosis",
                    status="running",
                )
            )
            self.assertTrue(run.id)
            self.assertEqual("running", run.status)
            self.assertEqual(1, repo.list_diagnosis_runs(limit=10, offset=0).total)
            self.assertEqual(run.id, repo.get_diagnosis_run(run.id).id)

            scenario = repo.create_demo_scenario(
                DemoScenarioCreate(
                    id="host-cpu-demo",
                    title="Host CPU demo",
                    input_text="Host CPU remains above 95%",
                    expected_skill="host_resource_diagnosis",
                    tags=["host", "cpu"],
                    is_builtin=True,
                )
            )
            updated_scenario = repo.update_demo_scenario(
                scenario.id,
                DemoScenarioUpdate(description="Recorded host resource scenario"),
            )
            self.assertEqual("host,cpu", updated_scenario.tags)
            self.assertEqual("Recorded host resource scenario", updated_scenario.description)

            eval_case = repo.create_eval_case(
                EvalCaseCreate(
                    id="case-1",
                    name="Network timeout routes to network skill",
                    input_text="curl to api.example.com times out",
                    expected_skill="network_diagnosis",
                    expected_tools=["dns_lookup", "check_port"],
                    tags=["network"],
                )
            )
            updated_case = repo.update_eval_case(
                eval_case.id,
                EvalCaseUpdate(enabled=False),
            )
            self.assertFalse(updated_case.enabled)

            repo.create_eval_result(
                EvalResultCreate(
                    case_id=eval_case.id,
                    run_id=run.id,
                    mode="offline",
                    skill_match=True,
                    has_report=True,
                    has_error=False,
                    event_count=8,
                    tool_call_count=3,
                    duration_ms=1200,
                    score=0.9,
                    detail_json='{"notes":"ok"}',
                )
            )
            summary = repo.get_eval_result_summary()
            self.assertEqual(1, summary.total)
            self.assertEqual(1, summary.skill_match_count)
            self.assertEqual(0, summary.error_count)
            self.assertAlmostEqual(0.9, summary.average_score)

            self.assertTrue(repo.delete_diagnosis_run(run.id))
            self.assertIsNone(repo.get_diagnosis_run(run.id))


if __name__ == "__main__":
    unittest.main()

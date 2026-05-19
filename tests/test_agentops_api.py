import tempfile
import unittest
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.agentops.db import Base, create_engine, create_session_factory
from app.agentops.schemas import DiagnosisRunCreate, EvalResultCreate
from app.agentops.service import AgentOpsService
from app.api.v1.agentops import get_agentops_service, router
from app.config import settings


class AgentOpsApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        db_path = Path(self.tmpdir.name) / "agentops-api-test.db"
        self.engine = create_engine(f"sqlite:///{db_path}")
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = create_session_factory(self.engine)
        self.service = AgentOpsService(self.SessionLocal)

        app = FastAPI()
        app.include_router(router, prefix="/api/v1")
        app.dependency_overrides[get_agentops_service] = lambda: self.service
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.engine.dispose()
        self.tmpdir.cleanup()

    def test_summary_returns_zeroes_for_empty_db(self) -> None:
        response = self.client.get("/api/v1/agentops/summary")

        self.assertEqual(200, response.status_code)
        body = response.json()
        self.assertEqual("SUCCESS", body["code"])
        self.assertEqual(
            {
                "total_runs": 0,
                "succeeded_runs": 0,
                "failed_runs": 0,
                "success_rate": 0.0,
                "avg_duration_ms": None,
                "total_tool_calls": 0,
                "eval_results": 0,
                "latest_eval_score": None,
            },
            body["data"],
        )

    def test_agentops_disabled_returns_503(self) -> None:
        original = settings.agentops_enabled
        settings.agentops_enabled = False
        try:
            response = self.client.get("/api/v1/agentops/summary")
        finally:
            settings.agentops_enabled = original

        self.assertEqual(503, response.status_code)
        self.assertEqual("AgentOps database is disabled by configuration.", response.json()["detail"])

    def test_scenario_crud(self) -> None:
        create_response = self.client.post(
            "/api/v1/agentops/scenarios",
            json={
                "id": "host-cpu",
                "title": "Host CPU",
                "input_text": "Host CPU is above 95%",
                "expected_skill": "host_resource_diagnosis",
                "tags": ["host", "cpu"],
            },
        )
        self.assertEqual(200, create_response.status_code)
        self.assertEqual("host,cpu", create_response.json()["data"]["tags"])

        list_response = self.client.get("/api/v1/agentops/scenarios")
        self.assertEqual(200, list_response.status_code)
        self.assertEqual(1, list_response.json()["data"]["total"])

        update_response = self.client.put(
            "/api/v1/agentops/scenarios/host-cpu",
            json={"description": "CPU pressure demo"},
        )
        self.assertEqual(200, update_response.status_code)
        self.assertEqual("CPU pressure demo", update_response.json()["data"]["description"])

        delete_response = self.client.delete("/api/v1/agentops/scenarios/host-cpu")
        self.assertEqual(200, delete_response.status_code)
        self.assertTrue(delete_response.json()["data"]["deleted"])

        missing_response = self.client.put(
            "/api/v1/agentops/scenarios/missing",
            json={"description": "nope"},
        )
        self.assertEqual(404, missing_response.status_code)

    def test_eval_case_crud_and_enabled_filter(self) -> None:
        first = self.client.post(
            "/api/v1/agentops/eval-cases",
            json={
                "id": "case-enabled",
                "name": "Network timeout",
                "input_text": "curl to api.example.com times out",
                "expected_skill": "network_diagnosis",
                "expected_tools": ["dns_lookup", "check_port"],
            },
        )
        self.assertEqual(200, first.status_code)

        second = self.client.post(
            "/api/v1/agentops/eval-cases",
            json={
                "id": "case-disabled",
                "name": "Disabled case",
                "input_text": "ignore this case",
                "enabled": False,
            },
        )
        self.assertEqual(200, second.status_code)

        all_cases = self.client.get("/api/v1/agentops/eval-cases")
        enabled_cases = self.client.get("/api/v1/agentops/eval-cases?enabled_only=true")
        self.assertEqual(2, all_cases.json()["data"]["total"])
        self.assertEqual(1, enabled_cases.json()["data"]["total"])
        self.assertEqual("case-enabled", enabled_cases.json()["data"]["items"][0]["id"])

        update_response = self.client.put(
            "/api/v1/agentops/eval-cases/case-disabled",
            json={"enabled": True, "tags": ["enabled"]},
        )
        self.assertEqual(200, update_response.status_code)
        self.assertTrue(update_response.json()["data"]["enabled"])
        self.assertEqual("enabled", update_response.json()["data"]["tags"])

        delete_response = self.client.delete("/api/v1/agentops/eval-cases/case-disabled")
        self.assertEqual(200, delete_response.status_code)
        self.assertTrue(delete_response.json()["data"]["deleted"])

    def test_runs_and_eval_results_read_routes(self) -> None:
        run = self.service.create_diagnosis_run(
            DiagnosisRunCreate(
                input_text="Container restarted twice",
                selected_skill="container_diagnosis",
                status="succeeded",
                duration_ms=800,
                tool_call_count=2,
            )
        )
        self.service.create_eval_result(
            EvalResultCreate(run_id=run.id, mode="offline", has_report=True, score=0.75)
        )

        runs = self.client.get("/api/v1/agentops/runs")
        run_detail = self.client.get(f"/api/v1/agentops/runs/{run.id}")
        eval_results = self.client.get("/api/v1/agentops/eval-results")
        summary = self.client.get("/api/v1/agentops/summary")

        self.assertEqual(1, runs.json()["data"]["total"])
        self.assertEqual(run.id, run_detail.json()["data"]["id"])
        self.assertEqual(1, eval_results.json()["data"]["total"])
        self.assertEqual(1, summary.json()["data"]["total_runs"])
        self.assertEqual(1.0, summary.json()["data"]["success_rate"])
        self.assertEqual(0.75, summary.json()["data"]["latest_eval_score"])

        delete_response = self.client.delete(f"/api/v1/agentops/runs/{run.id}")
        self.assertEqual(200, delete_response.status_code)
        self.assertTrue(delete_response.json()["data"]["deleted"])

        missing_response = self.client.get("/api/v1/agentops/runs/missing")
        self.assertEqual(404, missing_response.status_code)


if __name__ == "__main__":
    unittest.main()

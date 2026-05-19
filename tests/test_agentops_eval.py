import tempfile
import unittest
from pathlib import Path

from app.agentops.eval import (
    EvalCaseSpec,
    evaluate_offline_fixtures,
)


class AgentOpsEvalTest(unittest.TestCase):
    def test_real_fixture_produces_deterministic_metrics(self) -> None:
        fixture = {
            "metadata": {
                "source": "real_sse",
                "scenario_id": "host-cpu",
                "input": "Host CPU stays above 95%",
                "event_count": 4,
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
                    "offset_ms": 500,
                },
                {
                    "event": "message",
                    "data": {
                        "type": "report",
                        "data": {"report": "# Diagnosis\nCPU pressure detected"},
                    },
                    "offset_ms": 1200,
                },
            ],
        }

        report = evaluate_offline_fixtures(
            [("host-cpu.json", fixture)],
            [
                EvalCaseSpec(
                    id="host-cpu",
                    name="Host CPU",
                    input_text="Host CPU stays above 95%",
                    expected_skill="host_resource_diagnosis",
                )
            ],
        )

        self.assertEqual(1, report.summary.sample_size)
        self.assertEqual(1.0, report.summary.skill_match_rate)
        self.assertEqual(1.0, report.summary.sse_completion_rate)
        self.assertEqual(1.0, report.summary.report_non_empty_rate)
        self.assertEqual(1.0, report.summary.tool_call_success_rate)
        self.assertEqual(1200.0, report.summary.avg_duration_ms)
        self.assertEqual(0.0, report.summary.error_rate)
        self.assertEqual(1.0, report.summary.score)
        self.assertEqual("host_resource_diagnosis", report.results[0].selected_skill)
        self.assertTrue(report.results[0].report_non_empty)

    def test_fake_fixture_is_skipped_and_missing_expected_skill_is_excluded(self) -> None:
        fake_fixture = {
            "metadata": {"source": "synthetic", "event_count": 1},
            "events": [{"data": {"type": "complete"}}],
        }
        real_without_case = {
            "metadata": {
                "source": "real_sse",
                "scenario_id": "unmatched",
                "input": "No matching case",
                "event_count": 2,
            },
            "events": [
                {"data": {"type": "skill_selected", "data": {"skill": "generic_oncall"}}},
                {"data": {"type": "complete"}, "offset_ms": 250},
            ],
        }

        report = evaluate_offline_fixtures(
            [
                ("fake.json", fake_fixture),
                ("unmatched.json", real_without_case),
            ],
            [],
        )

        self.assertEqual(1, report.summary.sample_size)
        self.assertIsNone(report.summary.skill_match_rate)
        self.assertEqual(1.0, report.summary.sse_completion_rate)
        self.assertEqual(0.0, report.summary.report_non_empty_rate)
        self.assertEqual(250.0, report.summary.avg_duration_ms)
        self.assertEqual(0.0, report.summary.error_rate)
        self.assertEqual(1, len(report.skipped))
        self.assertIn("metadata.source", report.skipped[0].reason)

    def test_manifest_loader_reads_listed_fixtures(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            fixtures_dir = Path(tmp)
            (fixtures_dir / "manifest.json").write_text(
                '{"fixtures":[{"id":"host-cpu","path":"host-cpu.json"}]}',
                encoding="utf-8",
            )
            (fixtures_dir / "host-cpu.json").write_text(
                '{"metadata":{"source":"real_sse","event_count":1},"events":[{"data":{"type":"complete"}}]}',
                encoding="utf-8",
            )

            from app.agentops.eval import load_fixture_records

            records = load_fixture_records(fixtures_dir)

        self.assertEqual([("host-cpu.json", "host-cpu")], [(r.path.name, r.fixture_id) for r in records])

    def test_manifest_loader_accepts_utf8_bom_json(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            fixtures_dir = Path(tmp)
            (fixtures_dir / "manifest.json").write_bytes(
                b'\xef\xbb\xbf{"fixtures":[{"id":"host-cpu","path":"host-cpu.json"}]}'
            )
            (fixtures_dir / "host-cpu.json").write_bytes(
                b'\xef\xbb\xbf{"metadata":{"source":"real_sse","event_count":1},"events":[{"data":{"type":"complete"}}]}'
            )

            from app.agentops.eval import load_fixture_records

            records = load_fixture_records(fixtures_dir)

        self.assertEqual(1, len(records))
        self.assertEqual("host-cpu", records[0].fixture_id)


if __name__ == "__main__":
    unittest.main()

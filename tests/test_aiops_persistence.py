import json
import unittest

from loguru import logger

from app.api.v1.aiops import _persisting_sse_event_generator


async def _event_source(events):
    for event in events:
        if isinstance(event, BaseException):
            raise event
        yield event


class AiopsPersistenceTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        logger.disable("app.api.v1.aiops")

    async def asyncTearDown(self) -> None:
        logger.enable("app.api.v1.aiops")

    async def test_successful_sse_stream_is_unchanged_and_persisted(self) -> None:
        events = [
            {"type": "start", "stage": "diagnosis_init", "message": "", "data": {}},
            {
                "type": "skill_selected",
                "stage": "skill_selected",
                "message": "",
                "data": {"skill": "host_resource_diagnosis"},
            },
            {
                "type": "tool_call",
                "stage": "tool_call",
                "message": "",
                "data": {"name": "get_local_cpu_memory"},
            },
            {
                "type": "report",
                "stage": "report_generated",
                "message": "",
                "data": {"report": "# Diagnosis\nCPU pressure"},
            },
            {"type": "complete", "stage": "diagnosis_complete", "message": "", "data": {}},
        ]
        saved = []

        frames = [
            frame
            async for frame in _persisting_sse_event_generator(
                _event_source(events),
                input_text="  Host CPU is very high\nand nginx is slow  ",
                session_id="session-1",
                persist_func=saved.append,
            )
        ]

        self.assertEqual([json.loads(frame["data"]) for frame in frames], events)
        self.assertEqual(["message"] * len(events), [frame["event"] for frame in frames])
        self.assertEqual(1, len(saved))
        payload = saved[0]
        self.assertEqual("succeeded", payload.status)
        self.assertEqual("session-1", payload.session_id)
        self.assertEqual("host_resource_diagnosis", payload.selected_skill)
        self.assertEqual(5, payload.event_count)
        self.assertEqual(1, payload.tool_call_count)
        self.assertEqual("# Diagnosis\nCPU pressure", payload.report_markdown)
        self.assertIsNone(payload.error_message)
        self.assertLessEqual(len(payload.title), 60)
        self.assertEqual("Host CPU is very high and nginx is slow", payload.title)
        self.assertIsNotNone(payload.started_at)
        self.assertIsNotNone(payload.finished_at)
        self.assertIsNotNone(payload.duration_ms)

    async def test_stream_exception_yields_existing_error_shape_and_persists_failed_run(self) -> None:
        saved = []

        frames = [
            frame
            async for frame in _persisting_sse_event_generator(
                _event_source(
                    [
                        {"type": "start", "stage": "diagnosis_init", "message": "", "data": {}},
                        RuntimeError("graph exploded"),
                    ]
                ),
                input_text="Container keeps restarting",
                session_id="session-2",
                persist_func=saved.append,
            )
        ]

        decoded = [json.loads(frame["data"]) for frame in frames]
        self.assertEqual("start", decoded[0]["type"])
        self.assertEqual("error", decoded[1]["type"])
        self.assertEqual("stream_failure", decoded[1]["stage"])
        self.assertEqual({"error_type": "RuntimeError"}, decoded[1]["data"])
        self.assertIn("graph exploded", decoded[1]["message"])
        self.assertEqual(1, len(saved))
        self.assertEqual("failed", saved[0].status)
        self.assertIn("graph exploded", saved[0].error_message)
        self.assertEqual(2, saved[0].event_count)

    async def test_persistence_failure_does_not_break_sse_stream(self) -> None:
        def failing_persist(_payload):
            raise RuntimeError("database unavailable")

        events = [
            {"type": "report", "stage": "report_generated", "message": "", "data": {"report": "ok"}},
            {"type": "complete", "stage": "diagnosis_complete", "message": "", "data": {}},
        ]

        frames = [
            frame
            async for frame in _persisting_sse_event_generator(
                _event_source(events),
                input_text="Network timeout",
                session_id="session-3",
                persist_func=failing_persist,
            )
        ]

        self.assertEqual([json.loads(frame["data"]) for frame in frames], events)


if __name__ == "__main__":
    unittest.main()

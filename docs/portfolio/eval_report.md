# Agent Eval Report

## Run Metadata
- commit: b6246f0
- run_time: 2026-05-20T01:48:55+00:00
- mode: offline
- sample_size: 0
- fixtures_dir: frontend/demo_fixtures
- saved_eval_result_id: 9b0a9cab2ab84ae587b882f5849a25fd

## Metrics
- skill_match_rate: null
- sse_completion_rate: null
- report_non_empty_rate: null
- tool_call_success_rate: null
- avg_duration_ms: null
- error_rate: null
- score: null

## Per-case Results

No real recorded fixtures were evaluated.

## Known Limitations

- Offline fixtures reflect recorded runs only.
- No LLM-as-judge in this version.
- Metrics are smoke-level, not production benchmark.
- A final report event is accepted as a terminal indicator for current project fixtures.
- Tool-call success is null when the recorded SSE event does not expose success/status.

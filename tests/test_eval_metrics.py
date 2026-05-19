from app.agentops.eval import (
    EvalCaseSpec,
    build_summary,
    evaluate_offline_fixtures,
    final_report_from_events,
    has_error_signal,
    has_terminal_event,
    normalize_events,
    selected_skill_from_events,
    tool_call_counts,
)


def test_extract_selected_skill_from_fixture_events(sample_real_sse_fixture):
    events = normalize_events(sample_real_sse_fixture["events"])

    assert selected_skill_from_events(events) == "host_resource_diagnosis"


def test_detect_report_and_terminal_event(sample_real_sse_fixture):
    events = normalize_events(sample_real_sse_fixture["events"])

    assert final_report_from_events(events).startswith("# Diagnosis")
    assert has_terminal_event(events) is True


def test_count_errors_from_event_and_metadata(sample_real_sse_fixture):
    events = normalize_events(sample_real_sse_fixture["events"])
    error_events = normalize_events(
        [{"data": {"type": "error", "stage": "diagnosis_failed", "message": "failed"}}]
    )

    assert has_error_signal(events, sample_real_sse_fixture["metadata"]) is False
    assert has_error_signal(error_events, {}) is True
    assert has_error_signal(events, {"status": "failed"}) is True


def test_tool_call_success_rate_counts_only_determined_events(sample_real_sse_fixture):
    events = normalize_events(
        sample_real_sse_fixture["events"]
        + [
            {"data": {"type": "tool_call", "data": {"name": "check_port", "status": "failed"}}},
            {"data": {"type": "tool_call", "data": {"name": "dns_lookup"}}},
        ]
    )

    success_count, determined_count, tool_call_count = tool_call_counts(events)

    assert success_count == 1
    assert determined_count == 2
    assert tool_call_count == 3


def test_compute_aggregate_score(sample_real_sse_fixture):
    report = evaluate_offline_fixtures(
        [("host-cpu.json", sample_real_sse_fixture)],
        [
            EvalCaseSpec(
                id="host-cpu",
                name="Host CPU",
                input_text="Host CPU remains above 95%",
                expected_skill="host_resource_diagnosis",
            )
        ],
    )

    summary = build_summary(report.results)

    assert summary.sample_size == 1
    assert summary.skill_match_rate == 1.0
    assert summary.sse_completion_rate == 1.0
    assert summary.report_non_empty_rate == 1.0
    assert summary.tool_call_success_rate == 1.0
    assert summary.error_rate == 0.0
    assert summary.score == 1.0


def test_missing_expected_skill_is_not_false_failure(sample_real_sse_fixture):
    report = evaluate_offline_fixtures([("host-cpu.json", sample_real_sse_fixture)], [])

    assert report.results[0].skill_match is None
    assert report.summary.skill_match_rate is None
    assert report.summary.sse_completion_rate == 1.0

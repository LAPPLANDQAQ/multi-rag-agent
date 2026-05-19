from app.agentops.schemas import (
    DemoScenarioUpdate,
    EvalCaseUpdate,
    EvalResultCreate,
)


def test_diagnosis_run_crud(agentops_repo, sample_diagnosis_run):
    created = agentops_repo.create_diagnosis_run(sample_diagnosis_run)

    listed = agentops_repo.list_diagnosis_runs(limit=10, offset=0)
    fetched = agentops_repo.get_diagnosis_run(created.id)

    assert listed.total == 1
    assert fetched is not None
    assert fetched.id == created.id
    assert fetched.status == "succeeded"
    assert agentops_repo.delete_diagnosis_run(created.id) is True
    assert agentops_repo.get_diagnosis_run(created.id) is None


def test_demo_scenario_crud(agentops_repo, sample_demo_scenario):
    created = agentops_repo.create_demo_scenario(sample_demo_scenario)

    updated = agentops_repo.update_demo_scenario(
        created.id,
        DemoScenarioUpdate(description="pytest scenario", tags=["pytest", "host"]),
    )

    assert updated is not None
    assert updated.description == "pytest scenario"
    assert updated.tags == "pytest,host"
    assert agentops_repo.list_demo_scenarios().total == 1
    assert agentops_repo.delete_demo_scenario(created.id) is True
    assert agentops_repo.get_demo_scenario(created.id) is None


def test_eval_case_crud(agentops_repo, sample_eval_case):
    created = agentops_repo.create_eval_case(sample_eval_case)

    updated = agentops_repo.update_eval_case(
        created.id,
        EvalCaseUpdate(enabled=False, expected_tools=["get_local_cpu_memory", "list_top_processes"]),
    )

    assert updated is not None
    assert updated.enabled is False
    assert updated.expected_tools == "get_local_cpu_memory,list_top_processes"
    assert agentops_repo.list_eval_cases(enabled_only=True).total == 0
    assert agentops_repo.delete_eval_case(created.id) is True
    assert agentops_repo.get_eval_case(created.id) is None


def test_eval_result_create_and_list(agentops_repo, sample_eval_result):
    created = agentops_repo.create_eval_result(sample_eval_result)
    listed = agentops_repo.list_eval_results(limit=10, offset=0)

    assert created.id
    assert listed.total == 1
    assert listed.items[0].score == 1.0


def test_summary_empty_db_returns_zeroes(agentops_repo):
    summary = agentops_repo.get_agentops_summary()

    assert summary.total_runs == 0
    assert summary.succeeded_runs == 0
    assert summary.failed_runs == 0
    assert summary.success_rate == 0.0
    assert summary.avg_duration_ms is None
    assert summary.total_tool_calls == 0
    assert summary.eval_results == 0
    assert summary.latest_eval_score is None


def test_summary_with_data_calculates_counts(agentops_repo, sample_diagnosis_run):
    run = agentops_repo.create_diagnosis_run(sample_diagnosis_run)
    agentops_repo.create_eval_result(
        EvalResultCreate(
            run_id=run.id,
            mode="offline",
            has_report=True,
            has_error=False,
            event_count=5,
            tool_call_count=2,
            duration_ms=1200,
            score=0.75,
        )
    )

    summary = agentops_repo.get_agentops_summary()

    assert summary.total_runs == 1
    assert summary.succeeded_runs == 1
    assert summary.failed_runs == 0
    assert summary.success_rate == 1.0
    assert summary.avg_duration_ms == 1200.0
    assert summary.total_tool_calls == 2
    assert summary.eval_results == 1
    assert summary.latest_eval_score == 0.75

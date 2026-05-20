"""Run deterministic AgentOps evaluations for recorded SSE fixtures."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from app.agentops.db import create_all
from app.agentops.eval import (
    EvalCaseSpec,
    EvalRunReport,
    evaluate_fixture_records,
    format_metric,
    load_fixture_records,
    utc_now_iso,
    write_markdown_report,
)
from app.agentops.schemas import EvalResultCreate
from app.agentops.service import agentops_service


DEFAULT_FIXTURES_DIR = REPO_ROOT / "frontend" / "demo_fixtures"
DEFAULT_REPORT_PATH = REPO_ROOT / "docs" / "portfolio" / "eval_report.md"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Evaluate recorded AIOps SSE fixtures without LLM or backend calls."
    )
    parser.add_argument("--mode", choices=["offline", "live"], default="offline")
    parser.add_argument("--fixtures-dir", default=str(DEFAULT_FIXTURES_DIR))
    parser.add_argument("--report-path", default=str(DEFAULT_REPORT_PATH))
    parser.add_argument("--limit", type=int, default=3, help="Reserved for future live mode.")
    parser.add_argument(
        "--no-db",
        action="store_true",
        help="Generate the report without writing an aggregate eval_results row.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.mode == "live":
        print("live mode: not implemented yet")
        print(f"requested limit: {args.limit}")
        return 0

    fixtures_dir = Path(args.fixtures_dir)
    report_path = Path(args.report_path)
    commit = current_commit()
    run_time = utc_now_iso()

    db_warning: str | None = None
    eval_cases: list[EvalCaseSpec] = []
    if not args.no_db:
        eval_cases, db_warning = load_eval_cases_from_db()

    try:
        records = load_fixture_records(fixtures_dir)
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    report = evaluate_fixture_records(
        records,
        eval_cases,
        commit=commit,
        run_time=run_time,
        mode="offline",
        fixtures_dir=display_path(fixtures_dir),
    )
    report.db_warning = db_warning

    if not args.no_db:
        saved_id, save_warning = save_aggregate_eval_result(report)
        report.saved_eval_result_id = saved_id
        if save_warning:
            report.db_warning = join_warnings(report.db_warning, save_warning)

    write_markdown_report(report, report_path)
    print_cli_report(report, report_path)
    return 0


def load_eval_cases_from_db() -> tuple[list[EvalCaseSpec], str | None]:
    try:
        create_all()
        data = agentops_service.list_eval_cases(limit=200, offset=0, enabled_only=True)
    except Exception as exc:  # pragma: no cover - depends on local DB state
        return [], f"Could not load eval cases from DB: {exc}"

    cases = [
        EvalCaseSpec(
            id=item.id,
            name=item.name,
            input_text=item.input_text,
            expected_skill=item.expected_skill,
        )
        for item in data.items
    ]
    return cases, None


def save_aggregate_eval_result(report: EvalRunReport) -> tuple[str | None, str | None]:
    summary = report.summary
    try:
        create_all()
        saved = agentops_service.create_eval_result(
            EvalResultCreate(
                case_id=None,
                run_id=None,
                mode="offline",
                skill_match=(
                    None
                    if summary.skill_match_rate is None
                    else summary.skill_match_rate == 1.0
                ),
                has_report=bool(summary.report_non_empty_rate and summary.report_non_empty_rate > 0),
                has_error=bool(summary.error_rate and summary.error_rate > 0),
                event_count=summary.total_events,
                tool_call_count=summary.total_tool_calls,
                duration_ms=(
                    int(round(summary.avg_duration_ms))
                    if summary.avg_duration_ms is not None
                    else None
                ),
                score=summary.score,
                detail_json=report.detail_json(),
            )
        )
    except Exception as exc:  # pragma: no cover - depends on local DB state
        return None, f"Could not save aggregate eval_result: {exc}"
    return saved.id, None


def print_cli_report(report: EvalRunReport, report_path: Path) -> None:
    summary = report.summary
    print("Agent Eval")
    print(f"commit: {report.commit}")
    print(f"run_time: {report.run_time}")
    print(f"mode: {report.mode}")
    print(f"sample_size: {summary.sample_size}")
    print(f"fixtures_dir: {report.fixtures_dir}")
    print("metrics:")
    print(f"  skill_match_rate: {format_metric(summary.skill_match_rate)}")
    print(f"  sse_completion_rate: {format_metric(summary.sse_completion_rate)}")
    print(f"  report_non_empty_rate: {format_metric(summary.report_non_empty_rate)}")
    print(f"  tool_call_success_rate: {format_metric(summary.tool_call_success_rate)}")
    print(f"  avg_duration_ms: {format_metric(summary.avg_duration_ms)}")
    print(f"  error_rate: {format_metric(summary.error_rate)}")
    print(f"  score: {format_metric(summary.score)}")
    print(f"saved_eval_result_id: {report.saved_eval_result_id or 'not saved'}")
    if report.skipped:
        print("skipped:")
        for item in report.skipped:
            print(f"  {item.fixture}: {item.reason}")
    if report.db_warning:
        print(f"warning: {report.db_warning}")
    print(f"output_report_path: {report_path}")


def current_commit() -> str:
    try:
        return subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=REPO_ROOT,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return "unknown"


def join_warnings(first: str | None, second: str | None) -> str | None:
    if first and second:
        return f"{first} | {second}"
    return first or second


def display_path(path: Path) -> str:
    try:
        return path.resolve().relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return str(path)


if __name__ == "__main__":
    raise SystemExit(main())

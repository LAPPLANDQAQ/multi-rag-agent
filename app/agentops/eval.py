"""Deterministic offline evaluation for recorded AIOps SSE fixtures."""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core import metrics


TERMINAL_TYPES = {"complete", "done", "finished", "diagnosis_complete"}
TERMINAL_STAGES = {"complete", "done", "finished", "diagnosis_complete"}
SUCCESS_STATUS = {"ok", "success", "succeeded", "passed", "pass", "true"}
FAIL_STATUS = {"error", "failed", "failure", "fail", "false"}


@dataclass(frozen=True)
class EvalCaseSpec:
    id: str
    name: str
    input_text: str = ""
    expected_skill: str | None = None


@dataclass(frozen=True)
class FixtureRecord:
    path: Path
    data: dict[str, Any]
    fixture_id: str | None = None
    title: str | None = None


@dataclass(frozen=True)
class SkippedFixture:
    fixture: str
    reason: str


@dataclass
class FixtureEvalResult:
    fixture: str
    fixture_id: str | None
    case_id: str | None
    case_name: str | None
    expected_skill: str | None
    selected_skill: str | None
    skill_match: bool | None
    sse_completed: bool
    report_non_empty: bool
    tool_call_success_rate: float | None
    duration_ms: float | None
    has_error: bool
    score: float | None
    event_count: int
    tool_call_count: int
    input_text: str
    warnings: list[str] = field(default_factory=list)
    _tool_success_count: int = 0
    _tool_determined_count: int = 0

    def to_detail_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data.pop("_tool_success_count", None)
        data.pop("_tool_determined_count", None)
        return data


@dataclass
class EvalSummary:
    sample_size: int
    skill_match_rate: float | None
    sse_completion_rate: float | None
    report_non_empty_rate: float | None
    tool_call_success_rate: float | None
    avg_duration_ms: float | None
    error_rate: float | None
    score: float | None
    total_events: int
    total_tool_calls: int


@dataclass
class EvalRunReport:
    commit: str
    run_time: str
    mode: str
    fixtures_dir: str
    summary: EvalSummary
    results: list[FixtureEvalResult]
    skipped: list[SkippedFixture]
    saved_eval_result_id: str | None = None
    db_warning: str | None = None

    def detail_json(self) -> str:
        payload = {
            "commit": self.commit,
            "run_time": self.run_time,
            "mode": self.mode,
            "fixtures_dir": self.fixtures_dir,
            "summary": asdict(self.summary),
            "results": [item.to_detail_dict() for item in self.results],
            "skipped": [asdict(item) for item in self.skipped],
            "known_limitations": known_limitations(),
        }
        return json.dumps(payload, ensure_ascii=False, sort_keys=True)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def load_fixture_records(fixtures_dir: Path | str) -> list[FixtureRecord]:
    """Load manifest fixtures and any unlisted local JSON fixture files."""

    root = Path(fixtures_dir)
    manifest_path = root / "manifest.json"
    records: list[FixtureRecord] = []
    seen_paths: set[Path] = set()

    if manifest_path.exists():
        manifest = _read_json_file(manifest_path)
        fixtures = manifest.get("fixtures", [])
        if not isinstance(fixtures, list):
            raise ValueError(f"{manifest_path} fixtures must be an array")
        for entry in fixtures:
            if not isinstance(entry, dict):
                continue
            path_value = str(entry.get("path") or "").strip()
            if not path_value:
                fixture_id = str(entry.get("id") or "").strip()
                path_value = f"{fixture_id}.json" if fixture_id else ""
            if not path_value:
                continue
            path = Path(path_value)
            if not path.is_absolute():
                path = root / path
            data = _read_json_file(path)
            records.append(
                FixtureRecord(
                    path=path,
                    data=data,
                    fixture_id=str(entry.get("id") or "").strip() or path.stem,
                    title=str(entry.get("title") or "").strip() or None,
                )
            )
            seen_paths.add(path.resolve())

    for path in sorted(root.glob("*.json")):
        if path.name == "manifest.json" or path.resolve() in seen_paths:
            continue
        records.append(FixtureRecord(path=path, data=_read_json_file(path), fixture_id=path.stem))

    return records


def evaluate_fixture_records(
    records: list[FixtureRecord],
    eval_cases: list[EvalCaseSpec],
    *,
    commit: str = "unknown",
    run_time: str | None = None,
    mode: str = "offline",
    fixtures_dir: str = "",
) -> EvalRunReport:
    report = evaluate_offline_fixtures(records, eval_cases)
    report.commit = commit
    report.run_time = run_time or utc_now_iso()
    report.mode = mode
    report.fixtures_dir = fixtures_dir
    metrics.record_eval_run(
        mode=mode,
        status="success",
        score=report.summary.score,
        cases=len(eval_cases),
    )
    return report


def evaluate_offline_fixtures(
    fixtures: list[FixtureRecord | tuple[str, dict[str, Any]]],
    eval_cases: list[EvalCaseSpec],
) -> EvalRunReport:
    results: list[FixtureEvalResult] = []
    skipped: list[SkippedFixture] = []

    for item in fixtures:
        record = _coerce_fixture_record(item)
        fixture_name = _display_fixture_name(record)
        try:
            result = evaluate_one_fixture(record, eval_cases)
        except ValueError as exc:
            skipped.append(SkippedFixture(fixture=fixture_name, reason=str(exc)))
            continue
        results.append(result)

    return EvalRunReport(
        commit="unknown",
        run_time=utc_now_iso(),
        mode="offline",
        fixtures_dir="",
        summary=build_summary(results),
        results=results,
        skipped=skipped,
    )


def evaluate_one_fixture(
    record: FixtureRecord,
    eval_cases: list[EvalCaseSpec],
) -> FixtureEvalResult:
    fixture = record.data
    metadata = extract_metadata(fixture)
    if metadata.get("source") != "real_sse":
        raise ValueError('metadata.source must be "real_sse"')

    events = normalize_events(fixture.get("events", []))
    if not events:
        raise ValueError("fixture events must be a non-empty array")

    case = match_eval_case(metadata, eval_cases)
    selected_skill = selected_skill_from_events(events)
    expected_skill = case.expected_skill if case else None
    skill_match = None
    if expected_skill:
        skill_match = normalize_id(selected_skill) == normalize_id(expected_skill)

    report_text = final_report_from_events(events)
    report_non_empty = bool(report_text and report_text.strip())
    sse_completed = has_terminal_event(events) or report_non_empty
    has_error = has_error_signal(events, metadata)
    tool_success, tool_determined, tool_call_count = tool_call_counts(events)
    tool_rate = _rate(tool_success, tool_determined)
    duration_ms = duration_from_fixture(metadata, events)

    score_values: list[float] = [
        1.0 if sse_completed else 0.0,
        1.0 if report_non_empty else 0.0,
        0.0 if has_error else 1.0,
    ]
    if skill_match is not None:
        score_values.append(1.0 if skill_match else 0.0)
    if tool_rate is not None:
        score_values.append(tool_rate)

    event_count = _int_or_none(metadata.get("event_count")) or len(events)
    warnings: list[str] = []
    if report_non_empty and not has_terminal_event(events):
        warnings.append("report event used as terminal indicator")
    if tool_call_count > 0 and tool_determined == 0:
        warnings.append("tool call success is not exposed by this fixture schema")

    return FixtureEvalResult(
        fixture=_display_fixture_name(record),
        fixture_id=record.fixture_id or _str_or_none(metadata.get("scenario_id")),
        case_id=case.id if case else None,
        case_name=case.name if case else None,
        expected_skill=expected_skill,
        selected_skill=selected_skill,
        skill_match=skill_match,
        sse_completed=sse_completed,
        report_non_empty=report_non_empty,
        tool_call_success_rate=tool_rate,
        duration_ms=duration_ms,
        has_error=has_error,
        score=sum(score_values) / len(score_values) if score_values else None,
        event_count=event_count,
        tool_call_count=tool_call_count,
        input_text=_str_or_none(metadata.get("input")) or (case.input_text if case else ""),
        warnings=warnings,
        _tool_success_count=tool_success,
        _tool_determined_count=tool_determined,
    )


def build_summary(results: list[FixtureEvalResult]) -> EvalSummary:
    sample_size = len(results)
    skill_values = [item.skill_match for item in results if item.skill_match is not None]
    durations = [item.duration_ms for item in results if item.duration_ms is not None]
    total_tool_success = sum(item._tool_success_count for item in results)
    total_tool_determined = sum(item._tool_determined_count for item in results)

    skill_match_rate = _bool_rate(skill_values)
    sse_completion_rate = _bool_rate([item.sse_completed for item in results])
    report_non_empty_rate = _bool_rate([item.report_non_empty for item in results])
    tool_call_success_rate = _rate(total_tool_success, total_tool_determined)
    error_rate = _bool_rate([item.has_error for item in results])
    avg_duration_ms = sum(durations) / len(durations) if durations else None

    score_values = [
        value
        for value in [
            skill_match_rate,
            sse_completion_rate,
            report_non_empty_rate,
            tool_call_success_rate,
            (1.0 - error_rate) if error_rate is not None else None,
        ]
        if value is not None
    ]
    score = sum(score_values) / len(score_values) if score_values else None

    return EvalSummary(
        sample_size=sample_size,
        skill_match_rate=skill_match_rate,
        sse_completion_rate=sse_completion_rate,
        report_non_empty_rate=report_non_empty_rate,
        tool_call_success_rate=tool_call_success_rate,
        avg_duration_ms=avg_duration_ms,
        error_rate=error_rate,
        score=score,
        total_events=sum(item.event_count for item in results),
        total_tool_calls=sum(item.tool_call_count for item in results),
    )


def extract_metadata(fixture: dict[str, Any]) -> dict[str, Any]:
    metadata = fixture.get("metadata")
    if isinstance(metadata, dict):
        return metadata
    return {
        key: fixture.get(key)
        for key in [
            "schema_version",
            "recorded_at",
            "source",
            "scenario_id",
            "input",
            "event_count",
            "duration_ms",
            "status",
            "failed",
        ]
        if key in fixture
    }


def normalize_events(raw_events: Any) -> list[dict[str, Any]]:
    if not isinstance(raw_events, list):
        return []
    events: list[dict[str, Any]] = []
    for index, item in enumerate(raw_events):
        if not isinstance(item, dict):
            continue
        payload = item.get("data", item)
        if isinstance(payload, str):
            try:
                payload = json.loads(payload)
            except json.JSONDecodeError:
                payload = {"raw": payload}
        if not isinstance(payload, dict):
            payload = {"value": payload}
        events.append(
            {
                "event": item.get("event") or "message",
                "payload": payload,
                "offset_ms": _float_or_none(item.get("offset_ms")),
                "index": index,
            }
        )
    return events


def selected_skill_from_events(events: list[dict[str, Any]]) -> str | None:
    for event in events:
        payload = event["payload"]
        if event_type(payload) != "skill_selected":
            continue
        data = payload_data(payload)
        return _str_or_none(data.get("skill") or payload.get("skill"))
    return None


def final_report_from_events(events: list[dict[str, Any]]) -> str | None:
    report: str | None = None
    for event in events:
        payload = event["payload"]
        if event_type(payload) != "report":
            continue
        data = payload_data(payload)
        candidate = data.get("report") or data.get("final_report") or payload.get("report")
        if isinstance(candidate, str):
            report = candidate
    return report


def has_terminal_event(events: list[dict[str, Any]]) -> bool:
    for event in events:
        payload = event["payload"]
        t = event_type(payload)
        stage = normalize_id(payload.get("stage"))
        if t in TERMINAL_TYPES or stage in TERMINAL_STAGES:
            return True
    return False


def has_error_signal(events: list[dict[str, Any]], metadata: dict[str, Any]) -> bool:
    if str(metadata.get("status") or "").lower() in {"failed", "failure", "error"}:
        return True
    if metadata.get("failed") is True:
        return True
    for event in events:
        payload = event["payload"]
        t = event_type(payload)
        stage = normalize_id(payload.get("stage"))
        if t == "error" or "error" in stage or "failed" in stage:
            return True
    return False


def tool_call_counts(events: list[dict[str, Any]]) -> tuple[int, int, int]:
    success_count = 0
    determined_count = 0
    tool_call_count = 0

    for event in events:
        payload = event["payload"]
        t = event_type(payload)
        stage = normalize_id(payload.get("stage"))
        if t not in {"tool_call", "tool_result"} and stage not in {"tool_call", "tool_result"}:
            continue
        tool_call_count += 1
        success = tool_success_value(payload)
        if success is None:
            continue
        determined_count += 1
        if success:
            success_count += 1

    return success_count, determined_count, tool_call_count


def tool_success_value(payload: dict[str, Any]) -> bool | None:
    data = payload_data(payload)
    for source in (data, payload):
        for key in ("success", "ok"):
            value = source.get(key)
            if isinstance(value, bool):
                return value
        status = _str_or_none(source.get("status"))
        if status:
            status_norm = status.strip().lower()
            if status_norm in SUCCESS_STATUS:
                return True
            if status_norm in FAIL_STATUS:
                return False
    return None


def duration_from_fixture(metadata: dict[str, Any], events: list[dict[str, Any]]) -> float | None:
    duration = _float_or_none(metadata.get("duration_ms"))
    if duration is not None:
        return duration
    offsets = [event["offset_ms"] for event in events if event.get("offset_ms") is not None]
    return max(offsets) if offsets else None


def match_eval_case(metadata: dict[str, Any], eval_cases: list[EvalCaseSpec]) -> EvalCaseSpec | None:
    scenario_id = normalize_id(metadata.get("scenario_id"))
    input_text = normalize_text(metadata.get("input"))

    if scenario_id:
        for case in eval_cases:
            if scenario_id in {normalize_id(case.id), normalize_id(case.name)}:
                return case

    if input_text:
        for case in eval_cases:
            if input_text == normalize_text(case.input_text):
                return case
    return None


def render_markdown_report(report: EvalRunReport) -> str:
    summary = report.summary
    lines = [
        "# Agent Eval Report",
        "",
        "## Run Metadata",
        f"- commit: {report.commit}",
        f"- run_time: {report.run_time}",
        f"- mode: {report.mode}",
        f"- sample_size: {summary.sample_size}",
        f"- fixtures_dir: {report.fixtures_dir}",
        f"- saved_eval_result_id: {report.saved_eval_result_id or 'not saved'}",
        "",
        "## Metrics",
        f"- skill_match_rate: {format_metric(summary.skill_match_rate)}",
        f"- sse_completion_rate: {format_metric(summary.sse_completion_rate)}",
        f"- report_non_empty_rate: {format_metric(summary.report_non_empty_rate)}",
        f"- tool_call_success_rate: {format_metric(summary.tool_call_success_rate)}",
        f"- avg_duration_ms: {format_metric(summary.avg_duration_ms)}",
        f"- error_rate: {format_metric(summary.error_rate)}",
        f"- score: {format_metric(summary.score)}",
        "",
        "## Per-case Results",
    ]
    if not report.results:
        lines.append("")
        lines.append("No real recorded fixtures were evaluated.")
    else:
        lines.extend(
            [
                "",
                "| fixture | case | expected_skill | selected_skill | skill_match | completed | report | tool_success | duration_ms | error | score |",
                "|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|",
            ]
        )
        for item in report.results:
            lines.append(
                "| "
                + " | ".join(
                    [
                        _md_cell(item.fixture),
                        _md_cell(item.case_id or "-"),
                        _md_cell(item.expected_skill or "-"),
                        _md_cell(item.selected_skill or "-"),
                        _md_cell(format_bool(item.skill_match)),
                        _md_cell(format_bool(item.sse_completed)),
                        _md_cell(format_bool(item.report_non_empty)),
                        _md_cell(format_metric(item.tool_call_success_rate)),
                        _md_cell(format_metric(item.duration_ms)),
                        _md_cell(format_bool(item.has_error)),
                        _md_cell(format_metric(item.score)),
                    ]
                )
                + " |"
            )

    if report.skipped:
        lines.extend(["", "## Skipped Fixtures", ""])
        for item in report.skipped:
            lines.append(f"- `{item.fixture}`: {item.reason}")

    if report.db_warning:
        lines.extend(["", "## Database Warning", "", report.db_warning])

    lines.extend(["", "## Known Limitations", ""])
    lines.extend(f"- {item}" for item in known_limitations())
    return "\n".join(lines).rstrip() + "\n"


def write_markdown_report(report: EvalRunReport, path: Path | str) -> Path:
    output = Path(path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(render_markdown_report(report), encoding="utf-8", newline="\n")
    return output


def known_limitations() -> list[str]:
    return [
        "Offline fixtures reflect recorded runs only.",
        "No LLM-as-judge in this version.",
        "Metrics are smoke-level, not production benchmark.",
        "A final report event is accepted as a terminal indicator for current project fixtures.",
        "Tool-call success is null when the recorded SSE event does not expose success/status.",
    ]


def event_type(payload: dict[str, Any]) -> str:
    return normalize_id(payload.get("type"))


def payload_data(payload: dict[str, Any]) -> dict[str, Any]:
    data = payload.get("data")
    return data if isinstance(data, dict) else {}


def normalize_id(value: Any) -> str:
    return str(value or "").strip().lower()


def normalize_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip().lower()


def format_metric(value: float | int | None) -> str:
    if value is None:
        return "null"
    if isinstance(value, int):
        return str(value)
    return f"{value:.4f}".rstrip("0").rstrip(".")


def format_bool(value: bool | None) -> str:
    if value is None:
        return "null"
    return "true" if value else "false"


def _read_json_file(path: Path) -> dict[str, Any]:
    try:
        with path.open("r", encoding="utf-8-sig") as f:
            data = json.load(f)
    except FileNotFoundError as exc:
        raise ValueError(f"fixture file not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid JSON in {path}: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError(f"fixture JSON must be an object: {path}")
    return data


def _coerce_fixture_record(item: FixtureRecord | tuple[str, dict[str, Any]]) -> FixtureRecord:
    if isinstance(item, FixtureRecord):
        return item
    label, data = item
    return FixtureRecord(path=Path(label), data=data, fixture_id=Path(label).stem)


def _display_fixture_name(record: FixtureRecord) -> str:
    return record.path.name if record.path.name else str(record.path)


def _bool_rate(values: list[bool]) -> float | None:
    if not values:
        return None
    return sum(1 for value in values if value) / len(values)


def _rate(numerator: int, denominator: int) -> float | None:
    if denominator <= 0:
        return None
    return numerator / denominator


def _str_or_none(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _int_or_none(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _float_or_none(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _md_cell(value: Any) -> str:
    return str(value).replace("|", "\\|").replace("\n", " ")

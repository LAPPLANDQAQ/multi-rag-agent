"""Regression coverage for the malformed line breaks seen in real report runs."""

import re

import pytest

from app.agents.replanner import _ensure_report_time, _force_summary
from app.services.aiops_service import _convert_node_event
from app.utils.report import normalize_report_markdown


REPORT = """# 故障诊断报告
**生成时间**: old

## 一、问题概述
- 现象: 公共网站访问超时。

## 二、根因分析
尚不能确认根因。

## 三、关键证据
1. DNS 正常。
2. HTTPS 检查超时。

## 四、处置建议
### 紧急止损
1. 复核公共网站状态。

### 长期优化
1. 增加可用性监测。

## 五、结论
保留全部证据，等待进一步核实。
"""


@pytest.mark.parametrize("separator", ["\n", r"\n", r"\\n", "[n]", r"\\[n]", r"\\[换行]", "<br>"])
def test_report_format_and_evidence_survive_timestamp_update(separator):
    report = REPORT.replace("\n", separator)
    result = _ensure_report_time(report, "2026-10-17 18:00:00 CST")

    assert "保留全部证据" in result
    assert len(re.findall(r"^## ", result, flags=re.MULTILINE)) == 5
    assert result.count("**生成时间**:") == 1
    assert "**生成时间**: 2026-10-17 18:00:00 CST" in result
    assert "[n]" not in result
    assert "[换行]" not in result


def test_timestamp_update_does_not_consume_escaped_body_on_same_line():
    report = "# 故障诊断报告\n**生成时间**: old" + r"\n\n## 一、问题概述\n保留全部证据"
    result = _ensure_report_time(report, "now")
    assert "保留全部证据" in result
    assert "## 一、问题概述\n保留全部证据" in result


@pytest.mark.parametrize("title", ["## 故障诊断报告", "# 故障诊断报告\n\n## 故障诊断报告"])
def test_model_title_uses_one_top_level_heading(title):
    result = _ensure_report_time(REPORT.replace("# 故障诊断报告", title, 1), "now")
    assert result.count("故障诊断报告") == 1
    assert result.startswith("# 故障诊断报告\n**生成时间**: now")
    assert len(re.findall(r"^## ", result, flags=re.MULTILINE)) == 5


def test_report_keeps_literal_escapes_inside_code():
    report = REPORT + '\n```python\nprint("\\n")\n```\n\n路径：`C:\\new\\tools`。'
    result = _ensure_report_time(report, "now")
    assert 'print("\\n")' in result
    assert '`C:\\new\\tools`' in result


def test_report_keeps_unquoted_windows_paths_next_to_encoded_breaks():
    path = r"C:\new\nginx\access.log"
    report = r"# 报告\n日志路径 " + path + r"\n\n## 五、结论\n保留证据"
    result = normalize_report_markdown(report)
    assert path in result
    assert "\n\n## 五、结论\n保留证据" in result


@pytest.mark.parametrize("separator", [r"\n", r"\\n", "[n]", r"\[n]", r"\\[换行]", "<br>"])
def test_encoded_fenced_code_restores_structure_and_preserves_string_escapes(separator):
    report = '# 报告\n\n```python\nif True:\n    print("\\n")\n    path = "C:\\new\\tools"\n```\n\n## 五、结论\n保留证据'
    assert normalize_report_markdown(report.replace("\n", separator)) == report


@pytest.mark.asyncio
@pytest.mark.parametrize("node", ["replanner", "fork_skill"])
async def test_sse_report_boundary_emits_normal_markdown(node):
    events = [event async for event in _convert_node_event(node, {"response": REPORT.replace("\n", r"\\[n]")})]
    report = next(event["data"]["report"] for event in events if event["type"] == "report")
    assert len(re.findall(r"^## ", report, flags=re.MULTILINE)) == 5
    assert "保留全部证据" in report


@pytest.mark.parametrize("query", ["公共网站访问超时", "The public website is timing out"])
@pytest.mark.parametrize("steps", [[], [("检查 DNS", "解析正常，但仍需复核 HTTPS。")]])
def test_fallback_reports_use_the_same_five_sections(query, steps):
    report = _force_summary(query, steps, "now")
    assert len(re.findall(r"^## ", report, flags=re.MULTILINE)) == 5
    assert query in report
    assert "人工" in report

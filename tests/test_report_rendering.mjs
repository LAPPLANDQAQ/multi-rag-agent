import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeReportMarkdown, renderReportMarkdown } from "../frontend/js/core/report.js";

const report = `# 故障诊断报告
**生成时间**: 2026-10-17

## 一、问题概述
- 现象: 公共网站访问超时。

## 二、根因分析
尚不能确认根因。

## 三、关键证据
1. DNS 正常。
2. HTTPS 超时。

## 四、处置建议
### 紧急止损
1. 复核公共网站。

### 长期优化
1. 增加可用性监测。

## 五、结论
保留全部证据。
`;

for (const separator of ["\n", "\\n", "\\\\n", "[n]", "\\\\[n]", "\\\\[换行]", "<br>"]) {
    test(`Chinese and English report encodings share one format: ${JSON.stringify(separator)}`, () => {
        const html = renderReportMarkdown(report.replaceAll("\n", separator));
        assert.equal(html, renderReportMarkdown(report));
        assert.equal((html.match(/<h2>/g) || []).length, 5);
        assert.match(html, /<ol>/);
        assert.match(html, /<ul>/);
        assert.match(html, /保留全部证据/);
        assert.doesNotMatch(html, /\[n\]|\[换行\]|<p><h[123]/);
    });
}

test("normalization preserves literal escapes in commands and Windows paths", () => {
    const code = '\n```python\nprint("\\n")\n```\n\n路径：`C:\\new\\tools`。';
    const normalized = normalizeReportMarkdown(report + code);
    assert.ok(normalized.includes('print("\\n")'));
    assert.ok(normalized.includes('`C:\\new\\tools`'));
    assert.match(renderReportMarkdown(normalized), /<pre><code class="language-python">/);
});

test("unquoted Windows paths survive next to encoded report line breaks", () => {
    const path = String.raw`C:\new\nginx\access.log`;
    const normalized = normalizeReportMarkdown("# 报告\\n日志路径 " + path + "\\n\\n## 五、结论\\n保留证据");
    assert.ok(normalized.includes(path));
    assert.ok(normalized.includes("\n\n## 五、结论\n保留证据"));
});

for (const separator of ["\\n", "\\\\n", "[n]", "\\[n]", "\\\\[换行]", "<br>"]) {
    test(`encoded code fences keep structure and string escapes: ${JSON.stringify(separator)}`, () => {
        const source = '# 报告\n\n```python\nif True:\n    print("\\n")\n    path = "C:\\new\\tools"\n```\n\n## 五、结论\n保留证据';
        const encoded = source.replaceAll("\n", separator);
        assert.equal(normalizeReportMarkdown(encoded), source);
        assert.equal(renderReportMarkdown(encoded), renderReportMarkdown(source));
        assert.match(renderReportMarkdown(encoded), /<pre><code class="language-python">/);
    });
}

test("legacy bracket headings and duplicate metadata render normally", () => {
    const legacy = report.replace(/^## (.+)$/gm, "[$1]")
        .replace("**生成时间**: 2026-10-17", "**生成时间**: 2026-10-17\n**生成时间**: 2026-10-17");
    const normalized = normalizeReportMarkdown(legacy);
    assert.equal((normalized.match(/生成时间/g) || []).length, 1);
    assert.equal((renderReportMarkdown(normalized).match(/<h2>/g) || []).length, 5);
});

test("reports promote or deduplicate model report titles", () => {
    for (const title of ["## 故障诊断报告", "# 故障诊断报告\n\n## 故障诊断报告"]) {
        const html = renderReportMarkdown(report.replace("# 故障诊断报告", title));
        assert.equal((html.match(/<h1>/g) || []).length, 1);
        assert.equal((html.match(/<h2>/g) || []).length, 5);
        assert.equal((html.match(/故障诊断报告/g) || []).length, 1);
    }
});

test("reports render tables and keep untrusted HTML inert", () => {
    const html = renderReportMarkdown('| 项目 | 状态 |\n| --- | --- |\n| DNS | 正常 |\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))');
    assert.match(html, /<table>/);
    assert.doesNotMatch(html, /<script>|href="javascript:/);
    assert.match(html, /&lt;script&gt;/);
});

test("Markdown wrapper fences do not turn the entire report into code", () => {
    assert.equal(renderReportMarkdown('```markdown\n' + report + '```'), renderReportMarkdown(report));
});

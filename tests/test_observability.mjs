import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePrometheusText, summarizeDiagnosisMetrics } from "../frontend/js/modules/metrics.js";

test("diagnosis cards aggregate real backend series and unlabelled samples", () => {
    const metrics = parsePrometheusText([
        "# TYPE aiops_runs_total counter",
        'aiops_runs_total{status="success"} 3.0',
        'aiops_runs_total{status="error"} 1.0',
        "aiops_run_duration_seconds_count 4.0",
        "aiops_run_duration_seconds_sum 9.0e+1",
        "aiops_tool_calls_total 12.0",
    ].join("\r\n"));

    assert.deepEqual(summarizeDiagnosisMetrics(metrics), {
        diagnoses: 4,
        successes: 3,
        average_duration_seconds: 22.5,
        tool_calls: 12,
    });
});

test("a freshly started service has zero counters and no invented duration", () => {
    const metrics = parsePrometheusText([
        "# TYPE aiops_runs_total counter",
        "aiops_run_duration_seconds_count 0.0",
        "aiops_run_duration_seconds_sum 0.0",
        "aiops_tool_calls_total 0.0",
    ].join("\n"));

    assert.deepEqual(summarizeDiagnosisMetrics(metrics), {
        diagnoses: 0,
        successes: 0,
        average_duration_seconds: null,
        tool_calls: 0,
    });
});

test("an absent metric stays unavailable rather than becoming a false zero", () => {
    assert.deepEqual(summarizeDiagnosisMetrics(parsePrometheusText("# HELP unrelated a metric")), {
        diagnoses: null,
        successes: null,
        average_duration_seconds: null,
        tool_calls: null,
    });
});

test("Prometheus labels retain escaped quotes and embedded commas", () => {
    const metrics = parsePrometheusText('sample_metric{status="success",description="a,b\\\"c"} 2.5e+1 1720000000000');
    assert.equal(metrics.sample_metric[0].labels.description, 'a,b"c');
    assert.equal(metrics.sample_metric[0].value, 25);
});

test("alert HTTP failures display an error instead of an empty history", async () => {
    const list = { innerHTML: "" };
    const originalDocument = globalThis.document;
    const originalFetch = globalThis.fetch;
    globalThis.document = { getElementById: id => id === "webhook-list" ? list : null };
    globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({ detail: "unavailable" }) });
    try {
        const { initWebhook } = await import("../frontend/js/modules/webhook.js?http-error-test");
        initWebhook();
        await new Promise(resolve => setImmediate(resolve));
        assert.match(list.innerHTML, /HTTP 503/);
        assert.doesNotMatch(list.innerHTML, /暂无/);
    } finally {
        globalThis.document = originalDocument;
        globalThis.fetch = originalFetch;
    }
});

test("an empty alert history explains the Alertmanager source", async () => {
    const list = { innerHTML: "" };
    const originalDocument = globalThis.document;
    const originalFetch = globalThis.fetch;
    globalThis.document = { getElementById: id => id === "webhook-list" ? list : null };
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ count: 0, items: [] }) });
    try {
        const { initWebhook } = await import("../frontend/js/modules/webhook.js?empty-history-test");
        initWebhook();
        await new Promise(resolve => setImmediate(resolve));
        assert.match(list.innerHTML, /Alertmanager 自动诊断/);
        assert.match(list.innerHTML, /手动诊断/);
        assert.doesNotMatch(list.innerHTML, /加载失败/);
    } finally {
        globalThis.document = originalDocument;
        globalThis.fetch = originalFetch;
    }
});

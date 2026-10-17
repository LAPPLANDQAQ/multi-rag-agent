// Prometheus 指标页 — 解析 /metrics 展示卡片 + 迷你折线
import { escapeHtml } from "../core/markdown.js";

const METRICS_INTERVAL_MS = 15000;
let metricsTimer = null;
let history = []; // 最近 30 次轮询的数据点

// 对齐后端实际采集的指标；所有累计值均从本次服务启动开始计算。
const KEY_METRICS = [
    { name: "diagnoses",                label: "总诊断数",       format: "int" },
    { name: "successes",                label: "成功诊断数",     format: "int" },
    { name: "average_duration_seconds", label: "平均诊断耗时",   format: "seconds" },
    { name: "tool_calls",               label: "工具调用数",     format: "int" },
];

async function fetchAndRender() {
    const gridEl = document.getElementById("metrics-cards");
    const chartEl = document.getElementById("metrics-charts");
    if (!gridEl) return;

    try {
        const resp = await fetch("/metrics");
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const text = await resp.text();
        const values = summarizeDiagnosisMetrics(parsePrometheusText(text));
        renderCards(gridEl, values);
        recordHistory(values);
        renderMiniCharts(chartEl);
    } catch (e) {
        gridEl.innerHTML = `<div class="ink-warning" style="grid-column:1/-1">指标不可用: ${escapeHtml(e.message)}</div>`;
    }
}

export function parsePrometheusText(text) {
    const result = Object.create(null);
    const lines = text.split("\n");
    for (const rawLine of lines) {
        const line = rawLine.trim();
        // 有标签的 Counter 在首次调用前只有 TYPE 声明，此时真实计数为 0。
        const type = line.match(/^# TYPE ([a-zA-Z_:][a-zA-Z0-9_:]*)\s+(counter|gauge|histogram|summary)\s*$/);
        if (type) {
            if (!result[type[1]]) result[type[1]] = [];
            continue;
        }
        if (!line || line.startsWith("#")) continue;
        const m = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{(.*)\})?\s+(\S+)(?:\s+\d+)?$/);
        if (m) {
            const name = m[1];
            const labelsStr = m[2] || "";
            const value = Number(m[3]);
            const labels = {};
            for (const label of labelsStr.matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)="((?:\\.|[^"\\])*)"/g)) {
                labels[label[1]] = label[2].replace(/\\(n|"|\\)/g, (_, ch) => ch === "n" ? "\n" : ch);
            }
            if (!result[name]) result[name] = [];
            result[name].push({ labels, value });
        }
    }
    return result;
}

function sumMetric(parsed, name, matches = () => true) {
    const entries = parsed[name];
    if (!entries) return null;
    const selected = entries.filter(matches);
    if (selected.some(entry => !Number.isFinite(entry.value))) return null;
    return selected.reduce((total, entry) => total + entry.value, 0);
}

export function summarizeDiagnosisMetrics(parsed) {
    const durationCount = sumMetric(parsed, "aiops_run_duration_seconds_count");
    const durationSum = sumMetric(parsed, "aiops_run_duration_seconds_sum");
    return {
        diagnoses: sumMetric(parsed, "aiops_runs_total"),
        successes: sumMetric(parsed, "aiops_runs_total", entry => entry.labels.status === "success"),
        average_duration_seconds: durationCount > 0 && durationSum != null ? durationSum / durationCount : null,
        tool_calls: sumMetric(parsed, "aiops_tool_calls_total"),
    };
}

function renderCards(gridEl, values) {
    gridEl.innerHTML = "";
    KEY_METRICS.forEach(m => {
        const val = values[m.name];
        const display = formatMetricValue(val, m.format);
        const card = document.createElement("div");
        card.className = "ink-metric";
        card.innerHTML = `
            <div class="ink-metric-label">${escapeHtml(m.label)}</div>
            <div class="ink-metric-value">${escapeHtml(display)}</div>
        `;
        gridEl.appendChild(card);
    });
}

function formatMetricValue(value, format) {
    if (value == null || !Number.isFinite(value)) return "—";
    if (format === "seconds") return `${value.toFixed(3)}s`;
    if (format === "int") return String(Math.round(value));
    return String(value);
}

function recordHistory(values) {
    const point = { ts: Date.now() };
    KEY_METRICS.forEach(m => {
        point[m.name] = values[m.name] ?? null;
    });
    history.push(point);
    if (history.length > 30) history.shift();
}

function renderMiniCharts(chartEl) {
    if (!chartEl) return;
    if (history.length < 2) {
        chartEl.innerHTML = '<div class="ink-empty">趋势会在下一次采样后显示（约 15 秒）。</div>';
        return;
    }

    const names = KEY_METRICS.map(m => m.name).filter(n => history.some(p => p[n] != null));
    if (!names.length) return;

    chartEl.innerHTML = "";
    names.forEach(name => {
        const points = history.map(p => p[name] ?? null);
        const valid = points.filter(p => p != null);
        if (valid.length < 2) return;

        const meta = KEY_METRICS.find(m => m.name === name);
        const label = meta ? meta.label : name;
        const min = Math.min(...valid);
        const max = Math.max(...valid);
        const range = max - min || 1;
        const w = 240, h = 48, pad = 6;

        const pts = points.map((v, i) => {
            if (v == null) return null;
            const x = pad + (i / Math.max(1, points.length - 1)) * (w - pad * 2);
            const y = h - pad - ((v - min) / range) * (h - pad * 2);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        }).filter(Boolean);

        const wrap = document.createElement("div");
        wrap.style.cssText = "margin-bottom:10px";
        wrap.innerHTML = `
            <div style="font-size:11px;color:var(--ink-muted);margin-bottom:2px">${escapeHtml(label)}</div>
            <svg width="${w}" height="${h}" style="background:var(--ink-surface-2);border:1px solid var(--ink-border);border-radius:4px">
                <polyline points="${pts.join(" ")}" fill="none" stroke="var(--ink-accent)" stroke-width="1.5" stroke-linejoin="round"/>
            </svg>
        `;
        chartEl.appendChild(wrap);
    });
}

export function initMetrics() {
    fetchAndRender();
    if (metricsTimer) clearInterval(metricsTimer);
    metricsTimer = setInterval(fetchAndRender, METRICS_INTERVAL_MS);
}

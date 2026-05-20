// Prometheus 指标页 — 解析 /metrics 展示卡片 + 迷你折线
import { escapeHtml } from "../core/markdown.js";

const METRICS_INTERVAL_MS = 15000;
let metricsTimer = null;
let history = []; // 最近 30 次轮询的数据点

// 需要展示的 Prometheus metric 名
const KEY_METRICS = [
    { name: "aiops_diagnoses_total",        label: "总诊断数",       format: "int" },
    { name: "aiops_success_total",          label: "成功诊断数",     format: "int" },
    { name: "aiops_duration_seconds",       label: "诊断耗时(P95)",  format: "seconds", quantile: "0.95" },
    { name: "aiops_tokens_total",           label: "累计 Tokens",    format: "int" },
];

async function fetchAndRender() {
    const gridEl = document.getElementById("metrics-cards");
    const chartEl = document.getElementById("metrics-charts");
    if (!gridEl) return;

    try {
        const resp = await fetch("/metrics");
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const text = await resp.text();
        const parsed = parsePrometheusText(text);
        renderCards(gridEl, parsed);
        recordHistory(parsed);
        renderMiniCharts(chartEl);
    } catch (e) {
        gridEl.innerHTML = `<div class="ink-warning" style="grid-column:1/-1">指标不可用: ${escapeHtml(e.message)}</div>`;
    }
}

function parsePrometheusText(text) {
    // 简易 Prometheus text 解析器
    const result = {};
    const lines = text.split("\n");
    for (const line of lines) {
        if (!line || line.startsWith("#")) continue;
        const m = line.match(/^(\w+)\{([^}]*)\}\s+([\d.eE+-]+)(?:\s+\d+)?$/);
        if (m) {
            const name = m[1];
            const labelsStr = m[2];
            const value = parseFloat(m[3]);
            const labels = {};
            labelsStr.split(",").forEach(pair => {
                const eq = pair.indexOf("=");
                if (eq > 0) {
                    labels[pair.slice(0, eq).trim()] = pair.slice(eq + 1).replace(/^"|"$/g, "");
                }
            });
            if (!result[name]) result[name] = [];
            result[name].push({ labels, value });
        }
    }
    return result;
}

function getMetricValue(parsed, name, quantile) {
    const entries = parsed[name] || [];
    if (quantile) {
        const match = entries.find(e => e.labels.quantile === quantile);
        return match ? match.value : null;
    }
    // 取第一个 (通常 counter/gauge 只有一条)
    return entries.length ? entries[0].value : null;
}

function renderCards(gridEl, parsed) {
    gridEl.innerHTML = "";
    KEY_METRICS.forEach(m => {
        const val = getMetricValue(parsed, m.name, m.quantile);
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

function recordHistory(parsed) {
    const point = { ts: Date.now() };
    KEY_METRICS.forEach(m => {
        point[m.name] = getMetricValue(parsed, m.name, m.quantile) ?? null;
    });
    history.push(point);
    if (history.length > 30) history.shift();
}

function renderMiniCharts(chartEl) {
    if (!chartEl || history.length < 2) return;

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

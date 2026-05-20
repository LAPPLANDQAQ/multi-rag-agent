// AIOps 诊断 + 离线录制/回放 + 报告导出 — 从原 app.js:124-1013 搬迁
import { API, OFFLINE_MANIFEST_URL, LOCAL_RECORDING_KEY } from "../core/api.js";
import { consumeSSE } from "../core/sse.js";
import { escapeHtml, renderMarkdown } from "../core/markdown.js";
import { highlightSkill, clearSkillHighlight } from "./skills.js";

// ---------- 全局状态 ----------
let aiopsAbortController = null;
let offlineReplayController = null;
let activeSseRecording = null;
let latestRealRecording = null;
let offlineFixtureSources = [];
let offlineFixtureAvailable = false;
let selectedDemoScenarioId = "manual";
const aiopsReportState = {
    input: "",
    selectedSkill: "",
    source: "live",
    generatedAt: "",
    reportMarkdown: "",
};

const DEMO_PROMPTS = {
    "local-resource": "My computer is very slow. Please check whether CPU, memory, or disk usage is abnormal.",
    "docker-container": "A Docker container keeps restarting. Please diagnose the container status, logs, and likely reason.",
    "network-timeout": "The public API https://example.com is timing out from this machine. Please diagnose DNS, TCP port, and HTTP layer.",
};

// ---------- 监控面板状态 ----------
const aiopsMonitor = {
    startTs: 0,
    timer: null,
    toolCount: 0,
    toolFail: 0,
    tokenCount: 0,
    realInputTokens: 0,
    realOutputTokens: 0,
    realTotalTokens: 0,
    cacheHitTokens: 0,
    cacheMissTokens: 0,
    hasRealUsage: false,
    reset() {
        this.startTs = Date.now();
        this.toolCount = 0;
        this.toolFail = 0;
        this.tokenCount = 0;
        this.realInputTokens = 0;
        this.realOutputTokens = 0;
        this.realTotalTokens = 0;
        this.cacheHitTokens = 0;
        this.cacheMissTokens = 0;
        this.hasRealUsage = false;
        setText("mon-step", "—");
        setText("mon-step-label", "Skill Router 工作中...");
        setText("mon-elapsed", "0.0s");
        setText("mon-tools", "0");
        setText("mon-tools-fail", "失败 0");
        setText("mon-tokens", "0");
        setText("mon-tokens-detail", "输入 0 · 输出 0");
        setText("mon-tokens-badge", "~估算");
        setText("mon-stream-hint", "等待中");
        const monStream = document.getElementById("mon-stream");
        if (monStream) monStream.innerHTML =
            '<span class="ink-muted italic">诊断开始后, 模型生成的文本会实时显示在此...</span>';
        const toolFeed = document.getElementById("mon-tool-feed");
        if (toolFeed) toolFeed.innerHTML =
            '<span class="ink-muted italic">暂无工具调用</span>';
        if (this.timer) clearInterval(this.timer);
        this.timer = setInterval(() => {
            const s = ((Date.now() - this.startTs) / 1000).toFixed(1);
            setText("mon-elapsed", `${s}s`);
        }, 100);
    },
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    },
};

// ---------- 工具函数 ----------
function setText(id, v) {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
}

function resetAiopsReportState({ input = "", source = "live" } = {}) {
    aiopsReportState.input = input;
    aiopsReportState.selectedSkill = "";
    aiopsReportState.source = source;
    aiopsReportState.generatedAt = "";
    aiopsReportState.reportMarkdown = "";
    updateExportMarkdownButton();
}

function normalizeReportMarkdown(md) {
    return String(md || "").replace(/\\n/g, "\n").replace(/\\t/g, "\t").trim();
}

function setAiopsReportMarkdown(md) {
    aiopsReportState.reportMarkdown = normalizeReportMarkdown(md);
    aiopsReportState.generatedAt = new Date().toISOString();
    updateExportMarkdownButton();
    return aiopsReportState.reportMarkdown;
}

function updateExportMarkdownButton() {
    const hasReport = aiopsReportState.reportMarkdown.trim().length > 0;
    // 离线工具栏中的按钮
    const btn = document.getElementById("aiops-export-markdown");
    if (btn) {
        btn.disabled = !hasReport;
        btn.title = hasReport
            ? "Download the displayed diagnosis report as Markdown"
            : "Generate a diagnosis report before exporting";
    }
    // 报告内嵌按钮
    const inlineBtn = document.getElementById("aiops-export-markdown-report");
    if (inlineBtn) {
        inlineBtn.disabled = !hasReport;
        inlineBtn.title = btn ? btn.title : "";
    }
    // 报告操作栏显隐
    const actionsBar = document.getElementById("aiops-report-actions-bar");
    if (actionsBar) actionsBar.classList.toggle("hidden", !hasReport);
    // 旧版占位 (保留兼容)
    const actions = document.getElementById("aiops-report-actions");
    if (actions) actions.classList.toggle("hidden", !hasReport);
}

function buildMarkdownExport() {
    const exportedAt = new Date().toISOString();
    const lines = [
        "# AIOps Diagnosis Report",
        "",
        "## Export Metadata",
        `- Exported at: ${exportedAt}`,
        `- Report generated at: ${aiopsReportState.generatedAt || "Unavailable"}`,
        `- Source: ${aiopsReportState.source || "live"}`,
        `- Selected Skill: ${aiopsReportState.selectedSkill || "Unavailable"}`,
        "",
        "## Scenario Input",
        "",
        aiopsReportState.input || "Unavailable",
        "",
        "## Final Report",
        "",
        aiopsReportState.reportMarkdown,
    ];
    return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

function markdownExportFilename() {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const skill = (aiopsReportState.selectedSkill || "aiops")
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "aiops";
    return `aiops-report-${skill}-${ts}.md`;
}

function downloadMarkdownReport() {
    if (!aiopsReportState.reportMarkdown.trim()) return;
    const blob = new Blob([buildMarkdownExport()], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = markdownExportFilename();
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

function showAiopsReport() {
    const mon = document.getElementById("aiops-monitor");
    const rep = document.getElementById("aiops-report");
    if (mon) mon.classList.add("hidden");
    if (rep) rep.classList.remove("hidden");
    updateExportMarkdownButton();
    // 显示报告内嵌操作栏
    const actionsBar = document.getElementById("aiops-report-actions-bar");
    if (actionsBar) actionsBar.classList.toggle("hidden", !aiopsReportState.reportMarkdown.trim());
    setText("aiops-report-source", aiopsReportState.source === "offline-recorded-demo"
        ? "来源: 离线录制回放" : "来源: 在线实时诊断");
    setText("aiops-right-title", "诊断报告");
    setText("aiops-report-title", "诊断报告");
}

function showAiopsMonitor() {
    const mon = document.getElementById("aiops-monitor");
    const rep = document.getElementById("aiops-report");
    if (mon) mon.classList.remove("hidden");
    if (rep) rep.classList.add("hidden");
    const actionsBar = document.getElementById("aiops-report-actions-bar");
    if (actionsBar) actionsBar.classList.add("hidden");
    setText("aiops-right-title", "诊断监控");
}

function getAiopsElements() {
    return {
        planEl: document.getElementById("aiops-plan"),
        stepsEl: document.getElementById("aiops-steps"),
        reportEl: document.getElementById("aiops-report"),
        statusEl: document.getElementById("aiops-status"),
    };
}

function resetAiopsUi(statusText) {
    const els = getAiopsElements();
    if (els.planEl) els.planEl.innerHTML = '<span class="ink-muted italic">等待 Planner...</span>';
    if (els.stepsEl) els.stepsEl.innerHTML = "";
    // 只清报告正文,不破坏 #aiops-report-body / #aiops-report-actions-bar 结构
    const reportBody = document.getElementById("aiops-report-body");
    if (reportBody) reportBody.innerHTML = "";
    showAiopsMonitor();
    aiopsMonitor.reset();
    if (els.statusEl) els.statusEl.textContent = statusText;
    clearSkillHighlight();
    return els;
}

// ---------- 主诊断入口 ----------
async function startAiops() {
    const query = document.getElementById("aiops-query").value.trim();
    if (!query) return alert("请输入告警内容");

    const { planEl, stepsEl, reportEl, statusEl } = resetAiopsUi("Skill Router 工作中...");
    resetAiopsReportState({ input: query, source: "live" });
    const shouldRecord = document.getElementById("aiops-record-stream")?.checked === true;
    if (shouldRecord) {
        beginSseRecording({
            input: query,
            scenarioId: selectedDemoScenarioId || "manual",
        });
    } else {
        activeSseRecording = null;
        setText("aiops-record-status", "Recording disabled. Enable Record stream before a live run to capture a fixture.");
    }

    document.getElementById("aiops-start").disabled = true;
    document.getElementById("aiops-stop").disabled = false;

    aiopsAbortController = new AbortController();
    let streamCompleted = false;
    try {
        const resp = await fetch(`${API}/aiops/diagnose`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_id: `web-${Date.now()}`, query }),
            signal: aiopsAbortController.signal,
        });
        await consumeSSE(resp, (ev, envelope) => {
            recordIncomingSseEvent(envelope);
            if (ev && typeof ev === "object") {
                handleAiopsEvent(ev, planEl, stepsEl, reportEl, statusEl);
            }
        });
        streamCompleted = true;
        if (statusEl) statusEl.textContent = "完成 ✓";
    } catch (e) {
        if (e.name === "AbortError") {
            if (statusEl) statusEl.textContent = "已停止";
        } else {
            if (statusEl) statusEl.textContent = "失败 ✗";
            showAiopsReport();
            const body = document.getElementById("aiops-report-body");
            if (body) body.innerHTML = `<p style="color:var(--ink-error)">错误: ${e.message}</p>`;
        }
    } finally {
        if (activeSseRecording) {
            finalizeSseRecording({ completed: streamCompleted });
        }
        document.getElementById("aiops-start").disabled = false;
        document.getElementById("aiops-stop").disabled = true;
        aiopsAbortController = null;
        aiopsMonitor.stop();
    }
}

// ---------- Offline Demo ----------
function toggleOfflineDemoBanner() {
    const banner = document.getElementById("offline-demo-banner");
    if (!banner) return;
    const source = getSelectedOfflineSource();
    if (source?.metadata) {
        setOfflineDemoBanner(source.metadata);
    }
    banner.classList.toggle("hidden");
}

async function loadOfflineFixtureStatus() {
    const statusEl = document.getElementById("offline-replay-status");
    const replayBtn = document.getElementById("offline-replay-start");
    if (!statusEl || !replayBtn) return;

    statusEl.textContent = "Checking recorded fixtures...";
    const sources = [];
    const localFixture = readLocalRecording();
    if (localFixture) {
        sources.push({
            id: "local-latest",
            title: "Latest local real recording",
            kind: "localStorage",
            fixture: localFixture,
            metadata: localFixture.metadata || {},
            eventCount: Number(localFixture.metadata?.event_count) || normalizeOfflineEvents(localFixture).length,
        });
    }

    try {
        const resp = await fetch(OFFLINE_MANIFEST_URL, { cache: "no-store" });
        if (resp.ok) {
            const manifest = await resp.json();
            const fixtures = Array.isArray(manifest?.fixtures) ? manifest.fixtures : [];
            fixtures.forEach((entry) => {
                const normalized = normalizeManifestFixture(entry);
                if (normalized) sources.push(normalized);
            });
        } else if (resp.status !== 404) {
            console.warn("[offline demo] manifest unavailable:", resp.status);
        }
    } catch (e) {
        console.warn("[offline demo] manifest load failed:", e);
    }

    offlineFixtureSources = sources;
    window._offlineFixtureSources = sources;
    renderOfflineFixtureSelect();
    updateOfflineFixtureStatus();
    updateDownloadFixtureButton();
}

function normalizeOfflineEvents(fixture) {
    const rawEvents = Array.isArray(fixture) ? fixture : (fixture?.events || []);
    return rawEvents.map((item, index) => {
        if (!item || typeof item !== "object") return null;
        if (item.type) {
            return {
                event: "message",
                data: item,
                timestamp: item.timestamp || "",
                offset_ms: Number.isFinite(Number(item.offset_ms)) ? Number(item.offset_ms) : 0,
                index,
            };
        }
        if (Object.prototype.hasOwnProperty.call(item, "data")) {
            let data = item.data;
            if (typeof data === "string") {
                try {
                    data = JSON.parse(data);
                } catch {
                    // Keep raw SSE data strings.
                }
            }
            return {
                event: item.event || "message",
                data,
                timestamp: item.timestamp || "",
                offset_ms: Number.isFinite(Number(item.offset_ms)) ? Number(item.offset_ms) : 0,
                index,
            };
        }
        return null;
    }).filter(Boolean);
}

function normalizeManifestFixture(entry) {
    if (!entry || typeof entry !== "object") return null;
    const id = String(entry.id || "").trim();
    const path = String(entry.path || (id ? `${id}.json` : "")).trim();
    if (!id || !path) return null;
    const url = path.startsWith("/") ? path : `/demo_fixtures/${path}`;
    return {
        id,
        title: String(entry.title || id),
        kind: "static",
        url,
        path,
        metadata: {
            recorded_at: entry.recorded_at || "",
            event_count: entry.event_count || 0,
            duration_ms: entry.duration_ms || 0,
        },
        eventCount: Number(entry.event_count) || 0,
    };
}

function readLocalRecording() {
    try {
        const raw = localStorage.getItem(LOCAL_RECORDING_KEY);
        if (!raw) return null;
        const fixture = JSON.parse(raw);
        if (!isRealSseFixture(fixture)) return null;
        return fixture;
    } catch (e) {
        console.warn("[offline demo] local recording is invalid:", e);
        return null;
    }
}

function isRealSseFixture(fixture) {
    const metadata = fixture?.metadata || {};
    const eventCount = Number(metadata.event_count);
    return metadata.source === "real_sse" && eventCount > 0 && normalizeOfflineEvents(fixture).length > 0;
}

function renderOfflineFixtureSelect() {
    const select = document.getElementById("offline-fixture-select");
    if (!select) return;
    select.innerHTML = "";
    if (offlineFixtureSources.length === 0) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "No recorded fixture";
        select.appendChild(option);
        select.disabled = true;
        return;
    }
    offlineFixtureSources.forEach((source) => {
        const option = document.createElement("option");
        option.value = source.id;
        const count = source.eventCount ? ` (${source.eventCount} events)` : "";
        option.textContent = `${source.title}${source.kind === "localStorage" ? " [local]" : ""}${count}`;
        select.appendChild(option);
    });
    select.disabled = false;
}

function getSelectedOfflineSource() {
    const selectedId = document.getElementById("offline-fixture-select")?.value;
    return offlineFixtureSources.find((source) => source.id === selectedId) || offlineFixtureSources[0] || null;
}

function updateOfflineFixtureStatus() {
    const statusEl = document.getElementById("offline-replay-status");
    const replayBtn = document.getElementById("offline-replay-start");
    const source = getSelectedOfflineSource();
    offlineFixtureAvailable = !!source;
    if (!statusEl || !replayBtn) return;
    replayBtn.disabled = !source;
    replayBtn.title = source ? "" : "offline fixture unavailable";
    if (!source) {
        statusEl.textContent = "No real recorded fixture found, playback unavailable / 未找到真实录制 fixture，回放不可用";
        return;
    }
    const recordedAt = source.metadata?.recorded_at || "unknown time";
    const eventCount = source.eventCount || source.metadata?.event_count || "unknown";
    statusEl.textContent = `Ready: ${source.title}, ${eventCount} events, recorded at ${recordedAt}`;
    setOfflineDemoBanner(source.metadata || {});
}

function setOfflineDemoBanner(metadata = {}) {
    const banner = document.getElementById("offline-demo-banner");
    if (!banner) return;
    const recordedAt = metadata.recorded_at || "unavailable";
    banner.textContent = `Offline recorded demo — recorded at ${recordedAt}. Not a live model/tool call.`;
}

async function fetchOfflineFixture(source) {
    if (!source) throw new Error("No offline fixture selected");
    if (source.fixture) return source.fixture;
    const resp = await fetch(source.url, { cache: "no-store" });
    if (!resp.ok) throw new Error(`fixture fetch failed (${resp.status})`);
    const fixture = await resp.json();
    if (!isRealSseFixture(fixture)) {
        throw new Error("fixture is not a real_sse recording or contains no events");
    }
    source.fixture = fixture;
    source.metadata = fixture.metadata || {};
    source.eventCount = Number(source.metadata.event_count) || normalizeOfflineEvents(fixture).length;
    return fixture;
}

function offlineRecordedEventToUiEvent(recordedEvent) {
    const data = recordedEvent?.data;
    if (data && typeof data === "object" && data.type) return data;
    if (typeof data === "string") {
        try {
            const parsed = JSON.parse(data);
            if (parsed && typeof parsed === "object" && parsed.type) return parsed;
        } catch {
            return null;
        }
    }
    return null;
}

// ---------- SSE 录制 ----------
function beginSseRecording({ input, scenarioId }) {
    const recordedAt = new Date().toISOString();
    activeSseRecording = {
        startedAt: recordedAt,
        startedPerf: performance.now(),
        input,
        scenarioId,
        events: [],
    };
    setText("aiops-record-status", "Recording real SSE stream...");
    const btn = document.getElementById("aiops-download-fixture");
    if (btn) btn.disabled = true;
}

function recordIncomingSseEvent(envelope) {
    if (!activeSseRecording || !envelope) return;
    activeSseRecording.events.push({
        event: envelope.event || "message",
        data: cloneJsonish(envelope.data),
        timestamp: new Date().toISOString(),
        offset_ms: Math.max(0, Math.round(performance.now() - activeSseRecording.startedPerf)),
    });
    setText("aiops-record-status", `Recording real SSE stream... ${activeSseRecording.events.length} events captured.`);
}

function finalizeSseRecording({ completed }) {
    const recording = activeSseRecording;
    activeSseRecording = null;
    if (!recording || recording.events.length === 0) {
        setText("aiops-record-status", "Recording ended with no SSE events captured.");
        return;
    }
    if (!completed) {
        setText("aiops-record-status", `Recording stopped before stream completion; ${recording.events.length} events were not saved as a fixture.`);
        return;
    }
    const durationMs = Math.max(0, Math.round(performance.now() - recording.startedPerf));
    const fixture = {
        metadata: {
            schema_version: 1,
            recorded_at: recording.startedAt,
            source: "real_sse",
            scenario_id: recording.scenarioId || "manual",
            input: recording.input || "",
            app_commit: "unknown",
            event_count: recording.events.length,
            duration_ms: durationMs,
        },
        events: recording.events,
    };
    latestRealRecording = fixture;
    try {
        localStorage.setItem(LOCAL_RECORDING_KEY, JSON.stringify(fixture));
        setText("aiops-record-status", `Saved latest real recording locally: ${recording.events.length} events, ${durationMs}ms. Download it for a persistent fixture.`);
    } catch (e) {
        setText("aiops-record-status", `Recording captured but localStorage save failed: ${e.message}. Use Download fixture JSON now.`);
    }
    updateDownloadFixtureButton();
    loadOfflineFixtureStatus();
}

function cloneJsonish(value) {
    if (value == null) return value;
    if (typeof value !== "object") return value;
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return String(value);
    }
}

function updateDownloadFixtureButton() {
    const btn = document.getElementById("aiops-download-fixture");
    if (!btn) return;
    if (!latestRealRecording) latestRealRecording = readLocalRecording();
    btn.disabled = !latestRealRecording;
}

function downloadLatestFixtureJson() {
    if (!latestRealRecording) latestRealRecording = readLocalRecording();
    if (!latestRealRecording) return;
    const json = `${JSON.stringify(latestRealRecording, null, 2)}\n`;
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fixtureDownloadFilename(latestRealRecording);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

function fixtureDownloadFilename(fixture) {
    const metadata = fixture?.metadata || {};
    const scenario = sanitizeFilenamePart(metadata.scenario_id || "manual");
    const ts = sanitizeFilenamePart(metadata.recorded_at || new Date().toISOString());
    return `aiops-sse-fixture-${scenario}-${ts}.json`;
}

function sanitizeFilenamePart(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48) || "recording";
}

// ---------- 回放 ----------
function playbackDelayMs(deltaMs) {
    const speed = document.getElementById("offline-replay-speed")?.value || "1";
    if (speed === "instant") return 0;
    const multiplier = Number(speed) || 1;
    return Math.max(0, Math.round(deltaMs / multiplier));
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startOfflineReplay() {
    const source = getSelectedOfflineSource();
    if (!source) {
        setText("offline-replay-status", "No real recorded fixture found, playback unavailable / 未找到真实录制 fixture，回放不可用");
        return;
    }

    let fixture;
    try {
        fixture = await fetchOfflineFixture(source);
    } catch (e) {
        setText("offline-replay-status", `Playback unavailable: ${e.message}`);
        return;
    }
    const replayEvents = normalizeOfflineEvents(fixture);
    if (replayEvents.length === 0) {
        setText("offline-replay-status", "Selected fixture contains no replayable SSE events.");
        return;
    }
    const metadata = fixture.metadata || {};
    setOfflineDemoBanner(metadata);
    const banner = document.getElementById("offline-demo-banner");
    if (banner) banner.classList.remove("hidden");

    const replayInput = metadata.input || document.getElementById("aiops-query")?.value.trim() || "Offline recorded demo";
    const { planEl, stepsEl, reportEl, statusEl } = resetAiopsUi("Offline recorded playback starting...");
    resetAiopsReportState({ input: replayInput, source: "offline-recorded-demo" });
    offlineReplayController = { stopped: false };
    document.getElementById("aiops-start").disabled = true;
    document.getElementById("aiops-stop").disabled = false;
    document.getElementById("offline-replay-start").disabled = true;
    setText("offline-replay-status", "Replaying offline recorded demo...");

    try {
        let previousOffset = 0;
        for (const recordedEvent of replayEvents) {
            if (offlineReplayController.stopped) break;
            const offset = Math.max(0, Number(recordedEvent.offset_ms) || 0);
            const delay = playbackDelayMs(offset - previousOffset);
            previousOffset = offset;
            if (delay > 0) await sleep(delay);
            const uiEvent = offlineRecordedEventToUiEvent(recordedEvent);
            if (uiEvent) handleAiopsEvent(uiEvent, planEl, stepsEl, reportEl, statusEl);
        }
        if (statusEl) statusEl.textContent = offlineReplayController.stopped ? "Offline playback stopped" : "Offline playback complete";
        setText("offline-replay-status", offlineReplayController.stopped ? "Playback stopped" : "Playback complete");
    } catch (e) {
        if (statusEl) statusEl.textContent = "Offline playback failed";
        showAiopsReport();
        const body = document.getElementById("aiops-report-body");
        if (body) body.innerHTML = `<p style="color:var(--ink-error)">Offline playback error: ${escapeHtml(e.message)}</p>`;
        setText("offline-replay-status", `Playback failed: ${e.message}`);
    } finally {
        document.getElementById("aiops-start").disabled = false;
        document.getElementById("aiops-stop").disabled = true;
        document.getElementById("offline-replay-start").disabled = !offlineFixtureAvailable;
        offlineReplayController = null;
        aiopsMonitor.stop();
    }
}

// ---------- SSE 事件处理 (逐字保留分支逻辑) ----------
function handleAiopsEvent(ev, planEl, stepsEl, reportEl, statusEl) {
    const t = ev.type;
    const d = ev.data || {};
    if (t !== "transition") {
        console.log("[AIOps SSE]", t, d);
    }

    if (t === "start") {
        if (statusEl) statusEl.textContent = "Skill Router 工作中...";
    } else if (t === "skill_selected") {
        highlightSkill(d.skill, d.reason);
        aiopsReportState.selectedSkill = d.skill || "";
        if (statusEl) statusEl.textContent = `已选 Skill: ${d.skill || "(无)"}, Planner 工作中...`;
    } else if (t === "plan") {
        if (planEl) {
            planEl.innerHTML = "";
            (d.plan || []).forEach((step, i) => {
                const div = document.createElement("div");
                div.className = "aiops-plan-step";
                div.innerHTML = `<span class="aiops-plan-num">${i + 1}</span><span class="aiops-plan-text">${escapeHtml(step)}</span>`;
                planEl.appendChild(div);
            });
        }
        if (statusEl) statusEl.textContent = `已生成 ${d.plan.length} 步计划`;
    } else if (t === "step_start") {
        if (stepsEl) {
            let div = stepsEl.querySelector(`[data-step-iter="${d.iteration}"]`);
            if (!div) {
                div = document.createElement("div");
                div.className = "step-item executing";
                div.dataset.stepIter = String(d.iteration);
                div.innerHTML = `<div class="step-head">▶ 步骤 ${escapeHtml(String(d.iteration))}</div>
                    <div class="step-label">${escapeHtml(d.step || "")}</div>
                    <div class="step-stream"></div>`;
                stepsEl.appendChild(div);
            }
            stepsEl.scrollTop = stepsEl.scrollHeight;
        }
        if (statusEl) statusEl.textContent = `正在执行第 ${d.iteration} 步...`;
        setText("mon-step", String(d.iteration));
        setText("mon-step-label", (d.step || "").slice(0, 40));
        setText("mon-stream-hint", "生成中...");
        const stream = document.getElementById("mon-stream");
        if (stream) stream.textContent = "";
    } else if (t === "step_token") {
        const iter = d.iteration || 0;
        const content = d.content || "";
        if (stepsEl) {
            let div = stepsEl.querySelector(`[data-step-iter="${iter}"]`);
            if (!div) {
                div = document.createElement("div");
                div.className = "step-item executing";
                div.dataset.stepIter = String(iter);
                div.innerHTML = `<div class="step-head">▶ 步骤 ${escapeHtml(String(iter))}</div>
                    <div class="step-stream"></div>`;
                stepsEl.appendChild(div);
            }
            const stream = div.querySelector(".step-stream");
            if (stream) {
                stream.textContent += content;
                if (stream.textContent.length > 2000) {
                    stream.textContent = "..." + stream.textContent.slice(-1800);
                }
            }
            stepsEl.scrollTop = stepsEl.scrollHeight;
        }
        const monStream = document.getElementById("mon-stream");
        if (monStream) {
            if (monStream.querySelector(".italic")) monStream.textContent = "";
            monStream.textContent += content;
            if (monStream.textContent.length > 4000) {
                monStream.textContent = "..." + monStream.textContent.slice(-3600);
            }
            monStream.scrollTop = monStream.scrollHeight;
        }
        aiopsMonitor.tokenCount += content.length;
        if (!aiopsMonitor.hasRealUsage) {
            setText("mon-tokens", String(aiopsMonitor.tokenCount));
            setText("mon-tokens-detail", `~流字符 ${aiopsMonitor.tokenCount}`);
        }
    } else if (t === "usage") {
        aiopsMonitor.hasRealUsage = true;
        aiopsMonitor.realInputTokens  += d.input_tokens  || 0;
        aiopsMonitor.realOutputTokens += d.output_tokens || 0;
        aiopsMonitor.realTotalTokens  += d.total_tokens  || 0;
        if (d.cache_hit_tokens != null)  aiopsMonitor.cacheHitTokens  += d.cache_hit_tokens;
        if (d.cache_miss_tokens != null) aiopsMonitor.cacheMissTokens += d.cache_miss_tokens;
        setText("mon-tokens", String(aiopsMonitor.realOutputTokens));
        const parts = [
            `输入 ${aiopsMonitor.realInputTokens}`,
            `输出 ${aiopsMonitor.realOutputTokens}`,
        ];
        if (aiopsMonitor.cacheHitTokens > 0 || aiopsMonitor.cacheMissTokens > 0) {
            parts.push(`缓存命中 ${aiopsMonitor.cacheHitTokens}`);
        }
        const detailEl = document.getElementById("mon-tokens-detail");
        if (detailEl) {
            detailEl.textContent = parts.join(" · ");
            detailEl.title = `合计 ${aiopsMonitor.realTotalTokens} tokens` +
                (d.model ? ` · ${d.model}` : "");
        }
        setText("mon-tokens-badge", "API 实测");
    } else if (t === "tool_call") {
        aiopsMonitor.toolCount += 1;
        const ok = d.success !== false;
        if (!ok) aiopsMonitor.toolFail += 1;
        setText("mon-tools", String(aiopsMonitor.toolCount));
        setText("mon-tools-fail", `失败 ${aiopsMonitor.toolFail}`);
        const feed = document.getElementById("mon-tool-feed");
        if (feed) {
            if (feed.querySelector(".italic")) feed.innerHTML = "";
            const row = document.createElement("div");
            const statusIcon = ok ? "✓" : "✗";
            row.className = `tool-feed-row ${ok ? "is-ok" : "is-fail"}`;
            const elapsed = d.elapsed_ms != null ? `${d.elapsed_ms}ms` : "";
            row.innerHTML = `<span class="tool-status">${statusIcon}</span>
                <span class="tool-name">${escapeHtml(d.name || "?")}</span>
                <span class="tool-elapsed">${escapeHtml(elapsed)}</span>`;
            feed.appendChild(row);
            feed.scrollTop = feed.scrollHeight;
        }
    } else if (t === "step_complete") {
        if (stepsEl) {
            const iter = d.iteration || 0;
            let div = stepsEl.querySelector(`[data-step-iter="${iter}"]`);
            if (!div) {
                div = document.createElement("div");
                div.dataset.stepIter = String(iter);
                stepsEl.appendChild(div);
            }
            div.className = "step-item done";
            div.innerHTML = `<div class="step-head done">✓ 步骤 ${escapeHtml(String(iter))}</div>
                <div class="step-label">${escapeHtml(d.step || "")}</div>
                <div class="step-preview">${escapeHtml((d.result_preview || "").slice(0, 200))}</div>`;
            stepsEl.scrollTop = stepsEl.scrollHeight;
        }
        if (statusEl) statusEl.textContent = `已完成 ${d.iteration} 步`;
    } else if (t === "replan") {
        if (stepsEl) {
            const div = document.createElement("div");
            div.className = "step-item";
            div.innerHTML = `<div class="step-replan">Replanner 调整: 剩余 ${(d.plan || []).length} 步</div>`;
            stepsEl.appendChild(div);
            stepsEl.scrollTop = stepsEl.scrollHeight;
        }
    } else if (t === "report") {
        const reportMarkdown = setAiopsReportMarkdown(d.report || "");
        showAiopsReport();
        const reportBody = document.getElementById("aiops-report-body");
        if (reportBody) reportBody.innerHTML = renderMarkdown(reportMarkdown);
        if (statusEl) statusEl.textContent = "报告已生成";
        setText("mon-stream-hint", "已完成");
    } else if (t === "complete") {
        if (statusEl) statusEl.textContent = "完成 ✓";
    } else if (t === "error") {
        showAiopsReport();
        const reportBody = document.getElementById("aiops-report-body");
        if (reportBody) reportBody.innerHTML = `<p style="color:var(--ink-error)">错误: ${escapeHtml(ev.message)}</p>`;
        if (statusEl) statusEl.textContent = "失败 ✗";
    }
}

// ================ 初始化 ================
let inited = false;

export function initAIOps() {
    if (inited) return;
    inited = true;

    // 主按钮
    document.getElementById("aiops-start")?.addEventListener("click", startAiops);
    document.getElementById("aiops-stop")?.addEventListener("click", () => {
        if (aiopsAbortController) aiopsAbortController.abort();
        if (offlineReplayController) offlineReplayController.stopped = true;
    });

    // Demo prompt 按钮
    document.querySelectorAll("[data-demo-prompt]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const prompt = DEMO_PROMPTS[btn.dataset.demoPrompt] || "";
            const input = document.getElementById("aiops-query");
            selectedDemoScenarioId = btn.dataset.demoPrompt || "manual";
            if (input) {
                input.value = prompt;
                input.focus();
            }
        });
    });
    const aiopsQueryInput = document.getElementById("aiops-query");
    if (aiopsQueryInput) {
        aiopsQueryInput.addEventListener("input", () => {
            selectedDemoScenarioId = "manual";
        });
    }

    // Offline 工具栏
    document.getElementById("offline-demo-toggle")?.addEventListener("click", toggleOfflineDemoBanner);
    document.getElementById("offline-replay-start")?.addEventListener("click", startOfflineReplay);
    document.getElementById("offline-fixture-select")?.addEventListener("change", updateOfflineFixtureStatus);
    document.getElementById("aiops-download-fixture")?.addEventListener("click", downloadLatestFixtureJson);
    document.getElementById("aiops-export-markdown")?.addEventListener("click", downloadMarkdownReport);
    document.getElementById("aiops-export-markdown-report")?.addEventListener("click", downloadMarkdownReport);

    // Offline 折叠区
    const offlineCollapse = document.getElementById("offline-collapse");
    if (offlineCollapse) {
        const head = offlineCollapse.querySelector(".ink-collapse-head");
        if (head) {
            head.addEventListener("click", () => offlineCollapse.classList.toggle("is-open"));
        }
    }

    loadOfflineFixtureStatus();
}

// ============================================================
// Multi-Agent AIOps Platform - Frontend Logic
// ============================================================

const API = "/api/v1";
const OFFLINE_MANIFEST_URL = "/demo_fixtures/manifest.json";
const LOCAL_RECORDING_KEY = "multi_rag_agent.latest_aiops_sse_recording.v1";

// ---------- Tab 切换 ----------
document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("tab-active"));
        document.querySelectorAll(".tab-pane").forEach((p) => p.classList.add("hidden"));
        btn.classList.add("tab-active");
        const tab = btn.dataset.tab;
        document.getElementById(`tab-${tab}`).classList.remove("hidden");
        if (tab === "documents") loadDocs();
        if (tab === "agentops") loadAgentOps();
    });
});

// ---------- 健康检查 ----------
async function checkHealth() {
    try {
        const r = await fetch(`${API}/health/ready`);
        const data = await r.json();
        const ready = data?.data?.status === "ready";
        const milvusOk = data?.data?.dependencies?.milvus?.status === "ok";
        const mcpOk = data?.data?.dependencies?.mcp?.status === "ok";
        const dot = document.getElementById("health-dot");
        const text = document.getElementById("health-text");
        if (ready && mcpOk) {
            dot.className = "w-3 h-3 rounded-full bg-green-400";
            text.textContent = `就绪 · MCP ${data.data.dependencies.mcp.tools_count} 工具`;
        } else if (ready) {
            dot.className = "w-3 h-3 rounded-full bg-yellow-400";
            text.textContent = "就绪 · MCP 未连";
        } else {
            dot.className = "w-3 h-3 rounded-full bg-red-500";
            text.textContent = "Milvus 不可用";
        }
    } catch (e) {
        document.getElementById("health-text").textContent = "服务不可达";
    }
}
checkHealth();
setInterval(checkHealth, 15000);

// ============================================================
// Skill 列表 (页面加载时拉一次, 后续诊断时高亮选中项)
// ============================================================
const RISK_BADGE = {
    low:    { color: "bg-emerald-100 text-emerald-700 border-emerald-200", label: "低风险" },
    medium: { color: "bg-amber-100 text-amber-700 border-amber-200",       label: "中风险" },
    high:   { color: "bg-red-100 text-red-700 border-red-200",             label: "高风险" },
};

async function loadSkills() {
    const listEl = document.getElementById("skill-list");
    const countEl = document.getElementById("skill-count");
    try {
        const r = await fetch(`${API}/skills`);
        const data = await r.json();
        if (data?.code !== "SUCCESS") throw new Error(data?.message || "加载 Skill 失败");
        const skills = data?.data?.skills || [];
        countEl.textContent = `· ${skills.length} 个`;

        if (skills.length === 0) {
            listEl.innerHTML = '<span class="text-slate-400 italic col-span-full">暂无 Skill 注册</span>';
            return;
        }

        listEl.innerHTML = "";
        skills.forEach((s) => {
            const badge = RISK_BADGE[s.risk_level] || RISK_BADGE.low;
            const card = document.createElement("div");
            card.className = `skill-card border rounded-lg p-2 bg-white ${badge.color}`;
            card.dataset.skillName = s.name;
            // tooltip 用 title (浏览器原生)
            card.title = `${s.display_name || s.name}`;
            card.innerHTML = `
                <div class="font-semibold truncate">${escapeHtml(s.display_name)}</div>
                <div class="text-[10px] opacity-70 font-mono truncate">${escapeHtml(s.name)}</div>
            `;
            listEl.appendChild(card);
        });
    } catch (e) {
        listEl.innerHTML = `<span class="text-red-500 col-span-full">加载失败: ${escapeHtml(e.message)}</span>`;
    }
}
loadSkills();

function highlightSkill(skillName, reason) {
    // 清除旧的高亮
    document.querySelectorAll(".skill-card.skill-active").forEach((el) => el.classList.remove("skill-active"));

    const card = document.querySelector(`.skill-card[data-skill-name="${CSS.escape(skillName || "")}"]`);
    const banner = document.getElementById("skill-selected-banner");
    const nameEl = document.getElementById("skill-selected-name");
    const reasonEl = document.getElementById("skill-reason");

    if (card) {
        card.classList.add("skill-active");
        card.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
        nameEl.textContent = card.querySelector(".font-semibold")?.textContent || skillName;
    } else {
        nameEl.textContent = skillName || "(未知)";
    }
    banner.classList.remove("hidden");

    reasonEl.textContent = "";
    reasonEl.classList.add("hidden");
}

function clearSkillHighlight() {
    document.querySelectorAll(".skill-card.skill-active").forEach((el) => el.classList.remove("skill-active"));
    document.getElementById("skill-selected-banner").classList.add("hidden");
    document.getElementById("skill-reason").classList.add("hidden");
}

// ============================================================
// AIOps 诊断
// ============================================================
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

document.getElementById("aiops-start").addEventListener("click", startAiops);
document.getElementById("aiops-stop").addEventListener("click", () => {
    if (aiopsAbortController) aiopsAbortController.abort();
    if (offlineReplayController) offlineReplayController.stopped = true;
});

document.querySelectorAll("[data-demo-prompt]").forEach((btn) => {
    btn.addEventListener("click", () => {
        const prompt = DEMO_PROMPTS[btn.dataset.demoPrompt] || "";
        const input = document.getElementById("aiops-query");
        selectedDemoScenarioId = btn.dataset.demoPrompt || "manual";
        input.value = prompt;
        input.focus();
    });
});
const aiopsQueryInput = document.getElementById("aiops-query");
if (aiopsQueryInput) {
    aiopsQueryInput.addEventListener("input", () => {
        selectedDemoScenarioId = "manual";
    });
}

const offlineToggle = document.getElementById("offline-demo-toggle");
const offlineReplayStart = document.getElementById("offline-replay-start");
const offlineFixtureSelect = document.getElementById("offline-fixture-select");
const downloadFixtureButton = document.getElementById("aiops-download-fixture");
if (offlineToggle) offlineToggle.addEventListener("click", toggleOfflineDemoBanner);
if (offlineReplayStart) offlineReplayStart.addEventListener("click", startOfflineReplay);
if (offlineFixtureSelect) offlineFixtureSelect.addEventListener("change", updateOfflineFixtureStatus);
if (downloadFixtureButton) downloadFixtureButton.addEventListener("click", downloadLatestFixtureJson);
const exportMarkdownButton = document.getElementById("aiops-export-markdown");
if (exportMarkdownButton) exportMarkdownButton.addEventListener("click", downloadMarkdownReport);
loadOfflineFixtureStatus();

// 监控面板状态
const aiopsMonitor = {
    startTs: 0,
    timer: null,
    toolCount: 0,
    toolFail: 0,
    tokenCount: 0,           // 字符流粗估 (流过来即累加)
    realInputTokens: 0,      // LLM usage 真实 input
    realOutputTokens: 0,     // LLM usage 真实 output
    realTotalTokens: 0,
    cacheHitTokens: 0,       // DeepSeek 才有
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
        document.getElementById("mon-stream").innerHTML =
            '<span class="text-slate-400 italic">诊断开始后, 模型生成的文本会实时显示在此...</span>';
        document.getElementById("mon-tool-feed").innerHTML =
            '<span class="text-slate-400 italic px-2">暂无工具调用</span>';
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
    const actions = document.getElementById("aiops-report-actions");
    const btn = document.getElementById("aiops-export-markdown");
    const hasReport = aiopsReportState.reportMarkdown.trim().length > 0;
    if (actions) actions.classList.toggle("hidden", !hasReport);
    if (!btn) return;
    btn.disabled = !hasReport;
    btn.title = hasReport
        ? "Download the displayed diagnosis report as Markdown"
        : "Generate a diagnosis report before exporting";
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
    document.getElementById("aiops-monitor").classList.add("hidden");
    const rep = document.getElementById("aiops-report");
    rep.classList.remove("hidden");
    updateExportMarkdownButton();
    setText("aiops-right-title", "📄 诊断报告");
}

function showAiopsMonitor() {
    document.getElementById("aiops-monitor").classList.remove("hidden");
    document.getElementById("aiops-report").classList.add("hidden");
    const actions = document.getElementById("aiops-report-actions");
    if (actions) actions.classList.add("hidden");
    setText("aiops-right-title", "📊 诊断监控");
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
    els.planEl.innerHTML = '<span class="text-slate-400 italic">等待 Planner...</span>';
    els.stepsEl.innerHTML = "";
    els.reportEl.innerHTML = "";
    showAiopsMonitor();
    aiopsMonitor.reset();
    els.statusEl.textContent = statusText;
    clearSkillHighlight();
    return els;
}

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
        statusEl.textContent = "完成 ✓";
    } catch (e) {
        if (e.name === "AbortError") {
            statusEl.textContent = "已停止";
        } else {
            statusEl.textContent = "失败 ✗";
            showAiopsReport();
            reportEl.innerHTML = `<p class="text-red-500">错误: ${e.message}</p>`;
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
                    // Keep raw SSE data strings. The recorder stores parsed JSON when possible.
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
        statusEl.textContent = offlineReplayController.stopped ? "Offline playback stopped" : "Offline playback complete";
        setText("offline-replay-status", offlineReplayController.stopped ? "Playback stopped" : "Playback complete");
    } catch (e) {
        statusEl.textContent = "Offline playback failed";
        showAiopsReport();
        reportEl.innerHTML = `<p class="text-red-500">Offline playback error: ${escapeHtml(e.message)}</p>`;
        setText("offline-replay-status", `Playback failed: ${e.message}`);
    } finally {
        document.getElementById("aiops-start").disabled = false;
        document.getElementById("aiops-stop").disabled = true;
        document.getElementById("offline-replay-start").disabled = !offlineFixtureAvailable;
        offlineReplayController = null;
        aiopsMonitor.stop();
    }
}

/*
 * Legacy replay implementation replaced by manifest/localStorage playback.
 */
/*
function removedLegacyReplayNormalizer(fixture) {
    const rawEvents = Array.isArray(fixture) ? fixture : (fixture?.events || []);
    return rawEvents.map((item) => {
        if (item?.data && typeof item.data === "string") {
            try {
                return JSON.parse(item.data);
            } catch {
                return null;
            }
        }
        if (item?.type) return item;
        return null;
    }).filter(Boolean);
}

async function removedLegacyStartOfflineReplay() {
    if (!offlineFixtureAvailable || legacyFixtureEvents.length === 0) {
        setText("offline-replay-status", "未找到真实录制 fixture，无法回放");
        return;
    }
    const banner = document.getElementById("offline-demo-banner");
    if (banner) banner.classList.remove("hidden");

    const replayInput = document.getElementById("aiops-query")?.value.trim() || "Offline replay fixture";
    const { planEl, stepsEl, reportEl, statusEl } = resetAiopsUi("离线回放准备中...");
    resetAiopsReportState({ input: replayInput, source: "offline-replay" });
    offlineReplayController = { stopped: false };
    document.getElementById("aiops-start").disabled = true;
    document.getElementById("aiops-stop").disabled = false;
    document.getElementById("offline-replay-start").disabled = true;
    setText("offline-replay-status", "正在回放录制事件...");

    try {
        for (const ev of legacyFixtureEvents) {
            if (offlineReplayController.stopped) break;
            handleAiopsEvent(ev, planEl, stepsEl, reportEl, statusEl);
            await sleep(legacyReplayDelayMs);
        }
        statusEl.textContent = offlineReplayController.stopped ? "离线回放已停止" : "离线回放完成";
        setText("offline-replay-status", offlineReplayController.stopped ? "回放已停止" : "回放完成");
    } catch (e) {
        statusEl.textContent = "离线回放失败";
        showAiopsReport();
        reportEl.innerHTML = `<p class="text-red-500">离线回放错误: ${escapeHtml(e.message)}</p>`;
        setText("offline-replay-status", `回放失败: ${e.message}`);
    } finally {
        if (activeSseRecording) {
            finalizeSseRecording({ completed: streamCompleted });
        }
        document.getElementById("aiops-start").disabled = false;
        document.getElementById("aiops-stop").disabled = true;
        document.getElementById("offline-replay-start").disabled = !offlineFixtureAvailable;
        offlineReplayController = null;
        aiopsMonitor.stop();
    }
}
*/

function handleAiopsEvent(ev, planEl, stepsEl, reportEl, statusEl) {
    const t = ev.type;
    const d = ev.data || {};
    // 诊断: 把所有 SSE 事件类型打到控制台, 方便排查监控为什么是 0
    if (t !== "transition") {
        console.log("[AIOps SSE]", t, d);
    }

    if (t === "start") {
        statusEl.textContent = "Skill Router 工作中...";
    } else if (t === "skill_selected") {
        highlightSkill(d.skill, d.reason);
        aiopsReportState.selectedSkill = d.skill || "";
        statusEl.textContent = `已选 Skill: ${d.skill || "(无)"}, Planner 工作中...`;
    } else if (t === "plan") {
        planEl.innerHTML = "";
        (d.plan || []).forEach((step, i) => {
            const div = document.createElement("div");
            div.className = "flex items-start space-x-2";
            div.innerHTML = `<span class="bg-indigo-100 text-indigo-700 rounded-full w-5 h-5 text-xs flex items-center justify-center flex-shrink-0 mt-0.5">${i + 1}</span><span class="text-slate-700">${escapeHtml(step)}</span>`;
            planEl.appendChild(div);
        });
        statusEl.textContent = `已生成 ${d.plan.length} 步计划`;
    } else if (t === "step_start") {
        // 创建 "executing" 卡片, 后续 step_token 往里追加流式内容
        let div = stepsEl.querySelector(`[data-step-iter="${d.iteration}"]`);
        if (!div) {
            div = document.createElement("div");
            div.className = "step-item executing";
            div.dataset.stepIter = String(d.iteration);
            div.innerHTML = `<div class="font-semibold text-xs text-indigo-700 mb-1">▶ 步骤 ${escapeHtml(String(d.iteration))}</div>
                <div class="text-xs text-slate-600 mb-1">${escapeHtml(d.step || "")}</div>
                <div class="step-stream text-xs text-slate-500 whitespace-pre-wrap break-words"></div>`;
            stepsEl.appendChild(div);
        }
        stepsEl.scrollTop = stepsEl.scrollHeight;
        statusEl.textContent = `正在执行第 ${d.iteration} 步...`;
        // 监控面板: 更新当前步骤 + 清空实时输出 (每步重置)
        setText("mon-step", String(d.iteration));
        setText("mon-step-label", (d.step || "").slice(0, 40));
        setText("mon-stream-hint", "生成中...");
        const stream = document.getElementById("mon-stream");
        if (stream) stream.textContent = "";
    } else if (t === "step_token") {
        const iter = d.iteration || 0;
        const content = d.content || "";
        let div = stepsEl.querySelector(`[data-step-iter="${iter}"]`);
        if (!div) {
            // 兜底: 没收到 step_start 就先建一张卡
            div = document.createElement("div");
            div.className = "step-item executing";
            div.dataset.stepIter = String(iter);
            div.innerHTML = `<div class="font-semibold text-xs text-indigo-700 mb-1">▶ 步骤 ${escapeHtml(String(iter))}</div>
                <div class="step-stream text-xs text-slate-500 whitespace-pre-wrap break-words"></div>`;
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
        // 监控面板: 大屏实时输出 + token 累计 (按字符数粗估)
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
        // 真实 usage 还没回来时, 用字符流粗估占位; usage 一到就被覆盖.
        if (!aiopsMonitor.hasRealUsage) {
            setText("mon-tokens", String(aiopsMonitor.tokenCount));
            setText("mon-tokens-detail", `~流字符 ${aiopsMonitor.tokenCount}`);
        }
    } else if (t === "usage") {
        // 后端 tool_runner 在每轮 LLM 末帧 emit, DeepSeek/DashScope 都通过
        // stream_options.include_usage / stream_usage=true 拿到真实 token.
        // 这里把多轮累加, 给 SRE 看真实成本.
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
        // 监控面板: 工具调用累计 + 流水列表
        aiopsMonitor.toolCount += 1;
        const ok = d.success !== false; // 后端 ok=true / success=true 都算成功
        if (!ok) aiopsMonitor.toolFail += 1;
        setText("mon-tools", String(aiopsMonitor.toolCount));
        setText("mon-tools-fail", `失败 ${aiopsMonitor.toolFail}`);
        const feed = document.getElementById("mon-tool-feed");
        if (feed) {
            // 首次清掉占位
            if (feed.querySelector(".italic")) feed.innerHTML = "";
            const row = document.createElement("div");
            const statusIcon = ok ? "✓" : "✗";
            const statusColor = ok ? "text-emerald-600" : "text-rose-600";
            const elapsed = d.elapsed_ms != null ? `${d.elapsed_ms}ms` : "";
            row.className = "flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-50 border-b border-slate-100";
            row.innerHTML = `<span class="${statusColor} font-semibold">${statusIcon}</span>
                <span class="font-mono text-slate-700 truncate">${escapeHtml(d.name || "?")}</span>
                <span class="text-slate-400 ml-auto shrink-0">${escapeHtml(elapsed)}</span>`;
            feed.appendChild(row);
            feed.scrollTop = feed.scrollHeight;
        }
    } else if (t === "step_complete") {
        // 把之前 executing 的卡片收紧成 done + 替换为结果预览
        const iter = d.iteration || 0;
        let div = stepsEl.querySelector(`[data-step-iter="${iter}"]`);
        if (!div) {
            div = document.createElement("div");
            div.dataset.stepIter = String(iter);
            stepsEl.appendChild(div);
        }
        div.className = "step-item done";
        div.innerHTML = `<div class="font-semibold text-xs text-emerald-700 mb-1">✓ 步骤 ${escapeHtml(String(iter))}</div>
            <div class="text-xs text-slate-600 mb-1">${escapeHtml(d.step || "")}</div>
            <div class="text-xs text-slate-500 italic">${escapeHtml((d.result_preview || "").slice(0, 200))}</div>`;
        stepsEl.scrollTop = stepsEl.scrollHeight;
        statusEl.textContent = `已完成 ${d.iteration} 步`;
    } else if (t === "replan") {
        const div = document.createElement("div");
        div.className = "step-item executing";
        div.innerHTML = `<div class="text-xs text-indigo-600">📐 Replanner 调整: 剩余 ${(d.plan || []).length} 步</div>`;
        stepsEl.appendChild(div);
        stepsEl.scrollTop = stepsEl.scrollHeight;
    } else if (t === "report") {
        const reportMarkdown = setAiopsReportMarkdown(d.report || "");
        showAiopsReport();
        reportEl.innerHTML = renderMarkdown(reportMarkdown);
        statusEl.textContent = "报告已生成";
        setText("mon-stream-hint", "已完成");
    } else if (t === "complete") {
        statusEl.textContent = "完成 ✓";
    } else if (t === "error") {
        showAiopsReport();
        reportEl.innerHTML = `<p class="text-red-500">错误: ${escapeHtml(ev.message)}</p>`;
        statusEl.textContent = "失败 ✗";
    }
}

// ============================================================
// AgentOps Console
// ============================================================
let agentOpsLoaded = false;
let agentOpsRunItems = [];
let agentOpsScenarioItems = [];
let agentOpsEvalCaseItems = [];

const agentOpsRefreshButton = document.getElementById("agentops-refresh");
if (agentOpsRefreshButton) {
    agentOpsRefreshButton.addEventListener("click", () => loadAgentOps(true));
}

const agentOpsRunsList = document.getElementById("agentops-runs-list");
if (agentOpsRunsList) agentOpsRunsList.addEventListener("click", handleAgentOpsRunClick);

const agentOpsScenarioForm = document.getElementById("agentops-scenario-form");
if (agentOpsScenarioForm) {
    agentOpsScenarioForm.addEventListener("submit", submitAgentOpsScenario);
}
const agentOpsScenarioReset = document.getElementById("agentops-scenario-reset");
if (agentOpsScenarioReset) agentOpsScenarioReset.addEventListener("click", resetAgentOpsScenarioForm);

const agentOpsScenariosList = document.getElementById("agentops-scenarios-list");
if (agentOpsScenariosList) agentOpsScenariosList.addEventListener("click", handleAgentOpsScenarioClick);

const agentOpsEvalCaseForm = document.getElementById("agentops-eval-case-form");
if (agentOpsEvalCaseForm) {
    agentOpsEvalCaseForm.addEventListener("submit", submitAgentOpsEvalCase);
}
const agentOpsEvalCaseReset = document.getElementById("agentops-eval-case-reset");
if (agentOpsEvalCaseReset) agentOpsEvalCaseReset.addEventListener("click", resetAgentOpsEvalCaseForm);

const agentOpsEvalCasesList = document.getElementById("agentops-eval-cases-list");
if (agentOpsEvalCasesList) agentOpsEvalCasesList.addEventListener("click", handleAgentOpsEvalCaseClick);

const agentOpsFixturesList = document.getElementById("agentops-fixtures-list");
if (agentOpsFixturesList) agentOpsFixturesList.addEventListener("click", handleAgentOpsFixtureClick);

async function loadAgentOps() {
    const tab = document.getElementById("tab-agentops");
    if (!tab) return;

    clearAgentOpsWarning();
    setAgentOpsLoadingState();
    await Promise.all([
        loadAgentOpsSummary(),
        loadAgentOpsRuns(),
        loadAgentOpsScenarios(),
        loadAgentOpsEvalCases(),
        loadAgentOpsEvalResults(),
    ]);
    await loadOfflineFixtureStatus();
    renderAgentOpsFixtures();
    agentOpsLoaded = true;
}

function setAgentOpsLoadingState() {
    setAgentOpsHtml("agentops-summary-grid", agentOpsEmptyHtml("Loading summary..."));
    setAgentOpsHtml("agentops-runs-list", agentOpsEmptyHtml("Loading run history..."));
    setAgentOpsHtml("agentops-scenarios-list", agentOpsEmptyHtml("Loading scenarios..."));
    setAgentOpsHtml("agentops-eval-cases-list", agentOpsEmptyHtml("Loading eval cases..."));
    setAgentOpsHtml("agentops-eval-results-list", agentOpsEmptyHtml("Loading eval results..."));
    setAgentOpsHtml("agentops-fixtures-list", agentOpsEmptyHtml("Loading offline fixture index..."));
}

async function agentOpsRequest(path, options = {}) {
    const fetchOptions = { ...options };
    const headers = { ...(options.headers || {}) };
    if (fetchOptions.body && typeof fetchOptions.body !== "string") {
        headers["Content-Type"] = "application/json";
        fetchOptions.body = JSON.stringify(fetchOptions.body);
    }
    fetchOptions.headers = headers;

    const resp = await fetch(`${API}${path}`, fetchOptions);
    const payload = await resp.json().catch(() => null);
    if (!resp.ok) {
        const detail = payload?.detail || payload?.message || `HTTP ${resp.status}`;
        throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
    }
    if (payload?.code && payload.code !== "SUCCESS") {
        throw new Error(payload.message || payload.code);
    }
    return payload?.data ?? payload;
}

async function loadAgentOpsSummary() {
    try {
        const summary = await agentOpsRequest("/agentops/summary");
        renderAgentOpsSummary(summary || {});
    } catch (e) {
        showAgentOpsWarning(`Summary API unavailable: ${e.message}`);
        setAgentOpsHtml("agentops-summary-grid", agentOpsEmptyHtml(`Summary unavailable: ${e.message}`));
    }
}

function renderAgentOpsSummary(summary) {
    const metrics = [
        ["Total Runs", summary.total_runs ?? 0],
        ["Success Rate", formatAgentOpsPercent(summary.success_rate)],
        ["Avg Duration", formatAgentOpsDuration(summary.avg_duration_ms)],
        ["Tool Calls", summary.total_tool_calls ?? 0],
        ["Eval Results", summary.eval_results ?? 0],
        ["Latest Score", formatAgentOpsScore(summary.latest_eval_score)],
    ];
    const html = metrics.map(([label, value]) => `
        <div class="agentops-metric">
            <div class="agentops-metric-label">${escapeHtml(label)}</div>
            <div class="agentops-metric-value">${escapeHtml(String(value))}</div>
        </div>
    `).join("");
    setAgentOpsHtml("agentops-summary-grid", html);
}

async function loadAgentOpsRuns() {
    try {
        const data = await agentOpsRequest("/agentops/runs?limit=20&offset=0");
        agentOpsRunItems = Array.isArray(data?.items) ? data.items : [];
        renderAgentOpsRuns(agentOpsRunItems);
    } catch (e) {
        agentOpsRunItems = [];
        showAgentOpsWarning(`Run history API unavailable: ${e.message}`);
        setAgentOpsHtml("agentops-runs-list", agentOpsEmptyHtml(`Run history unavailable: ${e.message}`));
    }
}

function renderAgentOpsRuns(items) {
    const report = document.getElementById("agentops-run-report");
    if (report) report.classList.add("hidden");
    if (!items.length) {
        setAgentOpsHtml("agentops-runs-list", agentOpsEmptyHtml("No diagnosis runs persisted yet."));
        return;
    }
    const rows = items.map((run) => `
        <tr>
            <td>${agentOpsStatusPill(run.status)}</td>
            <td class="font-mono text-xs">${escapeHtml(run.selected_skill || "-")}</td>
            <td>${escapeHtml(run.title || run.input_text || run.id)}</td>
            <td>${escapeHtml(formatAgentOpsDuration(run.duration_ms))}</td>
            <td>${escapeHtml(String(run.event_count ?? 0))}</td>
            <td>${escapeHtml(String(run.tool_call_count ?? 0))}</td>
            <td>${escapeHtml(formatAgentOpsDate(run.created_at))}</td>
            <td class="agentops-row-actions">
                ${run.report_markdown ? `<button type="button" class="agentops-link-btn" data-agentops-run-action="report" data-run-id="${escapeHtml(run.id)}">View report</button>` : ""}
                <button type="button" class="agentops-danger-btn" data-agentops-run-action="delete" data-run-id="${escapeHtml(run.id)}">Delete</button>
            </td>
        </tr>
    `).join("");
    setAgentOpsHtml("agentops-runs-list", `
        <table class="agentops-table">
            <thead>
                <tr>
                    <th>status</th>
                    <th>selected_skill</th>
                    <th>title</th>
                    <th>duration_ms</th>
                    <th>events</th>
                    <th>tools</th>
                    <th>created_at</th>
                    <th>actions</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `);
}

async function handleAgentOpsRunClick(e) {
    const btn = e.target.closest("[data-agentops-run-action]");
    if (!btn) return;
    const runId = btn.dataset.runId;
    const run = agentOpsRunItems.find((item) => item.id === runId);
    if (!run) return;

    if (btn.dataset.agentopsRunAction === "report") {
        const report = document.getElementById("agentops-run-report");
        if (!report) return;
        report.innerHTML = `
            <div class="mb-3 text-xs text-slate-500">
                Persisted report for <span class="font-mono">${escapeHtml(run.id)}</span>
            </div>
            ${renderMarkdown(run.report_markdown || "")}
        `;
        report.classList.remove("hidden");
        report.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    if (btn.dataset.agentopsRunAction === "delete") {
        if (!confirm(`Delete diagnosis run ${run.id}?`)) return;
        try {
            await agentOpsRequest(`/agentops/runs/${encodeURIComponent(run.id)}`, { method: "DELETE" });
            await Promise.all([loadAgentOpsSummary(), loadAgentOpsRuns()]);
        } catch (err) {
            showAgentOpsWarning(`Run delete failed: ${err.message}`);
        }
    }
}

async function loadAgentOpsScenarios() {
    try {
        const data = await agentOpsRequest("/agentops/scenarios");
        agentOpsScenarioItems = Array.isArray(data?.items) ? data.items : [];
        renderAgentOpsScenarios(agentOpsScenarioItems);
    } catch (e) {
        agentOpsScenarioItems = [];
        showAgentOpsWarning(`Demo scenarios API unavailable: ${e.message}`);
        setAgentOpsHtml("agentops-scenarios-list", agentOpsEmptyHtml(`Scenarios unavailable: ${e.message}`));
    }
}

function renderAgentOpsScenarios(items) {
    if (!items.length) {
        setAgentOpsHtml("agentops-scenarios-list", agentOpsEmptyHtml("No demo scenarios yet."));
        return;
    }
    const html = items.map((item) => `
        <div class="agentops-item">
            <div class="min-w-0">
                <div class="agentops-item-title">${escapeHtml(item.title || item.id)}</div>
                <div class="agentops-item-subtitle">
                    <span class="font-mono">${escapeHtml(item.id)}</span>
                    ${item.expected_skill ? ` · hint: <span class="font-mono">${escapeHtml(item.expected_skill)}</span>` : ""}
                </div>
                <div class="agentops-tags">${agentOpsTagsHtml(item.tags)}</div>
                <p class="agentops-preview">${escapeHtml(item.input_text || "")}</p>
            </div>
            <div class="agentops-item-actions">
                <button type="button" class="agentops-link-btn" data-agentops-scenario-action="fill" data-scenario-id="${escapeHtml(item.id)}">Fill input</button>
                <button type="button" class="agentops-secondary-btn" data-agentops-scenario-action="edit" data-scenario-id="${escapeHtml(item.id)}">Edit</button>
                <button type="button" class="agentops-danger-btn" data-agentops-scenario-action="delete" data-scenario-id="${escapeHtml(item.id)}">Delete</button>
            </div>
        </div>
    `).join("");
    setAgentOpsHtml("agentops-scenarios-list", html);
}

async function submitAgentOpsScenario(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const payload = agentOpsScenarioPayload(form);
    const editingId = form.dataset.editingId || "";
    try {
        if (editingId) {
            delete payload.id;
            await agentOpsRequest(`/agentops/scenarios/${encodeURIComponent(editingId)}`, {
                method: "PUT",
                body: payload,
            });
        } else {
            await agentOpsRequest("/agentops/scenarios", {
                method: "POST",
                body: payload,
            });
        }
        resetAgentOpsScenarioForm();
        await loadAgentOpsScenarios();
    } catch (err) {
        showAgentOpsWarning(`Scenario save failed: ${err.message}`);
    }
}

function agentOpsScenarioPayload(form) {
    return {
        id: form.elements.id.value.trim(),
        title: form.elements.title.value.trim(),
        description: form.elements.description.value.trim() || null,
        input_text: form.elements.input_text.value.trim(),
        expected_skill: form.elements.expected_skill.value.trim() || null,
        tags: normalizeAgentOpsCsv(form.elements.tags.value),
        is_builtin: form.elements.is_builtin.checked,
    };
}

async function handleAgentOpsScenarioClick(e) {
    const btn = e.target.closest("[data-agentops-scenario-action]");
    if (!btn) return;
    const id = btn.dataset.scenarioId;
    const item = agentOpsScenarioItems.find((scenario) => scenario.id === id);
    if (!item) return;

    if (btn.dataset.agentopsScenarioAction === "fill") {
        fillAgentOpsScenarioInput(id);
    } else if (btn.dataset.agentopsScenarioAction === "edit") {
        fillAgentOpsScenarioForm(item);
    } else if (btn.dataset.agentopsScenarioAction === "delete") {
        if (!confirm(`Delete scenario ${id}?`)) return;
        try {
            await agentOpsRequest(`/agentops/scenarios/${encodeURIComponent(id)}`, { method: "DELETE" });
            resetAgentOpsScenarioForm();
            await loadAgentOpsScenarios();
        } catch (err) {
            showAgentOpsWarning(`Scenario delete failed: ${err.message}`);
        }
    }
}

function fillAgentOpsScenarioInput(scenarioId) {
    const scenario = agentOpsScenarioItems.find((item) => item.id === scenarioId);
    const input = document.getElementById("aiops-query");
    if (!scenario || !input) return;
    input.value = scenario.input_text || "";
    selectedDemoScenarioId = scenario.id || "manual";
    switchAgentOpsTab("aiops");
    window.setTimeout(() => input.focus(), 0);
}

function fillAgentOpsScenarioForm(item) {
    const form = document.getElementById("agentops-scenario-form");
    if (!form) return;
    form.dataset.editingId = item.id;
    form.elements.id.value = item.id || "";
    form.elements.id.readOnly = true;
    form.elements.title.value = item.title || "";
    form.elements.description.value = item.description || "";
    form.elements.input_text.value = item.input_text || "";
    form.elements.expected_skill.value = item.expected_skill || "";
    form.elements.tags.value = item.tags || "";
    form.elements.is_builtin.checked = !!item.is_builtin;
}

function resetAgentOpsScenarioForm() {
    const form = document.getElementById("agentops-scenario-form");
    if (!form) return;
    form.reset();
    form.dataset.editingId = "";
    form.elements.id.readOnly = false;
}

async function loadAgentOpsEvalCases() {
    try {
        const data = await agentOpsRequest("/agentops/eval-cases");
        agentOpsEvalCaseItems = Array.isArray(data?.items) ? data.items : [];
        renderAgentOpsEvalCases(agentOpsEvalCaseItems);
    } catch (e) {
        agentOpsEvalCaseItems = [];
        showAgentOpsWarning(`Eval cases API unavailable: ${e.message}`);
        setAgentOpsHtml("agentops-eval-cases-list", agentOpsEmptyHtml(`Eval cases unavailable: ${e.message}`));
    }
}

function renderAgentOpsEvalCases(items) {
    if (!items.length) {
        setAgentOpsHtml("agentops-eval-cases-list", agentOpsEmptyHtml("No eval cases yet."));
        return;
    }
    const html = items.map((item) => `
        <div class="agentops-item">
            <div class="min-w-0">
                <div class="agentops-item-title">${escapeHtml(item.name || item.id)}</div>
                <div class="agentops-item-subtitle">
                    <span class="font-mono">${escapeHtml(item.id)}</span>
                    ${item.expected_skill ? ` · expected: <span class="font-mono">${escapeHtml(item.expected_skill)}</span>` : ""}
                    · ${item.enabled ? "enabled" : "disabled"}
                </div>
                <div class="agentops-tags">${agentOpsTagsHtml(item.tags)}</div>
                <p class="agentops-preview">${escapeHtml(item.input_text || "")}</p>
            </div>
            <div class="agentops-item-actions">
                <button type="button" class="agentops-secondary-btn" data-agentops-eval-action="toggle" data-case-id="${escapeHtml(item.id)}">${item.enabled ? "Disable" : "Enable"}</button>
                <button type="button" class="agentops-secondary-btn" data-agentops-eval-action="edit" data-case-id="${escapeHtml(item.id)}">Edit</button>
                <button type="button" class="agentops-danger-btn" data-agentops-eval-action="delete" data-case-id="${escapeHtml(item.id)}">Delete</button>
            </div>
        </div>
    `).join("");
    setAgentOpsHtml("agentops-eval-cases-list", html);
}

async function submitAgentOpsEvalCase(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const payload = agentOpsEvalCasePayload(form);
    const editingId = form.dataset.editingId || "";
    try {
        if (editingId) {
            delete payload.id;
            await agentOpsRequest(`/agentops/eval-cases/${encodeURIComponent(editingId)}`, {
                method: "PUT",
                body: payload,
            });
        } else {
            await agentOpsRequest("/agentops/eval-cases", {
                method: "POST",
                body: payload,
            });
        }
        resetAgentOpsEvalCaseForm();
        await loadAgentOpsEvalCases();
    } catch (err) {
        showAgentOpsWarning(`Eval case save failed: ${err.message}`);
    }
}

function agentOpsEvalCasePayload(form) {
    return {
        id: form.elements.id.value.trim(),
        name: form.elements.name.value.trim(),
        input_text: form.elements.input_text.value.trim(),
        expected_skill: form.elements.expected_skill.value.trim() || null,
        expected_tools: normalizeAgentOpsCsv(form.elements.expected_tools.value),
        tags: normalizeAgentOpsCsv(form.elements.tags.value),
        enabled: form.elements.enabled.checked,
    };
}

async function handleAgentOpsEvalCaseClick(e) {
    const btn = e.target.closest("[data-agentops-eval-action]");
    if (!btn) return;
    const id = btn.dataset.caseId;
    const item = agentOpsEvalCaseItems.find((evalCase) => evalCase.id === id);
    if (!item) return;

    if (btn.dataset.agentopsEvalAction === "toggle") {
        try {
            await agentOpsRequest(`/agentops/eval-cases/${encodeURIComponent(id)}`, {
                method: "PUT",
                body: { enabled: !item.enabled },
            });
            await loadAgentOpsEvalCases();
        } catch (err) {
            showAgentOpsWarning(`Eval case toggle failed: ${err.message}`);
        }
    } else if (btn.dataset.agentopsEvalAction === "edit") {
        fillAgentOpsEvalCaseForm(item);
    } else if (btn.dataset.agentopsEvalAction === "delete") {
        if (!confirm(`Delete eval case ${id}?`)) return;
        try {
            await agentOpsRequest(`/agentops/eval-cases/${encodeURIComponent(id)}`, { method: "DELETE" });
            resetAgentOpsEvalCaseForm();
            await loadAgentOpsEvalCases();
        } catch (err) {
            showAgentOpsWarning(`Eval case delete failed: ${err.message}`);
        }
    }
}

function fillAgentOpsEvalCaseForm(item) {
    const form = document.getElementById("agentops-eval-case-form");
    if (!form) return;
    form.dataset.editingId = item.id;
    form.elements.id.value = item.id || "";
    form.elements.id.readOnly = true;
    form.elements.name.value = item.name || "";
    form.elements.input_text.value = item.input_text || "";
    form.elements.expected_skill.value = item.expected_skill || "";
    form.elements.expected_tools.value = item.expected_tools || "";
    form.elements.tags.value = item.tags || "";
    form.elements.enabled.checked = !!item.enabled;
}

function resetAgentOpsEvalCaseForm() {
    const form = document.getElementById("agentops-eval-case-form");
    if (!form) return;
    form.reset();
    form.dataset.editingId = "";
    form.elements.id.readOnly = false;
    form.elements.enabled.checked = true;
}

async function loadAgentOpsEvalResults() {
    try {
        const data = await agentOpsRequest("/agentops/eval-results?limit=20");
        renderAgentOpsEvalResults(Array.isArray(data?.items) ? data.items : []);
    } catch (e) {
        showAgentOpsWarning(`Eval results API unavailable: ${e.message}`);
        setAgentOpsHtml("agentops-eval-results-list", agentOpsEmptyHtml(`Eval results unavailable: ${e.message}`));
    }
}

function renderAgentOpsEvalResults(items) {
    if (!items.length) {
        setAgentOpsHtml("agentops-eval-results-list", agentOpsEmptyHtml("No eval results yet."));
        return;
    }
    const rows = items.map((item) => `
        <tr>
            <td>${escapeHtml(item.mode || "-")}</td>
            <td>${formatAgentOpsBool(item.skill_match)}</td>
            <td>${formatAgentOpsBool(item.has_report)}</td>
            <td>${formatAgentOpsBool(item.has_error)}</td>
            <td>${escapeHtml(formatAgentOpsScore(item.score))}</td>
            <td>${escapeHtml(formatAgentOpsDuration(item.duration_ms))}</td>
            <td>${escapeHtml(formatAgentOpsDate(item.created_at))}</td>
        </tr>
    `).join("");
    setAgentOpsHtml("agentops-eval-results-list", `
        <table class="agentops-table">
            <thead>
                <tr>
                    <th>mode</th>
                    <th>skill_match</th>
                    <th>has_report</th>
                    <th>has_error</th>
                    <th>score</th>
                    <th>duration_ms</th>
                    <th>created_at</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `);
}

function renderAgentOpsFixtures() {
    const list = document.getElementById("agentops-fixtures-list");
    if (!list) return;
    const sources = Array.isArray(offlineFixtureSources) ? offlineFixtureSources : [];
    if (!sources.length) {
        list.innerHTML = `
            <div class="agentops-offline-label">Offline recorded demo - not a live model/tool call</div>
            ${agentOpsEmptyHtml("No manifest fixtures or latest local recording found.")}
        `;
        return;
    }
    const rows = sources.map((source) => {
        const recordedAt = source.metadata?.recorded_at || "unknown";
        const eventCount = source.eventCount || source.metadata?.event_count || "unknown";
        const kind = source.kind === "localStorage" ? "localStorage latest recording" : "manifest fixture";
        return `
            <div class="agentops-fixture-row">
                <div class="min-w-0">
                    <div class="font-semibold text-slate-800">${escapeHtml(source.title || source.id)}</div>
                    <div class="text-xs text-amber-800">
                        ${escapeHtml(kind)} · ${escapeHtml(String(eventCount))} events · recorded at ${escapeHtml(recordedAt)}
                    </div>
                </div>
                <button type="button" class="agentops-secondary-btn" data-agentops-fixture-id="${escapeHtml(source.id)}">Select replay</button>
            </div>
        `;
    }).join("");
    list.innerHTML = `
        <div class="agentops-offline-label">Offline recorded demo - not a live model/tool call</div>
        ${rows}
    `;
}

function handleAgentOpsFixtureClick(e) {
    const btn = e.target.closest("[data-agentops-fixture-id]");
    if (!btn) return;
    const select = document.getElementById("offline-fixture-select");
    if (select) {
        select.value = btn.dataset.agentopsFixtureId;
        updateOfflineFixtureStatus();
    }
    switchAgentOpsTab("aiops");
}

function setAgentOpsHtml(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
}

function agentOpsEmptyHtml(message) {
    return `<div class="agentops-empty">${escapeHtml(message)}</div>`;
}

function showAgentOpsWarning(message) {
    const el = document.getElementById("agentops-warning");
    if (!el) return;
    const existing = el.textContent.trim();
    el.textContent = existing ? `${existing} | ${message}` : message;
    el.classList.remove("hidden");
}

function clearAgentOpsWarning() {
    const el = document.getElementById("agentops-warning");
    if (!el) return;
    el.textContent = "";
    el.classList.add("hidden");
}

function switchAgentOpsTab(tabName) {
    const btn = document.querySelector(`.tab-btn[data-tab="${CSS.escape(tabName)}"]`);
    if (btn) btn.click();
}

function normalizeAgentOpsCsv(value) {
    const items = String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    return items.length ? items.join(",") : null;
}

function agentOpsTagsHtml(value) {
    const items = String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    if (!items.length) return '<span class="agentops-muted">no tags</span>';
    return items.map((item) => `<span class="agentops-tag">${escapeHtml(item)}</span>`).join("");
}

function agentOpsStatusPill(status) {
    const normalized = String(status || "unknown").toLowerCase();
    const tone = normalized === "succeeded"
        ? "agentops-pill-ok"
        : normalized === "failed"
            ? "agentops-pill-fail"
            : "agentops-pill-muted";
    return `<span class="agentops-pill ${tone}">${escapeHtml(normalized)}</span>`;
}

function formatAgentOpsPercent(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "-";
    return `${(number * 100).toFixed(1)}%`;
}

function formatAgentOpsDuration(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "-";
    return `${Math.round(number)} ms`;
}

function formatAgentOpsScore(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "-";
    return number.toFixed(3);
}

function formatAgentOpsBool(value) {
    if (value === null || value === undefined) return '<span class="agentops-muted">n/a</span>';
    return value
        ? '<span class="agentops-pill agentops-pill-ok">true</span>'
        : '<span class="agentops-pill agentops-pill-fail">false</span>';
}

function formatAgentOpsDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString();
}

// ============================================================
// RAG Chat
// ============================================================
const chatInput = document.getElementById("chat-input");
const chatSend = document.getElementById("chat-send");
const chatWebToggle = document.getElementById("chat-web-toggle");
const chatWebState = document.getElementById("chat-web-state");
const chatMcpToggle = document.getElementById("chat-mcp-toggle");
const chatMcpState = document.getElementById("chat-mcp-state");
let chatWebEnabled = false;
let chatMcpEnabled = true;

function renderChatWebToggle() {
    if (!chatWebToggle) return;
    if (chatWebEnabled) {
        chatWebToggle.className = "px-3 py-2 rounded-lg border text-xs font-medium select-none transition border-emerald-400 bg-emerald-50 text-emerald-700 hover:bg-emerald-100";
        chatWebState.textContent = "开";
    } else {
        chatWebToggle.className = "px-3 py-2 rounded-lg border text-xs font-medium select-none transition border-slate-300 text-slate-500 hover:bg-slate-100";
        chatWebState.textContent = "关";
    }
}
if (chatWebToggle) {
    chatWebToggle.addEventListener("click", () => {
        chatWebEnabled = !chatWebEnabled;
        renderChatWebToggle();
    });
    renderChatWebToggle();
}

function renderChatMcpToggle() {
    if (!chatMcpToggle) return;
    if (chatMcpEnabled) {
        chatMcpToggle.className = "px-3 py-2 rounded-lg border text-xs font-medium select-none transition border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100";
        chatMcpState.textContent = "开";
    } else {
        chatMcpToggle.className = "px-3 py-2 rounded-lg border text-xs font-medium select-none transition border-slate-300 text-slate-500 hover:bg-slate-100";
        chatMcpState.textContent = "关";
    }
}
if (chatMcpToggle) {
    chatMcpToggle.addEventListener("click", () => {
        chatMcpEnabled = !chatMcpEnabled;
        renderChatMcpToggle();
    });
    renderChatMcpToggle();
}

chatSend.addEventListener("click", sendChat);
chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendChat();
    }
});

async function sendChat() {
    const question = chatInput.value.trim();
    if (!question) return;
    chatInput.value = "";

    appendChatMsg("user", question);
    const progressBox = appendChatProgress();
    const thinkingBubble = appendThinkingBubble();
    thinkingBubble.wrap.style.display = "none"; // 等有 reasoning 再显
    const assistantBubble = appendChatMsg("assistant", "");
    assistantBubble.parentElement.style.display = "none"; // 等第一个 token 再显
    chatSend.disabled = true;

    try {
        const resp = await fetch(`${API}/chat/stream`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                session_id: "web-chat",
                question,
                top_k: 3,
                web_search: chatWebEnabled,
                mcp_tools: chatMcpEnabled,
            }),
        });

        let buf = "";
        let thinkBuf = "";
        let tokenStarted = false;
        let thinkingStarted = false;
        await consumeSSE(resp, (ev) => {
            if (!ev || typeof ev !== "object") return;
            if (ev.type === "progress") {
                appendChatProgressRow(progressBox, ev);
            } else if (ev.type === "thinking") {
                if (!thinkingStarted) {
                    thinkingStarted = true;
                    thinkingBubble.wrap.style.display = "";
                }
                thinkBuf += ev.content;
                thinkingBubble.content.textContent = thinkBuf;
                const container = document.getElementById("chat-messages");
                container.scrollTop = container.scrollHeight;
            } else if (ev.type === "token") {
                if (!tokenStarted) {
                    tokenStarted = true;
                    finalizeChatProgress(progressBox);
                    // 答案开始时把思考气泡自动折叠 (仍可点开)
                    if (thinkingStarted) collapseThinkingBubble(thinkingBubble);
                    assistantBubble.parentElement.style.display = "";
                }
                buf += ev.content;
                assistantBubble.innerHTML = renderMarkdown(buf);
                const container = document.getElementById("chat-messages");
                container.scrollTop = container.scrollHeight;
            } else if (ev.type === "error") {
                finalizeChatProgress(progressBox, true);
                assistantBubble.parentElement.style.display = "";
                assistantBubble.innerHTML = `<span class="text-red-500">错误: ${escapeHtml(ev.message)}</span>`;
            }
        });
        if (!tokenStarted) {
            // 没拿到任何 token, 清理占位气泡
            assistantBubble.parentElement.remove();
        }
        if (!thinkingStarted) {
            thinkingBubble.wrap.remove();
        }
    } catch (e) {
        finalizeChatProgress(progressBox, true);
        assistantBubble.parentElement.style.display = "";
        assistantBubble.innerHTML = `<span class="text-red-500">网络错误: ${e.message}</span>`;
    } finally {
        chatSend.disabled = false;
        chatInput.focus();
    }
}

// --- RAG Chat 思考过程气泡 (qwen3/qwen-plus-latest 等支持 thinking 的模型才会有) ---
function appendThinkingBubble() {
    const container = document.getElementById("chat-messages");
    const placeholder = container.querySelector(".text-center.italic");
    if (placeholder) placeholder.remove();

    const wrap = document.createElement("div");
    wrap.className = "flex justify-start";
    wrap.innerHTML = `
      <div class="rag-thinking bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-500 max-w-[85%] space-y-1">
        <div class="rag-thinking-head flex items-center gap-1.5 cursor-pointer select-none">
          <span>🧠</span>
          <span class="font-medium text-slate-600">思考过程</span>
          <span class="rag-thinking-toggle ml-auto text-[10px] text-slate-400">▼ 收起</span>
        </div>
        <pre class="rag-thinking-content whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-slate-500 max-h-48 overflow-auto"></pre>
      </div>`;
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;

    const box = wrap.querySelector(".rag-thinking");
    const content = wrap.querySelector(".rag-thinking-content");
    const head = wrap.querySelector(".rag-thinking-head");
    const toggle = wrap.querySelector(".rag-thinking-toggle");
    head.addEventListener("click", () => {
        const hidden = content.classList.toggle("hidden");
        toggle.textContent = hidden ? "▶ 展开" : "▼ 收起";
    });
    return { wrap, box, content, head, toggle };
}

function collapseThinkingBubble(bundle) {
    if (!bundle || !bundle.content) return;
    bundle.content.classList.add("hidden");
    if (bundle.toggle) bundle.toggle.textContent = "▶ 展开";
}

// --- RAG Chat 进度条 (类似 AIOps 步骤卡片) ---
function appendChatProgress() {
    const container = document.getElementById("chat-messages");
    const placeholder = container.querySelector(".text-center.italic");
    if (placeholder) placeholder.remove();

    const wrap = document.createElement("div");
    wrap.className = "flex justify-start";
    wrap.innerHTML = `
      <div class="rag-progress bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 text-xs text-slate-600 space-y-1 max-w-[85%]">
        <div class="rag-progress-head font-medium text-indigo-700 flex items-center gap-2">
          <span class="rag-spinner inline-block w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></span>
          <span>正在检索并生成回答…</span>
        </div>
        <div class="rag-progress-rows space-y-0.5"></div>
      </div>`;
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
    return wrap.querySelector(".rag-progress");
}

function appendChatProgressRow(box, ev) {
    if (!box) return;
    const rows = box.querySelector(".rag-progress-rows");
    const icon = iconForRagStage(ev.stage);
    const elapsed = Number.isFinite(ev.elapsed_ms) && ev.elapsed_ms > 0
        ? `<span class="ml-1 text-[10px] text-indigo-500">${ev.elapsed_ms}ms</span>`
        : "";

    const detailsHtml = renderRagStageDetails(ev.stage, ev.data || {});
    const hasDetails = !!detailsHtml;

    const row = document.createElement("div");
    row.className = "rag-progress-row";

    const headLine = document.createElement("div");
    headLine.className = "flex items-center gap-1.5 flex-wrap" + (hasDetails ? " cursor-pointer hover:bg-indigo-100/40 rounded px-0.5 -mx-0.5" : "");
    headLine.innerHTML = `
      <span class="shrink-0">${icon}</span>
      <span class="text-slate-700 font-medium">${escapeHtml(ev.label || ev.stage || "")}</span>
      ${ev.detail ? `<span class="text-slate-400 truncate">${escapeHtml(ev.detail)}</span>` : ""}
      ${elapsed}
      ${hasDetails ? `<span class="rag-toggle text-[10px] text-indigo-500 ml-auto select-none">▶ 详情</span>` : ""}`;
    row.appendChild(headLine);

    if (hasDetails) {
        const panel = document.createElement("div");
        panel.className = "rag-details mt-1 ml-5 hidden text-[11px] text-slate-600 bg-white border border-indigo-100 rounded p-2 space-y-1";
        panel.innerHTML = detailsHtml;
        row.appendChild(panel);
        headLine.addEventListener("click", () => {
            const opened = !panel.classList.contains("hidden");
            panel.classList.toggle("hidden");
            const tog = headLine.querySelector(".rag-toggle");
            if (tog) tog.textContent = opened ? "▶ 详情" : "▼ 收起";
        });
    }

    rows.appendChild(row);
    const container = document.getElementById("chat-messages");
    container.scrollTop = container.scrollHeight;
}

function renderRagStageDetails(stage, data) {
    if (!data || typeof data !== "object") return "";
    if (stage === "rewrite_done") {
        const orig = data.original || "";
        const rew = data.rewritten || "";
        if (!orig && !rew) return "";
        return `
          <div><span class="text-slate-400">原始:</span> ${escapeHtml(orig)}</div>
          <div><span class="text-slate-400">改写:</span> ${escapeHtml(rew)}</div>`;
    }
    if (stage === "retrieve_done") {
        const hits = Array.isArray(data.hits) ? data.hits : [];
        if (!hits.length) return `<div class="text-slate-400">无命中片段</div>`;
        const meta = `<div class="text-slate-400 mb-1">top_k=${data.top_k ?? "?"} · ${escapeHtml(data.mode || "")}</div>`;
        const items = hits.map((h, i) => {
            const score = (h.score !== null && h.score !== undefined) ? `<span class="text-emerald-600">score ${h.score}</span>` : "";
            const chap = h.chapter ? ` · 章节: ${escapeHtml(h.chapter)}` : "";
            return `
              <div class="border-l-2 border-indigo-200 pl-2">
                <div class="font-medium text-slate-700">${i + 1}. ${escapeHtml(h.source || "未知")} ${score}${chap}</div>
                <div class="text-slate-500">${escapeHtml(h.preview || "")}</div>
              </div>`;
        }).join("");
        return meta + items;
    }
    if (stage === "web_done") {
        const results = Array.isArray(data.results) ? data.results : [];
        if (!results.length) {
            const reason = data.skip_reason || "未触发联网";
            return `<div class="text-slate-400">${escapeHtml(reason)}</div>`;
        }
        const meta = data.provider ? `<div class="text-slate-400 mb-1">provider=${escapeHtml(data.provider)}</div>` : "";
        const items = results.map((r, i) => {
            const url = r.url || "";
            const titleEsc = escapeHtml(r.title || "(无标题)");
            const titleHtml = url
                ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="text-indigo-600 hover:underline">${titleEsc}</a>`
                : titleEsc;
            return `
              <div class="border-l-2 border-emerald-200 pl-2">
                <div class="font-medium">${i + 1}. ${titleHtml}</div>
                ${url ? `<div class="text-[10px] text-slate-400 break-all">${escapeHtml(url)}</div>` : ""}
                <div class="text-slate-500">${escapeHtml(r.snippet || "")}</div>
              </div>`;
        }).join("");
        return meta + items;
    }
    if (stage === "stats") {
        return `
          <div>模型: <span class="font-medium">${escapeHtml(data.model || "?")}</span></div>
          <div>输入 tokens: <span class="font-medium">${data.input_tokens ?? 0}</span></div>
          <div>输出 tokens: <span class="font-medium">${data.output_tokens ?? 0}</span></div>
          <div>合计 tokens: <span class="font-medium">${data.total_tokens ?? 0}</span></div>
          <div>生成耗时: <span class="font-medium">${data.llm_ms ?? 0} ms</span></div>
          <div>总耗时: <span class="font-medium">${data.total_ms ?? 0} ms</span></div>
          <div>回答字数: <span class="font-medium">${data.answer_chars ?? 0}</span></div>
          ${data.tools_enabled ? '<div class="text-emerald-600">工具回合: 已启用</div>' : ''}`;
    }
    if (stage === "llm_start") {
        const tools = Array.isArray(data.tools) ? data.tools : [];
        if (data.tools_enabled && tools.length) {
            const chips = tools.map(name => `<span class="inline-block px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100 mr-1 mb-1 font-mono text-[10px]">${escapeHtml(name)}</span>`).join("");
            return `
              <div class="text-slate-500 mb-1">模型: <span class="font-medium">${escapeHtml(data.model || "?")}</span></div>
              <div class="text-slate-500 mb-1">已为模型启用 ${tools.length} 个只读工具, 模型可按需自主调用:</div>
              <div class="flex flex-wrap">${chips}</div>`;
        }
        return `<div class="text-slate-500">模型: <span class="font-medium">${escapeHtml(data.model || "?")}</span> · 工具回合: 未启用</div>`;
    }
    if (stage === "tool_call") {
        const ok = (data.status || "").toLowerCase() === "ok";
        const statusColor = ok ? "text-emerald-600" : "text-rose-600";
        const statusIcon = ok ? "✓" : "✗";
        return `
          <div>工具: <span class="font-mono text-slate-700">${escapeHtml(data.name || "?")}</span></div>
          <div>状态: <span class="${statusColor} font-medium">${statusIcon} ${escapeHtml(data.status || "?")}</span></div>
          <div>耗时: <span class="font-medium">${data.elapsed_ms ?? 0} ms</span></div>
          <div>输出: <span class="font-medium">${data.result_chars ?? 0} 字符</span></div>
          ${data.read_only === false ? '<div class="text-amber-600">⚠ 非只读工具</div>' : ''}`;
    }
    return "";
}

function finalizeChatProgress(box, failed = false) {
    if (!box) return;
    const head = box.querySelector(".rag-progress-head");
    if (head) {
        head.innerHTML = failed
            ? `<span class="text-red-500">✗ 检索流程中断</span>`
            : `<span class="text-emerald-600">✓ 检索流程完成</span>`;
    }
}

function iconForRagStage(stage) {
    switch (stage) {
        case "rewrite":      return "✏️";
        case "rewrite_done": return "✅";
        case "retrieve":     return "🔍";
        case "retrieve_done":return "📚";
        case "web":          return "🌐";
        case "web_done":     return "🌐";
        case "llm_start":    return "🤖";
        case "tool_call":    return "🛠️";
        case "stats":        return "📊";
        default:             return "•";
    }
}

function appendChatMsg(role, content) {
    const container = document.getElementById("chat-messages");
    // 清掉初始提示
    const placeholder = container.querySelector(".text-center.italic");
    if (placeholder) placeholder.remove();

    const wrap = document.createElement("div");
    wrap.className = "flex " + (role === "user" ? "justify-end" : "justify-start");
    const bubble = document.createElement("div");
    bubble.className = `chat-msg ${role}`;
    bubble.innerHTML = role === "user" ? escapeHtml(content) : renderMarkdown(content);
    wrap.appendChild(bubble);
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
    return bubble;
}

// ============================================================
// 文档管理
// ============================================================
const uploadZone = document.getElementById("upload-zone");
const uploadInput = document.getElementById("upload-input");
const uploadResult = document.getElementById("upload-result");
const KB_ADMIN_TOKEN_KEY = "multi_agent_kb_admin_token";

uploadZone.addEventListener("click", () => uploadInput.click());
uploadInput.addEventListener("change", () => uploadInput.files[0] && uploadFile(uploadInput.files[0]));
uploadZone.addEventListener("dragover", (e) => { e.preventDefault(); uploadZone.classList.add("bg-indigo-50"); });
uploadZone.addEventListener("dragleave", () => uploadZone.classList.remove("bg-indigo-50"));
uploadZone.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadZone.classList.remove("bg-indigo-50");
    if (e.dataTransfer.files[0]) uploadFile(e.dataTransfer.files[0]);
});
document.getElementById("docs-refresh").addEventListener("click", loadDocs);

async function uploadFile(file) {
    uploadResult.innerHTML = `<div class="text-indigo-600">⏳ 上传 ${escapeHtml(file.name)} ...</div>`;
    const formData = new FormData();
    formData.append("file", file);
    try {
        const r = await fetch(`${API}/documents/upload`, {
            method: "POST",
            headers: { "X-KB-Admin-Token": getKbAdminToken() },
            body: formData,
        });
        const data = await r.json().catch(() => null);
        if (!r.ok) {
            if (r.status === 401 || r.status === 403) sessionStorage.removeItem(KB_ADMIN_TOKEN_KEY);
            throw new Error(data?.detail || data?.message || `HTTP ${r.status}`);
        }
        if (data.code === "SUCCESS") {
            uploadResult.innerHTML = `<div class="text-emerald-600">✓ 已索引 ${data.data.chunks_indexed} 个 chunk (${data.data.bytes} bytes)</div>`;
            loadDocs();
        } else {
            uploadResult.innerHTML = `<div class="text-red-500">✗ ${escapeHtml(data?.message || "上传失败")}</div>`;
        }
    } catch (e) {
        uploadResult.innerHTML = `<div class="text-red-500">✗ ${escapeHtml(e.message)}</div>`;
    }
}

async function loadDocs() {
    const listEl = document.getElementById("docs-list");
    listEl.innerHTML = '<span class="text-sm text-slate-400 italic">加载中...</span>';
    try {
        const r = await fetch(`${API}/documents`);
        const data = await r.json();
        const docs = data?.data?.documents || [];
        if (docs.length === 0) {
            listEl.innerHTML = '<span class="text-sm text-slate-400 italic">暂无文档, 请先上传</span>';
            return;
        }
        listEl.innerHTML = "";
        docs.forEach((d) => {
            const div = document.createElement("div");
            div.className = "doc-card";
            div.innerHTML = `
                <div>
                    <div class="font-semibold text-sm">${escapeHtml(d.source)}</div>
                    <div class="text-xs text-slate-500">${d.chunk_count} 个 chunk</div>
                </div>
                <button class="text-red-500 hover:text-red-700 text-sm" data-source="${escapeHtml(d.source)}">删除</button>
            `;
            div.querySelector("button").addEventListener("click", (e) => {
                if (confirm(`确认删除 ${d.source}?`)) deleteDoc(d.source);
            });
            listEl.appendChild(div);
        });
    } catch (e) {
        listEl.innerHTML = `<span class="text-red-500">加载失败: ${e.message}</span>`;
    }
}

async function deleteDoc(source) {
    try {
        const r = await fetch(`${API}/documents/${encodeURIComponent(source)}`, {
            method: "DELETE",
            headers: { "X-KB-Admin-Token": getKbAdminToken() },
        });
        const data = await r.json().catch(() => null);
        if (!r.ok || data?.code !== "SUCCESS") {
            if (r.status === 401 || r.status === 403) sessionStorage.removeItem(KB_ADMIN_TOKEN_KEY);
            throw new Error(data?.detail || data?.message || `HTTP ${r.status}`);
        }
        loadDocs();
    } catch (e) {
        alert(`删除失败: ${e.message}`);
    }
}

function getKbAdminToken() {
    let token = sessionStorage.getItem(KB_ADMIN_TOKEN_KEY) || "";
    if (!token) {
        token = prompt("请输入知识库管理员 Token") || "";
        token = token.trim();
        if (!token) throw new Error("未输入管理员 Token");
        sessionStorage.setItem(KB_ADMIN_TOKEN_KEY, token);
    }
    return token;
}

// ============================================================
// 工具函数
// ============================================================
async function consumeSSE(response, onEvent) {
    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
    }
    if (!response.body) {
        throw new Error("浏览器不支持 ReadableStream");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    // SSE 标准支持 \r\n / \n / \r 三种分隔, 这里全兼容
    const blockSplit = /\r?\n\r?\n|\n\n/;
    const lineSplit = /\r?\n/;

    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            // 处理最后剩下的 buffer
            if (buffer.trim()) parseBlock(buffer);
            break;
        }
        buffer += decoder.decode(value, { stream: true });

        // 切出所有完整的 event block
        let parts = buffer.split(blockSplit);
        buffer = parts.pop();  // 最后一段可能不完整, 留到下次
        for (const block of parts) parseBlock(block);
    }

    function parseBlock(block) {
        let eventName = "message";
        const dataLines = [];
        for (const line of block.split(lineSplit)) {
            if (line.startsWith("event:")) {
                eventName = line.slice(6).trim() || "message";
            } else if (line.startsWith("data:")) {
                dataLines.push(line.slice(5).replace(/^ /, ""));
            }
        }
        if (dataLines.length === 0) return;
        const payload = dataLines.join("\n").trim();
        if (!payload) return;
        let parsed = payload;
        try {
            parsed = JSON.parse(payload);
        } catch (e) {
            console.warn("[SSE] JSON parse error; preserving raw payload:", payload, e);
        }
        onEvent(parsed, { event: eventName, data: parsed, rawData: payload });
    }
}

function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// 极简 Markdown -> HTML (够用即可, 不引第三方库)
function renderMarkdown(md) {
    if (!md) return "";
    // 处理 LLM 偶尔输出 \n 字面量 (而非实际换行) 的 bug
    // (\\\\n 在 JS 字符串里就是 \n 两个字符, 把它替换成真换行)
    let s = String(md).replace(/\\n/g, "\n").replace(/\\t/g, "\t");
    let h = escapeHtml(s);
    // 代码块
    h = h.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code}</code></pre>`);
    // 行内代码
    h = h.replace(/`([^`\n]+)`/g, "<code>$1</code>");
    // 标题
    h = h.replace(/^### (.+)$/gm, "<h3>$1</h3>");
    h = h.replace(/^## (.+)$/gm, "<h2>$1</h2>");
    h = h.replace(/^# (.+)$/gm, "<h1>$1</h1>");
    // 加粗
    h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    // 列表
    h = h.replace(/^[\-\*] (.+)$/gm, "<li>$1</li>");
    h = h.replace(/(<li>[\s\S]*?<\/li>)(\n<li>)/g, "$1$2");
    h = h.replace(/(<li>[\s\S]+?<\/li>)/g, (m) => `<ul>${m}</ul>`);
    h = h.replace(/<\/ul>\s*<ul>/g, "");
    // 段落
    h = h.replace(/\n\n/g, "</p><p>");
    h = h.replace(/\n/g, "<br>");
    return `<p>${h}</p>`;
}

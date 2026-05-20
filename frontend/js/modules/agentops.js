// AgentOps 控制台 (6 子页) — 从原 app.js:1015-1648 搬迁,加子路由 + 汉化
import { API, agentOpsRequest } from "../core/api.js";
import { escapeHtml, renderMarkdown } from "../core/markdown.js";
import { t } from "../core/i18n.js";

let inited = false;
let agentOpsRunItems = [];
let agentOpsScenarioItems = [];
let agentOpsEvalCaseItems = [];
let currentSubPage = "overview";

// ---------- 子路由 ----------
const SUB_PAGES = ["overview", "runs", "scenarios", "cases", "results", "fixtures"];

function switchSubPage(name) {
    if (!SUB_PAGES.includes(name)) name = "overview";
    currentSubPage = name;
    document.querySelectorAll(".ink-subnav-btn").forEach(b => b.classList.remove("is-active"));
    document.querySelector(`.ink-subnav-btn[data-agentops-sub="${CSS.escape(name)}"]`)?.classList.add("is-active");
    document.querySelectorAll(".agentops-sub-page").forEach(p => p.classList.add("hidden"));
    document.getElementById(`agentops-sub-${name}`)?.classList.remove("hidden");
    window.location.hash = `#agentops/${name}`;
    loadAgentOpsIfNeeded();
}

let agentOpsLoaded = false;
let loadingPromise = null;

async function loadAgentOpsIfNeeded() {
    if (agentOpsLoaded) return;
    if (loadingPromise) { await loadingPromise; return; }
    loadingPromise = loadAgentOps();
    await loadingPromise;
    loadingPromise = null;
}

async function loadAgentOps() {
    clearAgentOpsWarning();
    await Promise.all([
        loadAgentOpsSummary(),
        loadAgentOpsRuns(),
        loadAgentOpsScenarios(),
        loadAgentOpsEvalCases(),
        loadAgentOpsEvalResults(),
    ]);
    await loadAgentOpsFixturesFromAIOps();
    renderAgentOpsFixtures();
    agentOpsLoaded = true;
}

// 延迟加载 fixture 数据 (依赖 aiops module 的 offlineFixtureSources)
async function loadAgentOpsFixturesFromAIOps() {
    const mod = await import("../modules/aiops.js");
    if (typeof mod.getOfflineSources === "function") {
        // aiops module 暴露的数据获取函数
    }
}

function clearAgentOpsWarning() {
    const el = document.getElementById("agentops-warning");
    if (!el) return;
    el.textContent = "";
    el.classList.add("hidden");
}

function showAgentOpsWarning(message) {
    const el = document.getElementById("agentops-warning");
    if (!el) return;
    const existing = el.textContent.trim();
    el.textContent = existing ? `${existing} | ${message}` : message;
    el.classList.remove("hidden");
}

function setHtml(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
}

// ---------- 通用工具 ----------
function normalizeCsv(value) {
    const items = String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    return items.length ? items.join(",") : null;
}

function tagsHtml(value) {
    const items = String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    if (!items.length) return `<span class="ink-pill ink-pill-muted">${t("no tags")}</span>`;
    return items.map((item) => `<span class="ink-pill">${escapeHtml(item)}</span>`).join("");
}

function statusPill(status) {
    const normalized = String(status || "unknown").toLowerCase();
    const label = t(normalized, normalized);
    const tone = normalized === "succeeded"
        ? "ink-pill-ok"
        : normalized === "failed"
            ? "ink-pill-fail"
            : "ink-pill-muted";
    return `<span class="ink-pill ${tone}">${escapeHtml(label)}</span>`;
}

function renderBool(value) {
    if (value === null || value === undefined) return '<span class="ink-pill ink-pill-muted">n/a</span>';
    return value
        ? '<span class="ink-pill ink-pill-ok">true</span>'
        : '<span class="ink-pill ink-pill-fail">false</span>';
}

function formatPct(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "-";
    return `${(number * 100).toFixed(1)}%`;
}

function formatMs(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "-";
    return `${Math.round(number)} ms`;
}

function formatScore(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "-";
    return number.toFixed(3);
}

function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString();
}

// ---------- Summary ----------
async function loadAgentOpsSummary() {
    try {
        const summary = await agentOpsRequest("/agentops/summary");
        renderAgentOpsSummary(summary || {});
    } catch (e) {
        showAgentOpsWarning(`${t("Summary API unavailable")}: ${e.message}`);
        setHtml("agentops-summary-grid",
            `<div class="ink-empty">${t("Summary unavailable")}: ${escapeHtml(e.message)}</div>`);
    }
}

function renderAgentOpsSummary(summary) {
    const metrics = [
        [t("Total Runs"),      summary.total_runs ?? 0],
        [t("Success Rate"),    formatPct(summary.success_rate)],
        [t("Avg Duration"),    formatMs(summary.avg_duration_ms)],
        [t("Tool Calls"),      summary.total_tool_calls ?? 0],
        [t("Eval Results", "Eval Results"), summary.eval_results ?? 0],
        [t("Latest Score"),    formatScore(summary.latest_eval_score)],
    ];
    const html = metrics.map(([label, value]) => `
        <div class="ink-metric">
            <div class="ink-metric-label">${escapeHtml(label)}</div>
            <div class="ink-metric-value">${escapeHtml(String(value))}</div>
        </div>
    `).join("");
    setHtml("agentops-summary-grid", html);
}

// ---------- Runs ----------
async function loadAgentOpsRuns() {
    try {
        const data = await agentOpsRequest("/agentops/runs?limit=20&offset=0");
        agentOpsRunItems = Array.isArray(data?.items) ? data.items : [];
        renderAgentOpsRuns(agentOpsRunItems);
    } catch (e) {
        agentOpsRunItems = [];
        showAgentOpsWarning(`${t("Run history API unavailable")}: ${e.message}`);
        setHtml("agentops-runs-list",
            `<div class="ink-empty">${t("Run history unavailable")}: ${escapeHtml(e.message)}</div>`);
    }
}

function renderAgentOpsRuns(items) {
    const report = document.getElementById("agentops-run-report");
    if (report) report.classList.add("hidden");
    if (!items.length) {
        setHtml("agentops-runs-list", `<div class="ink-empty">${t("No diagnosis runs persisted yet.")}</div>`);
        return;
    }
    const rows = items.map((run) => `
        <tr>
            <td>${statusPill(run.status)}</td>
            <td style="font-family:var(--font-mono);font-size:11px">${escapeHtml(run.selected_skill || "-")}</td>
            <td>${escapeHtml(run.title || run.input_text || run.id)}</td>
            <td>${escapeHtml(formatMs(run.duration_ms))}</td>
            <td>${escapeHtml(String(run.event_count ?? 0))}</td>
            <td>${escapeHtml(String(run.tool_call_count ?? 0))}</td>
            <td>${escapeHtml(formatDate(run.created_at))}</td>
            <td class="ink-row-actions">
                ${run.report_markdown ? `<button type="button" class="ink-btn ink-btn-sm" data-agentops-run-action="report" data-run-id="${escapeHtml(run.id)}">${t("View report")}</button>` : ""}
                <button type="button" class="ink-btn ink-btn-sm ink-btn-danger" data-agentops-run-action="delete" data-run-id="${escapeHtml(run.id)}">${t("Delete")}</button>
            </td>
        </tr>
    `).join("");
    setHtml("agentops-runs-list", `
        <div class="ink-table-wrap">
            <table class="ink-table">
                <thead>
                    <tr>
                        <th>${t("status")}</th>
                        <th>${t("selected_skill")}</th>
                        <th>${t("title")}</th>
                        <th>${t("duration_ms")}</th>
                        <th>${t("events")}</th>
                        <th>${t("tools")}</th>
                        <th>${t("created_at")}</th>
                        <th>${t("actions")}</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `);
}

function handleAgentOpsRunClick(e) {
    const btn = e.target.closest("[data-agentops-run-action]");
    if (!btn) return;
    const runId = btn.dataset.runId;
    const run = agentOpsRunItems.find((item) => item.id === runId);
    if (!run) return;

    if (btn.dataset.agentopsRunAction === "report") {
        const report = document.getElementById("agentops-run-report");
        if (!report) return;
        report.innerHTML = `
            <div style="margin-bottom:10px;font-size:12px;color:var(--ink-muted)">
                Persisted report for <span style="font-family:var(--font-mono)">${escapeHtml(run.id)}</span>
            </div>
            ${renderMarkdown(run.report_markdown || "")}
        `;
        report.classList.remove("hidden");
        report.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    if (btn.dataset.agentopsRunAction === "delete") {
        if (!confirm(`${t("Delete diagnosis run")} ${run.id}?`)) return;
        (async () => {
            try {
                await agentOpsRequest(`/agentops/runs/${encodeURIComponent(run.id)}`, { method: "DELETE" });
                await Promise.all([loadAgentOpsSummary(), loadAgentOpsRuns()]);
            } catch (err) {
                showAgentOpsWarning(`${t("Run delete failed")}: ${err.message}`);
            }
        })();
    }
}

// ---------- Scenarios ----------
async function loadAgentOpsScenarios() {
    try {
        const data = await agentOpsRequest("/agentops/scenarios");
        agentOpsScenarioItems = Array.isArray(data?.items) ? data.items : [];
        renderAgentOpsScenarios(agentOpsScenarioItems);
    } catch (e) {
        agentOpsScenarioItems = [];
        showAgentOpsWarning(`${t("Demo scenarios API unavailable")}: ${e.message}`);
        setHtml("agentops-scenarios-list",
            `<div class="ink-empty">${t("Scenarios unavailable")}: ${escapeHtml(e.message)}</div>`);
    }
}

function renderAgentOpsScenarios(items) {
    if (!items.length) {
        setHtml("agentops-scenarios-list", `<div class="ink-empty">${t("No demo scenarios yet.")}</div>`);
        return;
    }
    const html = items.map((item) => `
        <div class="ink-list-item">
            <div style="min-width:0;flex:1 1 auto">
                <div class="ink-list-title">${escapeHtml(item.title || item.id)}</div>
                <div class="ink-list-subtitle">
                    <span style="font-family:var(--font-mono)">${escapeHtml(item.id)}</span>
                    ${item.expected_skill ? ` · hint: <span style="font-family:var(--font-mono)">${escapeHtml(item.expected_skill)}</span>` : ""}
                </div>
                <div class="ink-list-tags">${tagsHtml(item.tags)}</div>
                <div class="ink-list-preview">${escapeHtml(item.input_text || "")}</div>
            </div>
            <div class="ink-list-actions">
                <button type="button" class="ink-btn ink-btn-sm ink-btn-primary" data-agentops-scenario-action="fill" data-scenario-id="${escapeHtml(item.id)}">${t("Fill input")}</button>
                <button type="button" class="ink-btn ink-btn-sm" data-agentops-scenario-action="edit" data-scenario-id="${escapeHtml(item.id)}">${t("Edit")}</button>
                <button type="button" class="ink-btn ink-btn-sm ink-btn-danger" data-agentops-scenario-action="delete" data-scenario-id="${escapeHtml(item.id)}">${t("Delete")}</button>
            </div>
        </div>
    `).join("");
    setHtml("agentops-scenarios-list", html);
}

async function submitAgentOpsScenario(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const payload = {
        id: form.elements.id.value.trim(),
        title: form.elements.title.value.trim(),
        description: form.elements.description.value.trim() || null,
        input_text: form.elements.input_text.value.trim(),
        expected_skill: form.elements.expected_skill.value.trim() || null,
        tags: normalizeCsv(form.elements.tags.value),
        is_builtin: form.elements.is_builtin.checked,
    };
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
        showAgentOpsWarning(`${t("Scenario save failed")}: ${err.message}`);
    }
}

function handleAgentOpsScenarioClick(e) {
    const btn = e.target.closest("[data-agentops-scenario-action]");
    if (!btn) return;
    const id = btn.dataset.scenarioId;
    const item = agentOpsScenarioItems.find((scenario) => scenario.id === id);
    if (!item) return;

    if (btn.dataset.agentopsScenarioAction === "fill") {
        const input = document.getElementById("aiops-query");
        if (input) {
            input.value = item.input_text || "";
            input.focus();
        }
        switchMainTab("aiops");
    } else if (btn.dataset.agentopsScenarioAction === "edit") {
        fillAgentOpsScenarioForm(item);
    } else if (btn.dataset.agentopsScenarioAction === "delete") {
        if (!confirm(`${t("Delete scenario")} ${id}?`)) return;
        (async () => {
            try {
                await agentOpsRequest(`/agentops/scenarios/${encodeURIComponent(id)}`, { method: "DELETE" });
                resetAgentOpsScenarioForm();
                await loadAgentOpsScenarios();
            } catch (err) {
                showAgentOpsWarning(`${t("Scenario delete failed")}: ${err.message}`);
            }
        })();
    }
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

// ---------- Eval Cases ----------
async function loadAgentOpsEvalCases() {
    try {
        const data = await agentOpsRequest("/agentops/eval-cases");
        agentOpsEvalCaseItems = Array.isArray(data?.items) ? data.items : [];
        renderAgentOpsEvalCases(agentOpsEvalCaseItems);
    } catch (e) {
        agentOpsEvalCaseItems = [];
        showAgentOpsWarning(`${t("Eval cases API unavailable")}: ${e.message}`);
        setHtml("agentops-eval-cases-list",
            `<div class="ink-empty">${t("Eval cases unavailable")}: ${escapeHtml(e.message)}</div>`);
    }
}

function renderAgentOpsEvalCases(items) {
    if (!items.length) {
        setHtml("agentops-eval-cases-list", `<div class="ink-empty">${t("No eval cases yet.")}</div>`);
        return;
    }
    const html = items.map((item) => `
        <div class="ink-list-item">
            <div style="min-width:0;flex:1 1 auto">
                <div class="ink-list-title">${escapeHtml(item.name || item.id)}</div>
                <div class="ink-list-subtitle">
                    <span style="font-family:var(--font-mono)">${escapeHtml(item.id)}</span>
                    ${item.expected_skill ? ` · expected: <span style="font-family:var(--font-mono)">${escapeHtml(item.expected_skill)}</span>` : ""}
                    · ${item.enabled ? t("enabled") : t("disabled")}
                </div>
                <div class="ink-list-tags">${tagsHtml(item.tags)}</div>
                <div class="ink-list-preview">${escapeHtml(item.input_text || "")}</div>
            </div>
            <div class="ink-list-actions">
                <button type="button" class="ink-btn ink-btn-sm" data-agentops-eval-action="toggle" data-case-id="${escapeHtml(item.id)}">${item.enabled ? t("Disable") : t("Enable")}</button>
                <button type="button" class="ink-btn ink-btn-sm" data-agentops-eval-action="edit" data-case-id="${escapeHtml(item.id)}">${t("Edit")}</button>
                <button type="button" class="ink-btn ink-btn-sm ink-btn-danger" data-agentops-eval-action="delete" data-case-id="${escapeHtml(item.id)}">${t("Delete")}</button>
            </div>
        </div>
    `).join("");
    setHtml("agentops-eval-cases-list", html);
}

async function submitAgentOpsEvalCase(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const payload = {
        id: form.elements.id.value.trim(),
        name: form.elements.name.value.trim(),
        input_text: form.elements.input_text.value.trim(),
        expected_skill: form.elements.expected_skill.value.trim() || null,
        expected_tools: normalizeCsv(form.elements.expected_tools.value),
        tags: normalizeCsv(form.elements.tags.value),
        enabled: form.elements.enabled.checked,
    };
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
        showAgentOpsWarning(`${t("Eval case save failed")}: ${err.message}`);
    }
}

function handleAgentOpsEvalCaseClick(e) {
    const btn = e.target.closest("[data-agentops-eval-action]");
    if (!btn) return;
    const id = btn.dataset.caseId;
    const item = agentOpsEvalCaseItems.find((evalCase) => evalCase.id === id);
    if (!item) return;

    if (btn.dataset.agentopsEvalAction === "toggle") {
        (async () => {
            try {
                await agentOpsRequest(`/agentops/eval-cases/${encodeURIComponent(id)}`, {
                    method: "PUT",
                    body: { enabled: !item.enabled },
                });
                await loadAgentOpsEvalCases();
            } catch (err) {
                showAgentOpsWarning(`${t("Eval case toggle failed")}: ${err.message}`);
            }
        })();
    } else if (btn.dataset.agentopsEvalAction === "edit") {
        fillAgentOpsEvalCaseForm(item);
    } else if (btn.dataset.agentopsEvalAction === "delete") {
        if (!confirm(`${t("Delete eval case")} ${id}?`)) return;
        (async () => {
            try {
                await agentOpsRequest(`/agentops/eval-cases/${encodeURIComponent(id)}`, { method: "DELETE" });
                resetAgentOpsEvalCaseForm();
                await loadAgentOpsEvalCases();
            } catch (err) {
                showAgentOpsWarning(`${t("Eval case delete failed")}: ${err.message}`);
            }
        })();
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

// ---------- Eval Results ----------
async function loadAgentOpsEvalResults() {
    try {
        const data = await agentOpsRequest("/agentops/eval-results?limit=20");
        renderAgentOpsEvalResults(Array.isArray(data?.items) ? data.items : []);
    } catch (e) {
        showAgentOpsWarning(`${t("Eval results API unavailable")}: ${e.message}`);
        setHtml("agentops-eval-results-list",
            `<div class="ink-empty">${t("Eval results unavailable")}: ${escapeHtml(e.message)}</div>`);
    }
}

function renderAgentOpsEvalResults(items) {
    if (!items.length) {
        setHtml("agentops-eval-results-list", `<div class="ink-empty">${t("No eval results yet.")}</div>`);
        return;
    }
    const rows = items.map((item) => `
        <tr>
            <td>${escapeHtml(item.mode || "-")}</td>
            <td>${renderBool(item.skill_match)}</td>
            <td>${renderBool(item.has_report)}</td>
            <td>${renderBool(item.has_error)}</td>
            <td>${escapeHtml(formatScore(item.score))}</td>
            <td>${escapeHtml(formatMs(item.duration_ms))}</td>
            <td>${escapeHtml(formatDate(item.created_at))}</td>
        </tr>
    `).join("");
    setHtml("agentops-eval-results-list", `
        <div class="ink-table-wrap">
            <table class="ink-table">
                <thead>
                    <tr>
                        <th>${t("mode")}</th>
                        <th>${t("skill_match")}</th>
                        <th>${t("has_report")}</th>
                        <th>${t("has_error")}</th>
                        <th>${t("score")}</th>
                        <th>${t("duration_ms")}</th>
                        <th>${t("created_at")}</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `);
}

// ---------- Fixtures ----------
// 引用 aiops module 的 offlineFixtureSources,通过全局变量共享
function getOfflineSources() {
    // 使用 window 上的共享引用,由 main.js 连接
    return window._offlineFixtureSources || [];
}

function renderAgentOpsFixtures() {
    const list = document.getElementById("agentops-fixtures-list");
    if (!list) return;
    const sources = getOfflineSources();
    if (!sources.length) {
        list.innerHTML = `
            <div class="ink-note" style="margin-bottom:8px">${t("Offline recorded demo - not a live model/tool call")}</div>
            <div class="ink-empty">${t("No manifest fixtures or latest local recording found.")}</div>
        `;
        return;
    }
    const rows = sources.map((source) => {
        const recordedAt = source.metadata?.recorded_at || "unknown";
        const eventCount = source.eventCount || source.metadata?.event_count || "unknown";
        const kind = source.kind === "localStorage" ? "localStorage latest recording" : "manifest fixture";
        return `
            <div class="ink-list-item">
                <div style="min-width:0">
                    <div class="ink-list-title">${escapeHtml(source.title || source.id)}</div>
                    <div class="ink-list-subtitle" style="color:var(--ink-warn)">
                        ${escapeHtml(kind)} · ${escapeHtml(String(eventCount))} events · recorded at ${escapeHtml(recordedAt)}
                    </div>
                </div>
                <button type="button" class="ink-btn ink-btn-sm" data-agentops-fixture-id="${escapeHtml(source.id)}">${t("Select replay")}</button>
            </div>
        `;
    }).join("");
    list.innerHTML = `
        <div class="ink-note" style="margin-bottom:8px">${t("Offline recorded demo - not a live model/tool call")}</div>
        ${rows}
    `;
}

function handleAgentOpsFixtureClick(e) {
    const btn = e.target.closest("[data-agentops-fixture-id]");
    if (!btn) return;
    const select = document.getElementById("offline-fixture-select");
    if (select) {
        select.value = btn.dataset.agentopsFixtureId;
        select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    switchMainTab("aiops");
}

// ---------- Tab 切换 (调用 main.js 的路由) ----------
function switchMainTab(tabName) {
    window.dispatchEvent(new CustomEvent("switch-tab", { detail: { tab: tabName } }));
}

// ================ 初始化 ================
export function initAgentOps() {
    if (inited) return;
    inited = true;

    // 子导航
    document.querySelectorAll(".ink-subnav-btn[data-agentops-sub]").forEach(btn => {
        btn.addEventListener("click", () => switchSubPage(btn.dataset.agentopsSub));
    });

    // 事件委托
    document.getElementById("agentops-runs-list")?.addEventListener("click", handleAgentOpsRunClick);
    document.getElementById("agentops-scenarios-list")?.addEventListener("click", handleAgentOpsScenarioClick);
    document.getElementById("agentops-eval-cases-list")?.addEventListener("click", handleAgentOpsEvalCaseClick);
    document.getElementById("agentops-fixtures-list")?.addEventListener("click", handleAgentOpsFixtureClick);

    // 场景表单
    const scenarioForm = document.getElementById("agentops-scenario-form");
    if (scenarioForm) scenarioForm.addEventListener("submit", submitAgentOpsScenario);
    document.getElementById("agentops-scenario-reset")?.addEventListener("click", resetAgentOpsScenarioForm);

    // 评测用例表单
    const evalCaseForm = document.getElementById("agentops-eval-case-form");
    if (evalCaseForm) evalCaseForm.addEventListener("submit", submitAgentOpsEvalCase);
    document.getElementById("agentops-eval-case-reset")?.addEventListener("click", resetAgentOpsEvalCaseForm);

    // 刷新按钮
    document.getElementById("agentops-refresh")?.addEventListener("click", () => {
        agentOpsLoaded = false;
        loadAgentOps();
    });

    // 检查 hash 恢复子页
    const hash = window.location.hash;
    const m = hash.match(/^#agentops\/(\w+)/);
    if (m && SUB_PAGES.includes(m[1])) {
        switchSubPage(m[1]);
    } else {
        switchSubPage("overview");
    }

    // 初始加载
    loadAgentOpsIfNeeded();
}

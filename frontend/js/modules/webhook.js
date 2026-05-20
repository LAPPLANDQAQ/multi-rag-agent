// 告警 Webhook 事件列表 — 查看 / 详情 / 转入 AIOps 诊断
import { API } from "../core/api.js";
import { escapeHtml } from "../core/markdown.js";

let inited = false;

async function loadHistory() {
    const listEl = document.getElementById("webhook-list");
    if (!listEl) return;

    listEl.innerHTML = '<div class="ink-empty">加载中...</div>';
    try {
        const resp = await fetch(`${API}/webhook/history?limit=30`);
        const data = await resp.json();
        const items = Array.isArray(data?.items) ? data.items : [];

        if (items.length === 0) {
            listEl.innerHTML = '<div class="ink-empty">暂无告警事件</div>';
            return;
        }

        listEl.innerHTML = "";
        items.forEach((item) => {
            const alert = item.alert || {};
            const name = alert.alertname || "—";
            const severity = alert.severity || "—";
            const instance = alert.instance || "—";
            const summary = alert.summary || "";
            const started = item.started_at ? new Date(item.started_at).toLocaleString() : "—";
            const skill = item.selected_skill || "—";
            const error = !!item.error;
            const hasReport = !!item.report;

            const card = document.createElement("div");
            card.className = "ink-list-item";
            card.innerHTML = `
                <div style="min-width:0;flex:1 1 auto">
                    <div class="ink-list-title">
                        ${escapeHtml(name)}
                        <span class="ink-pill ${severity === 'critical' ? 'ink-pill-fail' : severity === 'warning' ? 'ink-pill-warn' : 'ink-pill-ok'}" style="margin-left:6px">${escapeHtml(severity)}</span>
                        ${error ? '<span class="ink-pill ink-pill-fail" style="margin-left:4px">失败</span>' : ''}
                    </div>
                    <div class="ink-list-subtitle">
                        实例: ${escapeHtml(instance)} · 时间: ${escapeHtml(started)}
                    </div>
                    ${summary ? `<div class="ink-list-preview">${escapeHtml(summary)}</div>` : ""}
                    <div class="ink-list-subtitle">
                        Skill: ${escapeHtml(skill)} · ${hasReport ? "有报告" : "无报告"}
                    </div>
                    <pre class="webhook-detail hidden" style="margin-top:8px;font-size:11px;background:var(--ink-bg-soft);padding:10px;border-radius:6px;overflow:auto;max-height:320px;white-space:pre-wrap;word-break:break-word">${escapeHtml(JSON.stringify(item, null, 2))}</pre>
                </div>
                <div class="ink-list-actions">
                    <button type="button" class="ink-btn ink-btn-sm webhook-toggle-btn">详情</button>
                    <button type="button" class="ink-btn ink-btn-sm ink-btn-primary webhook-fill-btn">转入 AIOps 诊断</button>
                </div>
            `;

            // 详情展开/收起
            const detailPre = card.querySelector(".webhook-detail");
            card.querySelector(".webhook-toggle-btn").addEventListener("click", () => {
                const hidden = detailPre.classList.toggle("hidden");
                card.querySelector(".webhook-toggle-btn").textContent = hidden ? "详情" : "收起";
            });

            // 转入 AIOps
            card.querySelector(".webhook-fill-btn").addEventListener("click", () => {
                const query = item.query || `[${severity.toUpperCase()}] ${name} · ${instance} · ${summary}`;
                const input = document.getElementById("aiops-query");
                if (input) {
                    input.value = query;
                }
                window.dispatchEvent(new CustomEvent("switch-tab", { detail: { tab: "aiops" } }));
            });

            listEl.appendChild(card);
        });
    } catch (e) {
        listEl.innerHTML = `<div class="ink-warning">加载失败: ${escapeHtml(e.message)}</div>`;
    }
}

async function clearHistory() {
    if (!confirm("确定清空所有告警历史?")) return;
    try {
        await fetch(`${API}/webhook/history`, { method: "DELETE" });
        loadHistory();
    } catch (e) {
        alert(`清空失败: ${e.message}`);
    }
}

export function initWebhook() {
    if (inited) return;
    inited = true;

    loadHistory();
    document.getElementById("webhook-refresh")?.addEventListener("click", loadHistory);
    document.getElementById("webhook-clear")?.addEventListener("click", clearHistory);
}

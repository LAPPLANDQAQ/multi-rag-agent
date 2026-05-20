// 顶部健康灯 — 从原 app.js:23-48 搬迁,逻辑保持
import { API } from "../core/api.js";

const HEALTH_INTERVAL_MS = 15000;
let healthTimer = null;

async function checkHealth() {
    const dot = document.getElementById("health-dot");
    const text = document.getElementById("health-text");
    if (!dot || !text) return;
    try {
        const r = await fetch(`${API}/health/ready`);
        const data = await r.json();
        const ready = data?.data?.status === "ready";
        const mcpOk = data?.data?.dependencies?.mcp?.status === "ok";
        if (ready && mcpOk) {
            dot.className = "ink-health-dot is-ok";
            text.textContent = `就绪 · MCP ${data.data.dependencies.mcp.tools_count} 工具`;
        } else if (ready) {
            dot.className = "ink-health-dot is-warn";
            text.textContent = "就绪 · MCP 未连";
        } else {
            dot.className = "ink-health-dot is-error";
            text.textContent = "Milvus 不可用";
        }
    } catch (e) {
        dot.className = "ink-health-dot is-error";
        text.textContent = "服务不可达";
    }
}

export function initHealth() {
    checkHealth();
    if (healthTimer) clearInterval(healthTimer);
    healthTimer = setInterval(checkHealth, HEALTH_INTERVAL_MS);
}

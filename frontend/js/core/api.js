// API 常量与公共 fetch 封装
export const API = "/api/v1";
export const OFFLINE_MANIFEST_URL = "/demo_fixtures/manifest.json";
export const LOCAL_RECORDING_KEY = "multi_rag_agent.latest_aiops_sse_recording.v1";

const KB_ADMIN_TOKEN_KEY = "multi_agent_kb_admin_token";

// 从原 app.js:2103 搬迁,行为完全一致(含 prompt 弹窗)
export function getKbAdminToken() {
    let token = sessionStorage.getItem(KB_ADMIN_TOKEN_KEY) || "";
    if (!token) {
        token = prompt("请输入知识库管理员 Token") || "";
        token = token.trim();
        if (!token) throw new Error("未输入管理员 Token");
        sessionStorage.setItem(KB_ADMIN_TOKEN_KEY, token);
    }
    return token;
}

export function clearKbAdminToken() {
    sessionStorage.removeItem(KB_ADMIN_TOKEN_KEY);
}

// AgentOps 通用请求 — 原 app.js:1081 搬迁
export async function agentOpsRequest(path, options = {}) {
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

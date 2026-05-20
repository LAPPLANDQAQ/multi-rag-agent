// 知识库 — 从原 app.js:2012-2112 搬迁
import { API, getKbAdminToken, clearKbAdminToken } from "../core/api.js";
import { escapeHtml } from "../core/markdown.js";

let inited = false;

export function initDocuments() {
    if (inited) return;
    inited = true;

    const uploadZone = document.getElementById("upload-zone");
    const uploadInput = document.getElementById("upload-input");
    if (!uploadZone || !uploadInput) return;

    uploadZone.addEventListener("click", () => uploadInput.click());
    uploadInput.addEventListener("change", () => uploadInput.files[0] && uploadFile(uploadInput.files[0]));
    uploadZone.addEventListener("dragover", (e) => { e.preventDefault(); uploadZone.classList.add("is-dragover"); });
    uploadZone.addEventListener("dragleave", () => uploadZone.classList.remove("is-dragover"));
    uploadZone.addEventListener("drop", (e) => {
        e.preventDefault();
        uploadZone.classList.remove("is-dragover");
        if (e.dataTransfer.files[0]) uploadFile(e.dataTransfer.files[0]);
    });
    document.getElementById("docs-refresh")?.addEventListener("click", loadDocs);
}

async function uploadFile(file) {
    const uploadResult = document.getElementById("upload-result");
    if (!uploadResult) return;
    uploadResult.innerHTML = `<div style="color:var(--ink-accent-strong)">⏳ 上传 ${escapeHtml(file.name)} ...</div>`;
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
            if (r.status === 401 || r.status === 403) clearKbAdminToken();
            throw new Error(data?.detail || data?.message || `HTTP ${r.status}`);
        }
        if (data.code === "SUCCESS") {
            uploadResult.innerHTML = `<div style="color:var(--ink-success)">✓ 已索引 ${data.data.chunks_indexed} 个 chunk (${data.data.bytes} bytes)</div>`;
            loadDocs();
        } else {
            uploadResult.innerHTML = `<div style="color:var(--ink-error)">✗ ${escapeHtml(data?.message || "上传失败")}</div>`;
        }
    } catch (e) {
        uploadResult.innerHTML = `<div style="color:var(--ink-error)">✗ ${escapeHtml(e.message)}</div>`;
    }
}

export async function loadDocs() {
    const listEl = document.getElementById("docs-list");
    if (!listEl) return;
    listEl.innerHTML = '<div class="ink-empty">加载中...</div>';
    try {
        const r = await fetch(`${API}/documents`);
        const data = await r.json();
        const docs = data?.data?.documents || [];
        if (docs.length === 0) {
            listEl.innerHTML = '<div class="ink-empty">暂无文档,请先上传</div>';
            return;
        }
        listEl.innerHTML = "";
        docs.forEach((d) => {
            const div = document.createElement("div");
            div.className = "doc-card";
            div.innerHTML = `
                <div>
                    <div style="font-weight:600;font-size:13.5px">${escapeHtml(d.source)}</div>
                    <div class="doc-meta">${d.chunk_count} 个 chunk</div>
                </div>
                <button class="ink-btn ink-btn-sm ink-btn-danger" data-source="${escapeHtml(d.source)}">删除</button>
            `;
            div.querySelector("button").addEventListener("click", () => {
                if (confirm(`确认删除 ${d.source}?`)) deleteDoc(d.source);
            });
            listEl.appendChild(div);
        });
    } catch (e) {
        listEl.innerHTML = `<div class="ink-warning">加载失败: ${escapeHtml(e.message)}</div>`;
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
            if (r.status === 401 || r.status === 403) clearKbAdminToken();
            throw new Error(data?.detail || data?.message || `HTTP ${r.status}`);
        }
        loadDocs();
    } catch (e) {
        alert(`删除失败: ${e.message}`);
    }
}

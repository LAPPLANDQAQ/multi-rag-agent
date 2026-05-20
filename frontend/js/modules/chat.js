// RAG 聊天 — 从原 app.js:1652-2007 搬迁,逻辑逐字保留
import { API } from "../core/api.js";
import { consumeSSE } from "../core/sse.js";
import { escapeHtml, renderMarkdown } from "../core/markdown.js";

let inited = false;
let chatWebEnabled = false;
let chatMcpEnabled = true;

export function initChat() {
    if (inited) return;
    inited = true;

    const chatInput = document.getElementById("chat-input");
    const chatSend = document.getElementById("chat-send");
    const chatWebToggle = document.getElementById("chat-web-toggle");
    const chatWebState = document.getElementById("chat-web-state");
    const chatMcpToggle = document.getElementById("chat-mcp-toggle");
    const chatMcpState = document.getElementById("chat-mcp-state");
    if (!chatInput || !chatSend) return;

    function renderChatWebToggle() {
        if (!chatWebToggle) return;
        chatWebToggle.classList.toggle("is-on", chatWebEnabled);
        if (chatWebState) chatWebState.textContent = chatWebEnabled ? "开" : "关";
    }
    function renderChatMcpToggle() {
        if (!chatMcpToggle) return;
        chatMcpToggle.classList.toggle("is-on", chatMcpEnabled);
        if (chatMcpState) chatMcpState.textContent = chatMcpEnabled ? "开" : "关";
    }
    if (chatWebToggle) {
        chatWebToggle.addEventListener("click", () => {
            chatWebEnabled = !chatWebEnabled;
            renderChatWebToggle();
        });
        renderChatWebToggle();
    }
    if (chatMcpToggle) {
        chatMcpToggle.addEventListener("click", () => {
            chatMcpEnabled = !chatMcpEnabled;
            renderChatMcpToggle();
        });
        renderChatMcpToggle();
    }

    chatSend.addEventListener("click", () => sendChat(chatInput, chatSend));
    chatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendChat(chatInput, chatSend);
        }
    });
}

async function sendChat(chatInput, chatSend) {
    const question = chatInput.value.trim();
    if (!question) return;
    chatInput.value = "";

    appendChatMsg("user", question);
    const progressBox = appendChatProgress();
    const thinkingBubble = appendThinkingBubble();
    thinkingBubble.wrap.style.display = "none";
    const assistantBubble = appendChatMsg("assistant", "");
    assistantBubble.parentElement.style.display = "none";
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
                assistantBubble.innerHTML = `<span style="color:var(--ink-error)">错误: ${escapeHtml(ev.message)}</span>`;
            }
        });
        if (!tokenStarted) {
            assistantBubble.parentElement.remove();
        }
        if (!thinkingStarted) {
            thinkingBubble.wrap.remove();
        }
    } catch (e) {
        finalizeChatProgress(progressBox, true);
        assistantBubble.parentElement.style.display = "";
        assistantBubble.innerHTML = `<span style="color:var(--ink-error)">网络错误: ${e.message}</span>`;
    } finally {
        chatSend.disabled = false;
        chatInput.focus();
    }
}

function appendThinkingBubble() {
    const container = document.getElementById("chat-messages");
    const placeholder = container.querySelector(".chat-placeholder");
    if (placeholder) placeholder.remove();

    const wrap = document.createElement("div");
    wrap.className = "chat-row chat-row-assistant";
    wrap.innerHTML = `
      <div class="rag-thinking">
        <div class="rag-thinking-head">
          <span>🧠</span>
          <span class="rag-thinking-title">思考过程</span>
          <span class="rag-thinking-toggle">▼ 收起</span>
        </div>
        <pre class="rag-thinking-content"></pre>
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

function appendChatProgress() {
    const container = document.getElementById("chat-messages");
    const placeholder = container.querySelector(".chat-placeholder");
    if (placeholder) placeholder.remove();

    const wrap = document.createElement("div");
    wrap.className = "chat-row chat-row-assistant";
    wrap.innerHTML = `
      <div class="rag-progress">
        <div class="rag-progress-head">
          <span class="rag-spinner"></span>
          <span>正在检索并生成回答…</span>
        </div>
        <div class="rag-progress-rows"></div>
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
        ? `<span class="rag-progress-elapsed">${ev.elapsed_ms}ms</span>`
        : "";

    const detailsHtml = renderRagStageDetails(ev.stage, ev.data || {});
    const hasDetails = !!detailsHtml;

    const row = document.createElement("div");
    row.className = "rag-progress-row";

    const headLine = document.createElement("div");
    headLine.className = "rag-progress-row-head" + (hasDetails ? " has-details" : "");
    headLine.innerHTML = `
      <span class="rag-stage-icon">${icon}</span>
      <span class="rag-stage-label">${escapeHtml(ev.label || ev.stage || "")}</span>
      ${ev.detail ? `<span class="rag-stage-detail">${escapeHtml(ev.detail)}</span>` : ""}
      ${elapsed}
      ${hasDetails ? `<span class="rag-toggle">▶ 详情</span>` : ""}`;
    row.appendChild(headLine);

    if (hasDetails) {
        const panel = document.createElement("div");
        panel.className = "rag-details hidden";
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
          <div><span class="rag-k">原始:</span> ${escapeHtml(orig)}</div>
          <div><span class="rag-k">改写:</span> ${escapeHtml(rew)}</div>`;
    }
    if (stage === "retrieve_done") {
        const hits = Array.isArray(data.hits) ? data.hits : [];
        if (!hits.length) return `<div class="rag-k">无命中片段</div>`;
        const meta = `<div class="rag-k">top_k=${data.top_k ?? "?"} · ${escapeHtml(data.mode || "")}</div>`;
        const items = hits.map((h, i) => {
            const score = (h.score !== null && h.score !== undefined) ? `<span class="rag-score">score ${h.score}</span>` : "";
            const chap = h.chapter ? ` · 章节: ${escapeHtml(h.chapter)}` : "";
            return `
              <div class="rag-hit">
                <div class="rag-hit-title">${i + 1}. ${escapeHtml(h.source || "未知")} ${score}${chap}</div>
                <div class="rag-hit-preview">${escapeHtml(h.preview || "")}</div>
              </div>`;
        }).join("");
        return meta + items;
    }
    if (stage === "web_done") {
        const results = Array.isArray(data.results) ? data.results : [];
        if (!results.length) {
            const reason = data.skip_reason || "未触发联网";
            return `<div class="rag-k">${escapeHtml(reason)}</div>`;
        }
        const meta = data.provider ? `<div class="rag-k">provider=${escapeHtml(data.provider)}</div>` : "";
        const items = results.map((r, i) => {
            const url = r.url || "";
            const titleEsc = escapeHtml(r.title || "(无标题)");
            const titleHtml = url
                ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="rag-web-link">${titleEsc}</a>`
                : titleEsc;
            return `
              <div class="rag-web">
                <div class="rag-web-title">${i + 1}. ${titleHtml}</div>
                ${url ? `<div class="rag-web-url">${escapeHtml(url)}</div>` : ""}
                <div class="rag-web-snippet">${escapeHtml(r.snippet || "")}</div>
              </div>`;
        }).join("");
        return meta + items;
    }
    if (stage === "stats") {
        return `
          <div>模型: <b>${escapeHtml(data.model || "?")}</b></div>
          <div>输入 tokens: <b>${data.input_tokens ?? 0}</b></div>
          <div>输出 tokens: <b>${data.output_tokens ?? 0}</b></div>
          <div>合计 tokens: <b>${data.total_tokens ?? 0}</b></div>
          <div>生成耗时: <b>${data.llm_ms ?? 0} ms</b></div>
          <div>总耗时: <b>${data.total_ms ?? 0} ms</b></div>
          <div>回答字数: <b>${data.answer_chars ?? 0}</b></div>
          ${data.tools_enabled ? '<div class="rag-ok">工具回合: 已启用</div>' : ''}`;
    }
    if (stage === "llm_start") {
        const tools = Array.isArray(data.tools) ? data.tools : [];
        if (data.tools_enabled && tools.length) {
            const chips = tools.map(name => `<span class="rag-tool-chip">${escapeHtml(name)}</span>`).join("");
            return `
              <div class="rag-k">模型: <b>${escapeHtml(data.model || "?")}</b></div>
              <div class="rag-k">已为模型启用 ${tools.length} 个只读工具, 模型可按需自主调用:</div>
              <div class="rag-tool-chips">${chips}</div>`;
        }
        return `<div class="rag-k">模型: <b>${escapeHtml(data.model || "?")}</b> · 工具回合: 未启用</div>`;
    }
    if (stage === "tool_call") {
        const ok = (data.status || "").toLowerCase() === "ok";
        const statusCls = ok ? "rag-ok" : "rag-err";
        const statusIcon = ok ? "✓" : "✗";
        return `
          <div>工具: <code>${escapeHtml(data.name || "?")}</code></div>
          <div>状态: <span class="${statusCls}">${statusIcon} ${escapeHtml(data.status || "?")}</span></div>
          <div>耗时: <b>${data.elapsed_ms ?? 0} ms</b></div>
          <div>输出: <b>${data.result_chars ?? 0} 字符</b></div>
          ${data.read_only === false ? '<div class="rag-warn">⚠ 非只读工具</div>' : ''}`;
    }
    return "";
}

function finalizeChatProgress(box, failed = false) {
    if (!box) return;
    const head = box.querySelector(".rag-progress-head");
    if (head) {
        head.innerHTML = failed
            ? `<span class="rag-err">✗ 检索流程中断</span>`
            : `<span class="rag-ok">✓ 检索流程完成</span>`;
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
    const placeholder = container.querySelector(".chat-placeholder");
    if (placeholder) placeholder.remove();

    const wrap = document.createElement("div");
    wrap.className = "chat-row " + (role === "user" ? "chat-row-user" : "chat-row-assistant");
    const bubble = document.createElement("div");
    bubble.className = `chat-msg ${role}`;
    bubble.innerHTML = role === "user" ? escapeHtml(content) : renderMarkdown(content);
    wrap.appendChild(bubble);
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
    return bubble;
}

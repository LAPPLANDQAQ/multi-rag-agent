// 极简 HTML 转义 / Markdown 渲染 — 从原 app.js 2172/2182 完整搬迁
export function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export function renderMarkdown(md) {
    if (!md) return "";
    let s = String(md).replace(/\\n/g, "\n").replace(/\\t/g, "\t");
    let h = escapeHtml(s);
    h = h.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code}</code></pre>`);
    h = h.replace(/`([^`\n]+)`/g, "<code>$1</code>");
    h = h.replace(/^### (.+)$/gm, "<h3>$1</h3>");
    h = h.replace(/^## (.+)$/gm, "<h2>$1</h2>");
    h = h.replace(/^# (.+)$/gm, "<h1>$1</h1>");
    h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    h = h.replace(/^[\-\*] (.+)$/gm, "<li>$1</li>");
    h = h.replace(/(<li>[\s\S]*?<\/li>)(\n<li>)/g, "$1$2");
    h = h.replace(/(<li>[\s\S]+?<\/li>)/g, (m) => `<ul>${m}</ul>`);
    h = h.replace(/<\/ul>\s*<ul>/g, "");
    h = h.replace(/\n\n/g, "</p><p>");
    h = h.replace(/\n/g, "<br>");
    return `<p>${h}</p>`;
}

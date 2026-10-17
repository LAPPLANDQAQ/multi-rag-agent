import MarkdownIt from "../../vendor/markdown-it.js";

const markdown = new MarkdownIt({ html: false, breaks: true, linkify: true });
markdown.disable("image");

const legacyBreak = String.raw`(?:\\+\[(?:n|换行)\\*\]|\\*\[(?:n|换行)\]|\\+r\\+n|\\+n|<br\s*/?>)`;

function decodeBreaks(text, code = false) {
    const protectedText = [];
    const save = literal => {
        protectedText.push(literal);
        return `\u0000REPORT_LITERAL_${protectedText.length - 1}\u0000`;
    };
    if (code) text = text.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, save);
    text = text.replace(/(?<![\\A-Za-z0-9_])(?:[A-Za-z]:\\|\\\\(?![nr]\\)[A-Za-z0-9_.-]+\\)(?:[^\\\s<>"'`|#*，。；、（）【】]|\\(?![nr](?:\\|[#*\s]|$)))*/g, save);
    text = text.replace(new RegExp(legacyBreak, "gi"), "\n");
    protectedText.forEach((literal, index) => {
        text = text.replaceAll(`\u0000REPORT_LITERAL_${index}\u0000`, literal);
    });
    return text;
}

// Old recordings and stored reports use several representations of line breaks.
// Keep code spans intact so commands and Windows paths are never unescaped.
export function normalizeReportMarkdown(report) {
    let text = String(report || "").replace(/\r\n?/g, "\n").trim();
    const wrapper = text.match(new RegExp("^```(?:markdown|md)?[ \\t]*(?:\\n|" + legacyBreak + ")([\\s\\S]*?)(?:\\n|" + legacyBreak + ")```$", "i"));
    if (wrapper) text = wrapper[1];
    const blocks = [];
    text = text.replace(/(`{3,}|~{3,})[\s\S]*?\1|(`+)[^\n]*?\2/g, (block, fence) => {
        if (fence && new RegExp("^(?:`{3,}|~{3,})[\\w.+-]*[ \\t]*" + legacyBreak, "i").test(block)) {
            block = decodeBreaks(block, true);
        }
        blocks.push(block);
        return `\u0000REPORT_CODE_${blocks.length - 1}\u0000`;
    });
    text = decodeBreaks(text)
        .replace(/^[ \t]*\\*\[((?:[一二三四五六七八九十]+|\d+)[、.．][^\]\n]+?)\\*\][ \t]*$/gm, "## $1");
    let seenTitle = false;
    text = text.replace(/^[ \t]*#{1,6}[ \t]+(故障诊断报告|诊断报告|(?:Fault )?Diagnosis Report|Diagnostic Report)[ \t]*$/gmi, (_, title) => {
        if (seenTitle) return "";
        seenTitle = true;
        return `# ${title}`;
    });
    let seenTime = false;
    text = text.replace(/^[ \t]*(?:\*\*)?(?:生成时间|Generated at)(?:\*\*)?[ \t]*[:：][^\n]*$/gmi, line => {
        if (seenTime) return "";
        seenTime = true;
        return line.trim();
    });
    text = text.replace(/\n{3,}/g, "\n\n").trim();
    blocks.forEach((block, index) => {
        text = text.replaceAll(`\u0000REPORT_CODE_${index}\u0000`, block);
    });
    return text;
}

export function renderReportMarkdown(report) {
    return markdown.render(normalizeReportMarkdown(report));
}

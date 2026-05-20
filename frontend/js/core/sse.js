// SSE 消费器 — 从原 app.js:2117 完整搬迁,签名与行为不变
export async function consumeSSE(response, onEvent) {
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

    const blockSplit = /\r?\n\r?\n|\n\n/;
    const lineSplit = /\r?\n/;

    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            if (buffer.trim()) parseBlock(buffer);
            break;
        }
        buffer += decoder.decode(value, { stream: true });
        let parts = buffer.split(blockSplit);
        buffer = parts.pop();
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

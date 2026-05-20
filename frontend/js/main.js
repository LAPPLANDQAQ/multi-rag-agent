// 入口 — tab 路由 + lazy module init
import { initHealth } from "./modules/health.js";

const MODULES = {
    aiops:     () => import("./modules/aiops.js"),
    chat:      () => import("./modules/chat.js"),
    documents: () => import("./modules/documents.js"),
    agentops:  () => import("./modules/agentops.js"),
    metrics:   () => import("./modules/metrics.js"),
    webhook:   () => import("./modules/webhook.js"),
};

// 每个 module 各自的 init 函数名 (约定 init + PascalCase)
const INIT_MAP = {
    aiops:     "initAIOps",
    chat:      "initChat",
    documents: "initDocuments",
    agentops:  "initAgentOps",
    metrics:   "initMetrics",
    webhook:   "initWebhook",
};

const loaded = {};
let currentTab = null;

// 共享状态: aiops 模块的 offlineFixtureSources, 供 agentops 模块读取
window._offlineFixtureSources = [];

function switchTab(tabName) {
    if (!MODULES[tabName]) return;
    if (currentTab === tabName) return;

    // UI 切换
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("tab-active"));
    document.querySelector(`.tab-btn[data-tab="${CSS.escape(tabName)}"]`)?.classList.add("tab-active");
    document.querySelectorAll(".tab-pane").forEach(p => p.classList.add("hidden"));
    const pane = document.getElementById(`tab-${tabName}`);
    if (pane) pane.classList.remove("hidden");

    currentTab = tabName;
    window.location.hash = `#${tabName}`;

    // 懒加载 module
    if (!loaded[tabName]) {
        loaded[tabName] = true;
        MODULES[tabName]().then(mod => {
            const initFn = mod[INIT_MAP[tabName]];
            if (initFn) initFn();
        });
    }

    // 每次都 loads skills (skills 模块会在 initSkills 里做幂等)
    if (tabName === "aiops") {
        import("./modules/skills.js").then(m => m.initSkills());
    }
}

// Hash 恢复
function restoreFromHash() {
    const hash = window.location.hash.replace(/^#/, "");
    // agentops 子路由: #agentops/overview → tab=agentops
    const tab = hash.startsWith("agentops/") ? "agentops" : hash;
    if (MODULES[tab]) {
        switchTab(tab);
    } else {
        switchTab("aiops");
    }
}

// 监听跨模块 tab 切换
window.addEventListener("switch-tab", (e) => {
    if (e.detail?.tab) switchTab(e.detail.tab);
});

// 启动
initHealth();
restoreFromHash();
window.addEventListener("hashchange", restoreFromHash);

// 导航点击
document.querySelectorAll(".tab-btn[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

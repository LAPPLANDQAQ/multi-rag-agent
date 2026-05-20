// 中文文案表(只覆盖 AgentOps 等位置需要本地化的英文字符串,
// 其它已经是中文的位置直接写在 module 里。)
const ZH = {
    // AgentOps 控制台
    "AgentOps Console": "AgentOps 控制台",
    "Run persistence, scenarios, evals, and recorded offline demos.": "运行持久化、场景库、评测,以及离线录制回放。",
    "Refresh": "刷新",

    "Overview": "概览",
    "Run History": "运行历史",
    "Demo Scenarios": "场景库",
    "Eval Cases": "评测用例",
    "Eval Results": "评测结果",
    "Offline Fixtures": "离线 Fixtures",

    "Latest 20 persisted diagnosis runs": "最近 20 条已持久化的诊断运行",
    "Fill AIOps input only; never auto-send": "仅填充到 AIOps 输入框,不会自动提交",
    "CRUD plus enable/disable": "支持增删改 / 启用-禁用",
    "Latest 20 offline/live eval outcomes": "最近 20 条离线 / 在线评测结果",
    "Offline recorded demo - not a live model/tool call": "离线录制回放 — 非真实模型 / 工具调用",
    "Offline recorded demo — recorded at unavailable. Not a live model/tool call.": "离线录制回放(录制时间未知) — 非真实模型 / 工具调用",

    // 概览指标
    "Total Runs": "总运行次数",
    "Success Rate": "成功率",
    "Avg Duration": "平均耗时",
    "Tool Calls": "工具调用",
    "Eval Results metric": "评测结果数",
    "Latest Score": "最新分数",

    // 表头
    "status": "状态",
    "selected_skill": "selected_skill",
    "title": "标题",
    "duration_ms": "耗时 ms",
    "events": "事件数",
    "tools": "工具数",
    "created_at": "创建时间",
    "actions": "操作",
    "mode": "模式",
    "skill_match": "Skill 匹配",
    "has_report": "有报告",
    "has_error": "有错误",
    "score": "分数",

    // 操作按钮
    "View report": "查看报告",
    "Delete": "删除",
    "Edit": "编辑",
    "Fill input": "填充到输入",
    "Enable": "启用",
    "Disable": "禁用",
    "Save scenario": "保存场景",
    "Save eval case": "保存评测用例",
    "Clear": "清空",
    "Select replay": "选择回放",

    // 表单
    "scenario id": "场景 id",
    "eval case id": "评测用例 id",
    "name": "名称",
    "expected_skill hint": "预期 Skill (提示)",
    "expected_skill": "预期 Skill",
    "expected tools, comma separated": "预期工具(逗号分隔)",
    "tags, comma separated": "标签(逗号分隔)",
    "scenario input": "场景输入",
    "eval input": "评测输入",
    "description": "描述",
    "builtin": "内置",
    "enabled": "启用",

    // 加载 / 空状态
    "Loading summary...": "正在加载概览...",
    "Loading run history...": "正在加载运行历史...",
    "Loading scenarios...": "正在加载场景库...",
    "Loading eval cases...": "正在加载评测用例...",
    "Loading eval results...": "正在加载评测结果...",
    "Loading offline fixture index...": "正在加载离线 fixture 索引...",
    "No diagnosis runs persisted yet.": "暂无已持久化的诊断运行。",
    "No demo scenarios yet.": "暂无场景。",
    "No eval cases yet.": "暂无评测用例。",
    "No eval results yet.": "暂无评测结果。",
    "No manifest fixtures or latest local recording found.": "未找到任何 manifest fixture 或本地最近录制。",
    "no tags": "无标签",

    // 失败提示
    "Summary unavailable": "概览不可用",
    "Run history unavailable": "运行历史不可用",
    "Scenarios unavailable": "场景库不可用",
    "Eval cases unavailable": "评测用例不可用",
    "Eval results unavailable": "评测结果不可用",
    "Summary API unavailable": "概览接口不可用",
    "Run history API unavailable": "运行历史接口不可用",
    "Demo scenarios API unavailable": "场景库接口不可用",
    "Eval cases API unavailable": "评测用例接口不可用",
    "Eval results API unavailable": "评测结果接口不可用",
    "Scenario save failed": "场景保存失败",
    "Scenario delete failed": "场景删除失败",
    "Eval case save failed": "评测用例保存失败",
    "Eval case delete failed": "评测用例删除失败",
    "Eval case toggle failed": "评测用例启用切换失败",
    "Run delete failed": "运行删除失败",

    // 确认对话
    "Delete diagnosis run": "确定删除诊断运行",
    "Delete scenario": "确定删除场景",
    "Delete eval case": "确定删除评测用例",
};

export function t(key, fallback) {
    if (key in ZH) return ZH[key];
    return fallback ?? key;
}

# 版本更新记录

更新时间：2026-05-20  
范围：AgentOps / EvalOps 增强、前端控制台重构、RAG 流式稳定性修复、验证与演示资料整理。

## 更新概览

本轮整理将原本分散的计划、基线、评估、演示和边界说明收敛到这一份版本记录中。文档重点从过程记录调整为结果说明，保留可验证的工程事实、运行方式、限制和第三方来源，去掉与具体开发工具相关的表达。

核心变化：

- 保留原有 Skill-first AIOps/RAG 诊断链路，不重写 LangGraph 主流程。
- 增加 AgentOps 数据层、REST API、运行历史、场景库、评测用例和评测结果管理。
- 增加 EvalOps 离线评估入口，基于已审核的真实 SSE 录制文件生成确定性报告。
- 增加 Prometheus 风格指标、可选 Memory/Redis 缓存、pytest 回归测试和 GitHub Actions CI。
- 前端从单文件脚本和样式整理为模块化结构，并重新组织为诊断、RAG、知识库、AgentOps、指标和告警等工作区。
- RAG Chat 在模型或工具执行失败时改为可降级收尾，避免检索流程被直接中断。

## 后端与运行数据

AgentOps 采用 SQLite / SQLAlchemy 作为本地持久层，覆盖诊断运行、场景、评测用例和评测结果等实体。相关 API 挂载在 `/api/v1/agentops/*`，用于控制台查询、创建、编辑和删除本地记录。

诊断运行持久化采用旁路写入方式接入现有 SSE 流。写入失败不会改变原有诊断响应，运行记录可通过控制台和 API 查看，适合本地演示、回归核对和运行留痕。

EvalOps 通过 `scripts/run_agent_eval.py` 读取 `frontend/demo_fixtures/manifest.json` 中登记的真实录制文件。当前仓库默认不提交真实运行数据，空样本时会生成 `sample_size = 0` 的报告，用于验证评估路径、报告格式和结果入库流程，不夸大模型或检索质量。

## 前端重构

前端页面已重新设计并模块化：

- 入口保留 `frontend/index.html`，静态资源拆分到 `frontend/js/` 与 `frontend/styles/`。
- 核心工具位于 `frontend/js/core/`，包括 API 请求、SSE 解析、Markdown 渲染和本地文案。
- 业务模块位于 `frontend/js/modules/`，覆盖 AIOps 诊断、RAG 聊天、知识库、AgentOps、指标、健康检查、技能列表和告警。
- 样式拆分为 `tokens.css`、`base.css`、`components.css`，保留旧版关键 class 兼容现有交互逻辑。
- 页面导航包括 AIOps 诊断、RAG 聊天、知识库、AgentOps 控制台、指标和告警，适合本地一站式演示。

诊断页继续支持 SSE 事件监控、步骤流、工具调用、token 统计、最终报告、Markdown 导出、真实 SSE 录制和离线回放。AgentOps 控制台提供概览、运行历史、场景库、评测用例、评测结果和离线 Fixtures。

## RAG 稳定性修复

本轮修复了 RAG Chat 在模型调用或工具执行异常时直接中断的问题。现在流式接口会输出降级进度事件、给出可展示的降级回答，并正常发送统计信息，前端不会再把整条检索流程判定为硬失败。

相关覆盖：

- `app/services/rag_service.py`：增加模型降级回答，统一处理工具执行器和普通流式模型异常。
- `app/runtime/agent_harness.py`：补充用户可处理类错误识别，便于上层展示更清晰的失败原因。
- `tests/test_rag_service_degradation.py`：覆盖工具执行器失败和普通模型流失败两类路径。

## 性能与评估口径

项目保留原有 benchmark 与 RAG 离线评估口径，覆盖输入 token、工具执行延迟和检索准确率三类指标：

| 指标 | 结果 |
|---|---|
| Planner 输入 tokens | `9098 -> 575`，下降 93.5% |
| 全链路输入 tokens | `10526 -> 2450`，下降 76.7% |
| 全链路 total tokens | `11889 -> 3988`，下降 66.5% |
| 工具 catalog 输入 tokens | 下降 55.3% |
| 只读工具并行执行 | `1.06s -> 0.22s`，加速 4.88x，延迟下降 79.5% |
| RAG 文档规模 | 954 个文档 / 4080 个 chunks |
| RAG R@1 | `83.33% -> 91.67%` |
| RAG MRR | `0.882 -> 0.938` |
| 默认 top_k=3 R@3 | 95.83% |

说明：

- token 数据依赖真实模型服务返回的 `usage` 字段。
- 工具并行数据来自 5 个独立只读工具的受控基准测试。
- RAG 数据来自 24 题黄金集和 954 文档规模的离线评估。
- 当前 EvalOps 空样本报告只验证评估链路，不替代上述历史 benchmark。

## 验证记录

最近一次本地核对：

| 命令 | 结果 |
|---|---|
| `python -m compileall -q app mcp_servers scripts` | 通过 |
| `pytest -q` | 46 passed |
| `python -m pip check` | No broken requirements found |

备注：Windows 环境下 pytest 结束后可能出现临时目录清理权限警告，但命令退出码为 0，不影响测试结果。

前期集成阶段还验证过 Skill 文件、AgentOps 数据库初始化、离线评估空样本报告、Node 依赖安装/审计/构建和 CI 工作流。公开展示时应以当前机器重新运行的结果为准。

## 演示流程

推荐本地演示顺序：

1. 启动后端与静态前端，打开 `http://localhost:9900`。
2. 在 AIOps 诊断页输入安全的公开场景，观察 Skill 选择、计划、工具调用、usage、报告和完成事件。
3. 切换到 AgentOps 控制台，查看运行历史、场景库、评测用例、评测结果和离线 Fixtures。
4. 如已有审核后的真实 SSE 录制文件，运行 `python scripts\run_agent_eval.py --mode offline` 生成离线评估报告。
5. 打开 `/metrics` 查看运行指标，使用 `pytest -q` 展示回归测试结果。

演示限制：

- 没有真实录制文件时，离线回放和离线评估不会伪造样本。
- 模型服务、Milvus、Redis、Docker、open-webSearch 等外部依赖不可用时，应说明当前展示的是可用子系统。
- `/metrics` 为 Prometheus 风格指标，不等同于完整链路追踪。
- Redis 是可选缓存，未配置时使用保守的内存或空实现路径。

## 来源与许可

本仓库按 MIT License 口径维护。集成或参考的第三方开源资产需要保留各自许可和署名：

- `open-webSearch-main/`：Aas-ee/open-webSearch，本地搜索 daemon，Apache License 2.0。
- `data/kb_corpus/awesome-prometheus-alerts/`：Prometheus 告警语料，CC BY 4.0。
- 早期工程基础参考了 Kkkirito-123/mutil-rag-agent。
- OnCall 场景、诊断流程和部分表达参考了小林 OnCall Agent 项目。

公开发布、二次分发或展示时，应保留必要的第三方署名、许可文件和来源说明。

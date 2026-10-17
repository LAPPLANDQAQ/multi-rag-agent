# 本地部署与使用

部署目录：`C:\Users\wth\Desktop\new\multi-rag-agent`

源码：<https://github.com/LAPPLANDQAQ/multi-rag-agent>，提交 `be28b46c7e1c386b67e023f450d04914665601e5`。

## 打开项目

- 控制台：<http://localhost:9900>
- API 文档：<http://localhost:9900/docs>
- 就绪检查：<http://localhost:9900/api/v1/health/ready>
- 运行指标：<http://localhost:9900/metrics>
- Milvus 管理页 Attu：<http://localhost:8000>，容器内 Milvus 地址为 `standalone:19530`。
- MinIO 管理页：<http://localhost:19001>，沿用原仓库的本地演示账号 `minioadmin` / `minioadmin`。

## 启动与停止

先确保 Docker Desktop 正常运行，然后双击项目根目录的 `start-local.cmd`。脚本会等待应用就绪，再用系统默认浏览器打开前端；服务已经运行时，再次双击也会打开页面。

也可以在 PowerShell 中运行：

```powershell
cd C:\Users\wth\Desktop\new\multi-rag-agent
powershell -NoProfile -ExecutionPolicy Bypass -File .\start-local.ps1
```

仅启动服务、不打开浏览器时，在上述命令末尾加 `-NoBrowser`。如启动失败，CMD 窗口会保留错误信息。

停止本次部署：双击 `stop-local.cmd`，或运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\stop-local.ps1
```

停止脚本根据本次部署记录的进程 ID、启动时间和程序路径停止进程及子进程，保留知识库、会话和运行记录。再次启动无需重复导入知识库。

本次部署使用 `compose.local.yml` 和独立项目名 `multi-rag-agent-local`。请使用上述脚本，避免直接运行原始 Compose 命令而与 `C:\code\multi-rag-agent` 的旧容器重名。

## 已部署组件

| 组件 | 本地端口或路径 |
| --- | --- |
| Python 3.12 项目虚拟环境 | `.venv` |
| FastAPI 与前端 | `127.0.0.1:9900` |
| 系统资源 MCP | `127.0.0.1:8005/mcp` |
| 联网搜索 MCP | `127.0.0.1:8006/mcp` |
| Windows 事件日志 MCP | `127.0.0.1:8008/mcp` |
| 网络诊断 MCP | `127.0.0.1:8009/mcp` |
| Docker 诊断 MCP | `127.0.0.1:8011/mcp` |
| open-webSearch | `127.0.0.1:3210`，本机 Node.js 运行 |
| 浏览器搜索回退 | Playwright、Chromium、FFmpeg |
| Milvus | `127.0.0.1:19530`，健康检查 `9091` |
| etcd 与 MinIO 存储 API | Docker 内部网络 |
| MinIO 管理页 | `127.0.0.1:19001` |
| Attu | `127.0.0.1:8000` |
| Redis | `127.0.0.1:6379`，已开启聊天记忆 |
| AgentOps SQLite | `data/agentops.db`，已初始化四张业务表 |

Docker 容器名统一以 `multi-rag-local-` 开头，数据持久化到当前项目的 `volumes/`。应用、MCP 和暴露的数据库端口仅绑定本机回环地址。

Python 的实际安装版本记录在 `requirements.local.lock.txt`；Node 依赖版本记录在 `open-webSearch-main/package-lock.json`。

## 模型与管理员令牌

本地 `.env` 已配置用户提供的 DashScope Key，文件已被 Git 忽略。

- 对话与路由：`qwen-max`。原默认 `qwen-turbo` 实测返回 HTTP 429，故改用已通过验证的模型。
- 向量化：`text-embedding-v4`，1024 维。
- 精排：`gte-rerank-v2`。
- 管理员令牌：`.env` 中的 `KB_ADMIN_TOKEN`，已随机生成。上传或删除文档时，前端弹窗要求填写此值。
- 搜索服务无需额外 API Key。公开仓库下载无需登录 GitHub。

若修改 `.env`，请使用停止、启动脚本重启服务。云模型调用使用该 Key 所属账户的额度。

## RAG 聊天联网

本机已设置 `RAG_CHAT_WEB_SEARCH_ENABLED=true`，允许页面的「联网」开关生效；页面默认仍关闭联网，按需开启即可。「联网」与「MCP」是独立开关，关闭 MCP 也能搜索公开资料。联网使用本地 open-webSearch，无需额外 API Key。

本机搜索引擎设为 `OPEN_WEBSEARCH_ENGINE=duckduckgo`、`OPEN_WEBSEARCH_SEARCH_MODE=request`，通过现有 Node 搜索服务获取结果，已验证中英文查询均能返回真实资料。Bing 在本机出现连接关闭，百度中文查询触发验证码，因此当前使用已验证的 DuckDuckGo 通道。

搜索等待时间设为 `OPEN_WEBSEARCH_TIMEOUT_SEC=90`，以容纳普通请求失败后的浏览器搜索回退。网络或搜索引擎响应慢时，页面会保持联网阶段提示；引擎失败会返回失败原因。有正常结果时保留部分成功。

联网修复已通过完整 97 项 Python 测试、5 项搜索服务回归测试及 TypeScript 编译。已实测「仅联网」和「联网 + MCP」两种模式，中文查询都返回 3 条真实结果并完成回答。验证摘要见 `logs/rag-web-verification.json`，页面截图见 `logs/rag-web-fixed.png`。

## 知识库与验证证据

内置语料为 954 份公开 Markdown 文档，4080 个片段已全部导入。完整停止、启动后再次核对，954 份文档和 4080 个有效向量均保留，Redis 会话与 AgentOps 运行记录也已恢复。导入前逐文件校验了公开 Git blob，来源记录见 `logs/kb-provenance.json`；入库进度和完成记录见 `logs/ingest-kb.log`。

本地验证记录包括：

- Python 依赖一致性检查及 46 项仓库回归测试。
- 五个 MCP 服务共 15 个工具的发现，以及每个服务的真实只读调用；结果见 `logs/mcp-verification.json`。
- 浏览器执行公共网站 DNS / HTTPS 诊断并生成真实报告。
- RAG 流式问答和 Redis 会话持久化；事件见 `logs/rag-check-events.json`。
- 知识库上传鉴权：未提供管理员令牌时返回 403，使用正确令牌上传成功；临时测试文档已删除。
- AgentOps 已保存一次成功的真实 DNS 诊断；报告见 `logs/deployment-dns-report.md`。
- 已添加 `deployment_dns` 演示场景、评测用例及真实 SSE 录制，可在前端离线回放。录制保留真实事件和总耗时；API 验证录制未保存逐事件时间间隔。
- EvalOps 已对这一个真实录制样本完成离线评估并入库；结果见 `logs/deployment-eval-report.md`。这是部署功能验证，不代表大样本质量基准。

健康巡检可运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\smoke_check.ps1
```

## 本机兼容处理

1. Windows 将 9001 包含在系统保留端口范围内，因此 MinIO 管理页映射为 19001。
2. Docker Desktop 首次启动被失效的 AF_UNIX 套接字阻塞。已将以下运行时目录改名备份后恢复引擎，未删除镜像、容器或数据卷：
   - `C:\Users\wth\AppData\Local\Docker\run.before-multi-rag-20261017-164024`
   - `C:\Users\wth\AppData\Local\docker-secrets-engine.before-multi-rag-20261017-164024`
   相同错误可参考 Docker 官方仓库的 [问题记录](https://github.com/docker/desktop-feedback/issues/460)。
3. 原始启动流程未初始化 AgentOps 数据表；`start-local.ps1` 已补上幂等初始化。
4. 本地启动和停止脚本已处理 Windows PowerShell 5.1 的 JSON 数组兼容问题，并验证了进程及子进程完整停止。

日志位于 `logs/`，各进程分别保存 `*.out.log` 和 `*.err.log`。

完整部署验证摘要见 `logs/deployment-verification.json`，浏览器实测截图见 `logs/deployment-ui.png`。

## 报告显示与观测数据

中英文告警生成的报告统一使用五个章节：问题概述、根因分析、关键证据、处置建议、结论。后端在发送和保存报告前统一换行格式；前端也兼容历史报告里的转义换行及 `[换行]` 占位符。AIOps 和 AgentOps 共用本地 Markdown-it 渲染器，支持标题、列表、代码块和表格，无需访问 CDN。

指标页展示本次后端启动以来的诊断次数、成功次数、平均耗时和工具调用数，每 15 秒刷新；后端重启后计数从零开始，有两次采样后显示趋势。AgentOps 中的历史运行记录持续保存在 SQLite。

告警页只显示 Alertmanager 推送到 Webhook 后触发的自动诊断记录，没有接入或尚未推送告警时为空是正常状态。手动发起的诊断请在 AgentOps 中查看。

本次界面修复通过 79 项 Python 测试和 25 项 Node 测试，并实测中英文公共 DNS 诊断、报告入库、历史报告显示及观测页面。验证摘要见 `logs/ui-fixes-verification.json`；报告和指标截图分别为 `logs/report-format-fixed.png`、`logs/metrics-fixed.png`。

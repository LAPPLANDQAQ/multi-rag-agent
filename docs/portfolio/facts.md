# Portfolio Facts Baseline

Collection time: 2026-05-17T22:00:39+08:00  
Git commit: `801c7453c19f5e6f6793d1e17df69193b1772acd`  
Scope: Phase A factual baseline for interview packaging. Runtime facts are separated from code-inspection facts.

## Source Rules

- P0 sources used: local `.env`, command output, repository working tree.
- P1 sources used: `app/config.py`, `app/core/reranker.py`, `app/skills/definitions/*/SKILL.md`, `app/services/aiops_service.py`, `app/api/v1/aiops.py`, frontend SSE consumer code.
- Runtime `/api/v1/skills` was attempted but unavailable during collection.
- Secret values from `.env` were inspected only for presence/configuration and are not reproduced here.

## Environment Snapshot

| Fact | Value | Command or source | Sample size | Commit | Collected at |
|---|---:|---|---:|---|---|
| Python | `Python 3.12.9` | `.\.venv\Scripts\python.exe --version` | n=1 command | `801c745` | 2026-05-17T21:58+08:00 |
| Node.js | `v24.14.0` | `node --version` | n=1 command | `801c745` | 2026-05-17T21:58+08:00 |
| Docker CLI | `Docker version 29.4.3, build 055a478` | `docker --version` | n=1 command | `801c745` | 2026-05-17T21:58+08:00 |
| Docker Compose | `Docker Compose version v5.1.3` | `docker compose version` | n=1 command | `801c745` | 2026-05-17T22:00+08:00 |
| Docker config warning | `C:\Users\wth\.docker\config.json: Access is denied` | Docker commands | n=2 commands | `801c745` | 2026-05-17T21:58-22:00+08:00 |

Docker is installed, but local Docker config access produced a warning. Treat Docker-dependent demo claims as requiring a fresh smoke check before interview use.

## Runtime Endpoint Availability

| Endpoint | Result | Command or source | Sample size | Commit | Collected at |
|---|---|---|---:|---|---|
| `GET http://localhost:9900/api/v1/skills` | Unavailable: request timed out | `Invoke-RestMethod -Uri http://localhost:9900/api/v1/skills -TimeoutSec 3` | n=1 request | `801c745` | 2026-05-17T21:59+08:00 |

Runtime skill list is not captured in Phase A. Use the code-inspected Skill list below until the service is running.

## Local Skill Definitions

Source: `app/skills/definitions/*/SKILL.md`  
Sample size: n=4 Skill files  
Commit: `801c7453c19f5e6f6793d1e17df69193b1772acd`  
Collected at: 2026-05-17T21:59+08:00

| Skill | Risk | Allowed tools | Trigger evidence |
|---|---|---|---|
| `container_diagnosis` | `medium` | `search_knowledge_base`, `get_current_time`, `docker_ps`, `docker_stats`, `docker_logs`, `docker_inspect`, `docker_restart`, `web_search` | Docker/container/Milvus/restart/log keywords |
| `generic_oncall` | `low` | `search_knowledge_base`, `get_current_time`, local system tools, Windows event query, network tools, Docker read tools, `web_search` | generic/oncall/uncertain troubleshooting keywords |
| `host_resource_diagnosis` | `low` | `search_knowledge_base`, `get_current_time`, `get_local_system_overview`, `get_local_cpu_memory`, `get_local_disk_usage`, `list_top_processes`, `query_windows_event`, `web_search` | local machine, CPU, memory/OOM, disk/full keywords |
| `network_diagnosis` | `low` | `search_knowledge_base`, `get_current_time`, `ping_host`, `http_check`, `dns_lookup`, `check_port`, `web_search` | network, DNS, HTTP timeout, 502/503/504, port/firewall keywords |

The `container_diagnosis` Skill includes `docker_restart`, but the tool is marked high-risk in `app/tools/meta.py` and gated by Docker restart configuration below.

### Phase G Code-Inspection Update

Collection time: 2026-05-17T22:44:39+08:00  
Working tree status: uncommitted Phase G addition  
Sources: `app/skills/definitions/database_connection_diagnosis/SKILL.md`, `scripts/validate_skill.py`, and validator command output  
Runtime status: `/api/v1/skills` confirmation not captured because the local FastAPI service was unavailable during smoke checks.

| Skill | Risk | Allowed tools | Validation evidence |
|---|---|---|---|
| `database_connection_diagnosis` | `low` | `search_knowledge_base`, `get_current_time`, `dns_lookup`, `ping_host`, `check_port`, `http_check` | `.\.venv\Scripts\python.exe scripts\validate_skill.py app\skills\definitions\database_connection_diagnosis\SKILL.md` passed after the staged Skill was moved into `definitions/`. |

## RAG And Search Configuration

Sources:
- `.env`
- `app/config.py`
- `app/core/reranker.py`

Sample size: n=1 local config file plus n=1 effective settings import  
Commit: `801c7453c19f5e6f6793d1e17df69193b1772acd`  
Collected at: 2026-05-17T21:59+08:00

| Setting | `.env` observed | Effective/default source | Value recorded |
|---|---|---|---|
| `RAG_TOP_K` | present | `settings.rag_top_k` | `3` |
| `RAG_RETRIEVE_K` | not present | `Settings.rag_retrieve_k` default | `20` |
| `RAG_HYBRID_ENABLED` | present | `settings.rag_hybrid_enabled` | `True` |
| `RAG_HYBRID_BM25_WEIGHT` | not present | `Settings.rag_hybrid_bm25_weight` default | `0.4` |
| `RAG_RERANK_ENABLED` | present | `settings.rag_rerank_enabled` | `True` |
| `RAG_RERANK_MODEL` | present | `settings.rag_rerank_model` and `app/core/reranker.py` | `gte-rerank-v2` |
| `RAG_RERANK_TIMEOUT_SEC` | not present | `Settings.rag_rerank_timeout_sec` default | `8.0` |
| `RAG_BM25_REFRESH_ON_UPLOAD` | not present | `Settings.rag_bm25_refresh_on_upload` default | `True` |
| `MILVUS_HOST` | present | `settings.milvus_host` | `localhost` |
| `MILVUS_PORT` | present | `settings.milvus_port` | `19530` |
| `MILVUS_COLLECTION` | present | `settings.milvus_collection` | `multi_agent_kb` |
| `REDIS_URL` | present | `settings.redis_url` | `redis://localhost:6379/0` |
| `WEB_SEARCH_PROVIDER` | present | `settings.web_search_provider` | `open_websearch` |
| `OPEN_WEBSEARCH_BASE_URL` | present | `settings.open_websearch_base_url` | `http://127.0.0.1:3210` |
| `OPEN_WEBSEARCH_ENGINE` | present | `settings.open_websearch_engine` | `bing` |
| `OPEN_WEBSEARCH_SEARCH_MODE` | present | `settings.open_websearch_search_mode` | `auto` |
| `OPEN_WEBSEARCH_TIMEOUT_SEC` | present | `settings.open_websearch_timeout_sec` | `15.0` |

Do not claim a runtime-selected RAG strategy beyond these inspected configuration values unless a live request confirms the emitted path.

## Knowledge Base Dry Run

Command: `.\.venv\Scripts\python.exe scripts\ingest_kb_corpus.py --dry-run --limit 5`  
Sample size: n=5 Markdown files  
Commit: `801c7453c19f5e6f6793d1e17df69193b1772acd`  
Collected at: 2026-05-17T21:59:14+08:00

Result:
- Scanned 5 `.md` files.
- Split 5 files into 27 chunks.
- Failures: 0.
- Dry-run mode did not write to Milvus.
- Example sources included `redis_oncall_sop.md`, `mysql_oncall_sop.md`, `common_alerts.md`, and the first two `awesome-prometheus-alerts` Markdown files.

This is a smoke-level ingestion check only, not a benchmark.

## Docker Restart Permission

Sources:
- `.env`
- `app/config.py`
- `mcp_servers/docker_server.py`
- `app/tools/meta.py`

Sample size: n=4 local files  
Commit: `801c7453c19f5e6f6793d1e17df69193b1772acd`  
Collected at: 2026-05-17T21:59+08:00

- `DOCKER_ALLOW_RESTART` is not present in `.env`.
- Effective `settings.docker_allow_restart` is `False`.
- `mcp_servers/docker_server.py` defaults `DOCKER_ALLOW_RESTART` to false unless the environment sets it to a truthy value.
- `app/tools/meta.py` marks `docker_restart` as non-read-only, non-concurrency-safe, destructive, and `risk_level="high"`.

Do not demonstrate or claim autonomous container restart unless it is explicitly enabled and manually approved for a safe target.

## MCP Servers And Startup Ports

Sources: `mcp_servers/*.py`, `run.ps1`, `app/config.py`  
Sample size: n=5 MCP server scripts  
Commit: `801c7453c19f5e6f6793d1e17df69193b1772acd`  
Collected at: 2026-05-17T22:00+08:00

| Server script | Port | Config URL | Startup source |
|---|---:|---|---|
| `mcp_servers/system_server.py` | `8005` | `http://localhost:8005/mcp` | `run.ps1` starts `system_server` |
| `mcp_servers/websearch_server.py` | `8006` | `http://localhost:8006/mcp` | `run.ps1` starts `websearch_server` |
| `mcp_servers/winlog_server.py` | `8008` | `http://localhost:8008/mcp` | `run.ps1` starts `winlog_server` |
| `mcp_servers/network_server.py` | `8009` | `http://localhost:8009/mcp` | `run.ps1` starts `network_server` |
| `mcp_servers/docker_server.py` | `8011` | `http://localhost:8011/mcp` | `run.ps1` starts `docker_server` |

`run.ps1` also starts FastAPI with `uvicorn app.main:app` on `.env`/default port `9900`.

## Benchmark And Eval Script Presence

Commands:
- `rg --files scripts docs app open-webSearch-main | rg -i "(benchmark|bench|eval|evaluate|metrics|recall|mrr)"`
- `rg -n -i "benchmark|bench|eval|evaluate|metrics|recall|mrr" README.md docs scripts app open-webSearch-main\package.json`

Sample size: repository file search, n=1 run per command  
Commit: `801c7453c19f5e6f6793d1e17df69193b1772acd`  
Collected at: 2026-05-17T22:00+08:00

Findings:
- No `tests/` directory is present.
- No obvious benchmark/eval script was found under `scripts/` or `docs/`.
- `open-webSearch-main/package.json` contains Node test scripts, but they are open-webSearch tests, not this project's RAG benchmark.
- `README.md` currently contains benchmark claims and RAG MRR numbers. These are not locally reproduced in Phase A.

Resume-facing metric claims should wait for `docs/portfolio/benchmark_local.md` in Phase B.

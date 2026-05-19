# V5 Upgrade Baseline

## Repository Snapshot

- Commit hash: `5058568fbb72ecda19a53bca5e20ba79da2b5aa7`
- Branch: `docs/freeze-v5-baseline`
- Collection time: `2026-05-19T08:49:50.9939371+08:00`
- Working tree status: clean before creating this baseline document (`git status --short` returned no output).

## Startup Commands

- Docker dependencies:

  ```powershell
  docker compose up -d
  ```

  Starts Milvus, etcd, MinIO, Attu, Redis, and open-webSearch from `docker-compose.yml`.

- Knowledge base dry-run:

  ```powershell
  python scripts\ingest_kb_corpus.py --dry-run
  ```

  Full Milvus ingestion path, when intentionally writing data:

  ```powershell
  python scripts\ingest_kb_corpus.py --reset
  ```

- App startup:

  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File .\run.ps1
  ```

  Default local endpoints:

  | Service | URL |
  | --- | --- |
  | FastAPI / Web UI | `http://localhost:9900` |
  | system MCP | `http://localhost:8005/mcp` |
  | websearch MCP | `http://localhost:8006/mcp` |
  | winlog MCP | `http://localhost:8008/mcp` |
  | network MCP | `http://localhost:8009/mcp` |
  | docker MCP | `http://localhost:8011/mcp` |
  | open-webSearch | `http://127.0.0.1:3210` |

- Smoke check:

  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\smoke_check.ps1
  ```

## Current API Routers

`app/main.py` registers these routers with `API_PREFIX = "/api/v1"`:

- `health.router`
- `chat.router`
- `aiops.router`
- `documents.router`
- `skills.router`
- `webhook.router`

It also mounts `frontend/` as the static HTML root with `StaticFiles(..., html=True)`.

Current route surface under `/api/v1`:

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/health` | `app/api/v1/health.py` |
| `GET` | `/health/ready` | `app/api/v1/health.py` |
| `POST` | `/chat/stream` | `app/api/v1/chat.py` |
| `GET` | `/chat/sessions/{session_id}/history` | `app/api/v1/chat.py` |
| `DELETE` | `/chat/sessions/{session_id}` | `app/api/v1/chat.py` |
| `POST` | `/aiops/diagnose` | `app/api/v1/aiops.py` |
| `POST` | `/documents/upload` | `app/api/v1/documents.py` |
| `GET` | `/documents` | `app/api/v1/documents.py` |
| `DELETE` | `/documents/{source}` | `app/api/v1/documents.py` |
| `GET` | `/skills` | `app/api/v1/skills.py` |
| `POST` | `/webhook/alertmanager` | `app/api/v1/webhook.py` |
| `GET` | `/webhook/history` | `app/api/v1/webhook.py` |
| `DELETE` | `/webhook/history` | `app/api/v1/webhook.py` |

## Current Skills

Directories under `app/skills/definitions/`:

| Directory | `name` | `risk_level` | `allowed_tools` |
| --- | --- | --- | --- |
| `container_diagnosis` | `container_diagnosis` | `medium` | `search_knowledge_base`, `get_current_time`, `docker_ps`, `docker_stats`, `docker_logs`, `docker_inspect`, `docker_restart`, `web_search` |
| `database_connection_diagnosis` | `database_connection_diagnosis` | `low` | `search_knowledge_base`, `get_current_time`, `dns_lookup`, `ping_host`, `check_port`, `http_check` |
| `generic_oncall` | `generic_oncall` | `low` | `search_knowledge_base`, `get_current_time`, `get_local_system_overview`, `get_local_cpu_memory`, `get_local_disk_usage`, `list_top_processes`, `web_search`, `query_windows_event`, `ping_host`, `http_check`, `dns_lookup`, `check_port`, `docker_ps`, `docker_stats`, `docker_logs`, `docker_inspect` |
| `host_resource_diagnosis` | `host_resource_diagnosis` | `low` | `search_knowledge_base`, `get_current_time`, `get_local_system_overview`, `get_local_cpu_memory`, `get_local_disk_usage`, `list_top_processes`, `query_windows_event`, `web_search` |
| `network_diagnosis` | `network_diagnosis` | `low` | `search_knowledge_base`, `get_current_time`, `ping_host`, `http_check`, `dns_lookup`, `check_port`, `web_search` |

## Current Frontend Features

- AIOps Diagnosis: tabbed UI, manual diagnosis input, demo prompt fill buttons, start/stop controls, SSE diagnosis stream, plan/step monitor, token and tool counters, and final report display.
- RAG Chat: chat tab calls `/api/v1/chat/stream` with `session_id = "web-chat"`, optional web search toggle, and optional MCP tools toggle.
- Knowledge Base: document tab supports `.md`, `.markdown`, and `.txt` upload through `/api/v1/documents/upload`, document listing through `/api/v1/documents`, and deletion through `/api/v1/documents/{source}`.
- Offline fixture playback: UI loads `/demo_fixtures/manifest.json`, accepts only real SSE fixture metadata (`metadata.source === "real_sse"`), can replay recorded event timing, and can use the latest localStorage recording.
- Markdown report export: AIOps report actions expose `aiops-export-markdown`; export filenames use `aiops-report-{skill}-{timestamp}.md`.

## Current Demo Fixtures

Files under `frontend/demo_fixtures/`:

| File | Size | Notes |
| --- | ---: | --- |
| `manifest.json` | 21 bytes | Exists; current content is `{ "fixtures": [] }`. |
| `README.md` | 1746 bytes | Documents the real-SSE fixture workflow and install process. |

There are no packaged real recorded SSE fixture JSON files in the repository at this baseline. The frontend recorder can capture a live `POST /api/v1/aiops/diagnose` SSE run and download a fixture, but the tracked manifest is empty.

## Current Validation Result

- Command:

  ```powershell
  git rev-parse HEAD
  ```

  Result: exit `0`, output `5058568fbb72ecda19a53bca5e20ba79da2b5aa7`.

- Command:

  ```powershell
  git status --short
  ```

  Result: exit `0`, no output before creating the Phase 0 docs.

- Command:

  ```powershell
  python -m compileall -q app mcp_servers scripts
  ```

  Result: exit `0`, no output.

- Command:

  ```powershell
  python scripts\validate_skill.py
  ```

  Result: exit `1`, argparse usage error because `skill_path` is a required positional argument:

  ```text
  usage: validate_skill.py [-h] skill_path
  validate_skill.py: error: the following arguments are required: skill_path
  ```

- Supplemental Skill validation command:

  ```powershell
  Get-ChildItem -LiteralPath app\skills\definitions -Directory | ForEach-Object { python scripts\validate_skill.py (Join-Path $_.FullName 'SKILL.md') }
  ```

  Result: exit `0`. All 5 current Skill files passed. `container_diagnosis` emitted 2 warnings because `docker_restart` is non-read-only and high-risk/destructive.

- Command:

  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\smoke_check.ps1
  ```

  Result: exit `0`, summary `10 pass, 1 warning, 0 critical failure(s)`.

  Smoke check warning: Docker Compose status could not connect to Docker because of local Docker config and pipe permission errors. The script still reported FastAPI health, readiness, skills, and open-webSearch health as passing.

- App endpoint checks, because the app was already running:

  ```powershell
  Invoke-RestMethod http://localhost:9900/api/v1/health -TimeoutSec 3
  Invoke-RestMethod http://localhost:9900/api/v1/health/ready -TimeoutSec 3
  Invoke-RestMethod http://localhost:9900/api/v1/skills -TimeoutSec 3
  ```

  Result: all returned `code = SUCCESS`. Health returned `status = alive`; readiness returned `status = ready`; skills returned `total = 5`.

## Known Limitations Before V5

- The exact command `python scripts\validate_skill.py` does not validate all skills; the script currently requires one explicit `skill_path` argument.
- `container_diagnosis` allows `docker_restart`; validation marks this as non-read-only and high-risk/destructive.
- `frontend/demo_fixtures/manifest.json` is empty, so the repository currently has no packaged offline recorded SSE demo fixture.
- Smoke check depends on local Docker access; this baseline environment reported Docker config and pipe permission warnings.
- Diagnosis runs stream to the UI but are not yet persisted in an AgentOps database.
- There is no AgentOps CRUD API or web console in the current route/frontend surface.
- Offline EvalOps is not yet a first-class tracked workflow with versioned datasets and run records.
- There is no committed pytest suite, GitHub Actions workflow, or Prometheus metrics layer for the planned V5 upgrade path.

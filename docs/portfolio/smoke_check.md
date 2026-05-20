# Smoke Check Scripts

Collection time: 2026-05-17T22:25+08:00  
Files:
- `scripts/smoke_check.ps1`
- `scripts/smoke_check.sh`

## Purpose

The smoke check scripts provide a read-only demo readiness report. They do not start services, stop services, restart containers, mutate `.env`, write logs intentionally, change data, write to Milvus, or touch Docker container state.

Use them before an interview demo to see which local dependencies are ready and which parts need fallback narration.

## Commands

Windows PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\smoke_check.ps1
```

Bash or Zsh:

```bash
bash scripts/smoke_check.sh
```

Optional overrides:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\smoke_check.ps1 -BaseUrl http://localhost:9900 -TimeoutSec 3
```

```bash
BASE_URL=http://localhost:9900 TIMEOUT_SEC=3 bash scripts/smoke_check.sh
```

## Checks

| Check | What it verifies | Failure level |
|---|---|---|
| Repository root | Required project markers such as `README.md`, `app/main.py`, `mcp_servers`, `scripts`, and `docker-compose.yml` exist | Critical |
| `.env` presence | Local runtime config file exists | Warning |
| Virtualenv Python | `.venv` Python is present and reports a version | Warning |
| System Python | `python`, `python3`, or `py` is available when virtualenv Python is missing | Critical if no Python is available |
| Node.js | `node --version` works | Warning |
| Docker CLI | `docker --version` works | Warning |
| Docker Compose status | `docker compose ps` can query local compose state | Warning |
| FastAPI health | `GET /api/v1/health` responds | Warning |
| FastAPI readiness | `GET /api/v1/health/ready` responds | Warning |
| Skills endpoint | `GET /api/v1/skills` responds | Warning |
| open-webSearch health | `GET <OPEN_WEBSEARCH_BASE_URL>/health` responds | Warning |

The scripts exit non-zero only when critical checks fail. Services being down is reported as warning because these scripts are intentionally read-only and should not try to repair local state.

## Common Warnings

Docker config warning:

```text
C:\Users\wth\.docker\config.json: Access is denied
```

Meaning: Docker CLI exists, but the local Docker config file cannot be read by the current process. Reopen the shell with appropriate permissions or fix Docker Desktop/user config permissions before relying on Docker-dependent demo paths.

Docker daemon unavailable:

```text
failed to connect to the docker API at npipe:////./pipe/docker_engine
```

Meaning: Docker Desktop or the Docker daemon is not running. Container, Milvus, Redis, and open-webSearch compose paths may be unavailable.

FastAPI health timeout:

```text
FastAPI health - unavailable
```

Meaning: the app is not running on the configured `PORT` or `BASE_URL`. Start the app separately with `run.ps1` when you want a live demo.

Readiness warning:

```text
FastAPI readiness - unavailable
```

Meaning: either FastAPI is not running or Milvus is unavailable. `/health/ready` treats Milvus as a required dependency.

Skills endpoint warning:

```text
Skills endpoint - unavailable
```

Meaning: FastAPI is unavailable or did not respond within the timeout. Without this endpoint, the frontend cannot display the runtime Skill registry.

open-webSearch warning:

```text
open-webSearch health - unavailable
```

Meaning: the daemon is not running at `OPEN_WEBSEARCH_BASE_URL`, which defaults to `http://127.0.0.1:3210`.

Bash unavailable on Windows:

If `bash scripts/smoke_check.sh` prints a WSL installation message, Bash/WSL is not available on the host. This does not affect the PowerShell script.

## Demo Fallback Path

If all service checks are warnings but repository and Python checks pass:

1. Present the portfolio docs instead of a live run:
   - `docs/portfolio/facts.md`
   - `docs/portfolio/sse_contract.md`
   - `docs/portfolio/release_notes.md`
2. Explain that the smoke script is intentionally read-only and did not start Docker or FastAPI.
3. Show which dependency is missing: Docker daemon, FastAPI, Milvus readiness, Skills endpoint, or open-webSearch.
4. Avoid claiming a live diagnosis or benchmark result.

If Docker and FastAPI are healthy:

1. Open `http://localhost:9900`.
2. Run one safe demo input from `docs/portfolio/release_notes.md`.
3. Observe the actual `skill_selected` event and streamed report.

## Safety Rules

- Do not run `run.ps1 -Stop`, `docker compose up`, `docker compose down`, or `docker restart` from these smoke scripts.
- Do not mutate `.env`.
- Do not upload/delete knowledge-base documents.
- Do not write to Milvus or Redis.
- Do not inspect or print API keys.
- Treat all service availability checks as observations, not fixes.

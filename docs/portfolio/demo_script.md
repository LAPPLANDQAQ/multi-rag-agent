# Interview Demo Script

Collection time: 2026-05-17T22:20+08:00  
Evidence base: `facts.md`, `sse_contract.md`, `benchmark_local.md`, and local code inspection  
Git commit baseline: `801c7453c19f5e6f6793d1e17df69193b1772acd`

## Demo Principle

Do not pre-claim the selected Skill. Start the request, observe the actual `skill_selected` SSE event, and narrate what the system selected.

Do not claim benchmark-grade model accuracy. The current EvalOps runner is a lightweight offline fixture evaluator for recorded SSE streams; it is useful for regression and demo stability, not for broad production-quality claims.

## Setup Checks

Run these before a live demo:

```powershell
git status --short
.\.venv\Scripts\python.exe -m compileall -q app mcp_servers scripts
.\.venv\Scripts\python.exe -m pip check
powershell -NoProfile -ExecutionPolicy Bypass -File .\run.ps1
```

If the service is already running, verify:

```powershell
Invoke-RestMethod http://localhost:9900/api/v1/health
Invoke-RestMethod http://localhost:9900/api/v1/health/ready
Invoke-RestMethod http://localhost:9900/api/v1/skills
Invoke-WebRequest http://127.0.0.1:3210/health
```

Expected observations:
- `/health` should report the FastAPI process is alive.
- `/health/ready` requires Milvus and may fail if Docker/Milvus is not running.
- `/api/v1/skills` should list the runtime Skill registry if the service is healthy.
- open-webSearch health depends on the daemon running on port 3210.

Phase B environment note: Docker daemon and key local ports were not available during the benchmark check. Re-run setup checks before presenting a live demo.

## AgentOps / EvalOps 3-5 Minute Demo Flow

1. Start services:

   ```powershell
   docker compose up -d
   powershell -NoProfile -ExecutionPolicy Bypass -File .\run.ps1
   ```

2. Open `http://localhost:9900` and start on the AIOps Diagnosis tab.
3. Run one live diagnosis with a safe public/demo input. Narrate the observed `skill_selected`, `plan`, `tool_call`, `usage`, `report`, and `complete` SSE events as they appear.
4. Switch to the AgentOps tab and refresh the dashboard. Show that the run was saved as side-channel AgentOps data without changing the LangGraph diagnosis topology.
5. Open the saved run report and explain that the Markdown report is persisted for review, while secrets/private logs should not be used in demo inputs.
6. Show demo scenarios and eval cases. Emphasize that scenarios fill inputs and eval cases define expected routing/evidence hints; they do not force the live agent to take a path.
7. Run offline eval:

   ```powershell
   python scripts\run_agent_eval.py --mode offline
   ```

   Show `docs/portfolio/eval_report.md`. If no real fixture is installed, explain that sample size is `0` and the command still validates the deterministic reporting path.
8. Open either `http://localhost:9900/api/v1/agentops/summary` or `http://localhost:9900/metrics` to show operational visibility.
9. Close with reliability work: `pytest -q` for local regression tests and `.github/workflows/ci.yml` for CI checks.

Fallback path:
- If the LLM provider is unavailable, use offline fixture playback and clearly label it as recorded replay.
- If Milvus is unavailable, show AgentOps history, scenario/eval CRUD, and offline eval rather than claiming live RAG evidence.
- If open-webSearch is unavailable, set `WEB_SEARCH_PROVIDER=mock` or explain that web search is an optional provider.
- If Docker is unavailable, avoid container mutation and demonstrate host/network/database read-only paths instead.

## Demo Input 1: Local Resource Diagnosis

Input:

```text
My computer is very slow. Please check whether CPU, memory, or disk usage is abnormal.
```

What to observe:
- Actual `skill_selected` event. Likely target is `host_resource_diagnosis`, but do not pre-claim it.
- `plan` event with 2-3 diagnosis steps.
- `tool_call` events such as local system overview, CPU/memory, disk usage, or top processes if MCP tools are available.
- `report` event with a Markdown diagnosis.

Narration:
- "The system first routes to a Skill, then loads only that Skill's playbook and allowed tools."
- "Local system metrics are real tool outputs when the MCP system server is available."
- "If a tool is unavailable, the report should say evidence is missing rather than inventing data."

Fallback:
- If MCP system server is unavailable, show `docs/portfolio/sse_contract.md` and explain the event contract.
- Use `facts.md` to show the inspected Skill definition and allowed tools.

Frontend shortcut:
- Click `Local resource` to fill this input into the diagnosis box.
- The button only fills the text area; it does not send the request.

## Demo Input 2: Docker Container Diagnosis

Input:

```text
A Docker container keeps restarting. Please diagnose the container status, logs, and likely reason.
```

What to observe:
- Actual `skill_selected` event. Likely target is `container_diagnosis`, but observe the stream instead of asserting.
- Docker tool calls if Docker daemon and MCP docker server are available.
- Permission behavior around `docker_restart`: it is high-risk and disabled by default.

Narration:
- "Container diagnosis can inspect Docker state and logs, but restart is gated."
- "The demo is safe by default because `DOCKER_ALLOW_RESTART` was not present in the Phase A `.env` facts and `settings.docker_allow_restart` was false."

Fallback:
- If Docker is unavailable, explicitly say the Docker daemon is not available in this environment.
- Do not start, stop, restart, remove, or mutate containers during this phase.

Frontend shortcut:
- Click `Docker container` to fill this input into the diagnosis box.
- The button only fills the text area; it does not send the request.

## Demo Input 3: Network Or HTTP Timeout Diagnosis

Input:

```text
The public API https://example.com is timing out from this machine. Please diagnose DNS, TCP port, and HTTP layer.
```

What to observe:
- Actual `skill_selected` event. Likely target is `network_diagnosis`, but observe it live.
- DNS, ping, port, or HTTP check tool events if network MCP tools are available.
- Final Markdown report with layered diagnosis.

Narration:
- "Network diagnosis is layered: DNS, reachability, port, then HTTP response."
- "The network Skill is designed for public targets; it should avoid internal network scanning."

Fallback:
- If network tools are unavailable, show the network Skill allowed tools in `facts.md`.
- Use a harmless public URL for demo inputs; do not scan private infrastructure.

Frontend shortcut:
- Click `Network timeout` to fill this input into the diagnosis box.
- The button only fills the text area; it does not send the request.

## Demo Input 4: Database Connection Diagnosis

Input:

```text
MySQL primary database connection is timing out. The application logs show connection refused. Please diagnose the connection chain.
```

What to observe:
- Actual `skill_selected` event. Likely target is `database_connection_diagnosis`, but observe it live.
- If no host or port is present, the Skill should ask for the missing target instead of inventing one.
- If a safe public/demo target is provided, observe DNS, ping, TCP port, HTTP, or knowledge-base evidence depending on the input.
- Final Markdown report should separate DNS, reachability, TCP port, HTTP/application evidence, and missing data.

Narration:
- "This Skill demonstrates extension by adding a playbook, not by changing the LangGraph topology."
- "It uses only existing read-only tools and does not accept database credentials or run SQL."
- "Connection refused, timeout, DNS failure, and pool exhaustion are treated as different evidence paths."

Fallback:
- If the router does not select the database Skill, show the validated `app/skills/definitions/database_connection_diagnosis/SKILL.md` and explain that router selection is observed, not forced.
- If network tools are unavailable, show `scripts/validate_skill.py` output and the Skill's `allowed_tools`.

## Offline Demo Replay

The frontend includes an `Offline Demo Replay` control. It is an explicitly labeled replay path, not a live diagnosis path.

Required banner:

```text
Offline demo mode: replaying a recorded SSE fixture, not a live LLM/tool call.
```

Current Phase D behavior:
- The frontend loads `frontend/demo_fixtures/manifest.json` and any listed `*.json` fixtures.
- No JSON fixture is created unless a real SSE stream has been captured.
- If no static fixture is installed but the browser has a recent real recording in `localStorage`, replay is available from that temporary local recording.
- If neither a manifest fixture nor a local recording exists, replay stays disabled and the page reports that no real fixture is available.
- Playback feeds recorded SSE events through the same frontend event renderer used by the live SSE stream and does not call the backend.

Fixture documentation:
- `frontend/demo_fixtures/README.md`

## How To Record And Install Offline Demo Fixtures

1. Start the normal backend/frontend stack.
2. In the AIOps tab, enable `Record stream`.
3. Start a live diagnosis with a safe demo input and wait for the SSE stream to finish.
4. Confirm the page reports captured events and enables local playback. This `localStorage` playback is temporary and only exists in the current browser profile.
5. Click `Download fixture JSON`.
6. Review the downloaded JSON and remove secrets, private hostnames, private paths, credentials, or sensitive log content. Do not edit the event order or invent missing events.
7. Install the reviewed recording as a persistent fixture:

```powershell
python scripts/install_demo_fixture.py path/to/downloaded_fixture.json --id host_resource_demo --title "Host resource diagnosis demo"
```

8. Reload the page. The installed fixture should appear from `frontend/demo_fixtures/manifest.json` and can be replayed as an offline recorded demo.

Persistent demo path:
- Temporary: latest real recording in browser `localStorage`.
- Persistent: `frontend/demo_fixtures/<id>.json` plus `frontend/demo_fixtures/manifest.json`.

Demo wording:
- Say "This is replay mode using a recorded SSE fixture."
- Do not say "the agent is running live" during offline replay.
- If no fixture exists, say "Offline replay is unavailable because no real captured fixture is present."

## Markdown Report Export

After a live diagnosis or real offline fixture emits a final `report` event, the frontend shows an `Export Markdown` button next to the report.

Expected behavior:
- The button is hidden before a final report exists.
- The download is created in the browser with a Blob/ObjectURL.
- No backend download endpoint, PDF export, email, webhook, or server-side report storage is involved.
- The exported `.md` includes export metadata, the selected Skill when observed, the scenario input, and the final report Markdown used for the on-screen report.

## Token And Cost Notes

Token counts may appear in `usage` or `progress` SSE events when the configured model/provider returns usage metadata. Treat the displayed values as run-specific observations, not a benchmark.

Do not quote historical README token-reduction numbers in the demo. `benchmark_local.md` marks those as not locally reproduced.

## Safety Checklist

Before recording or screensharing:
- Ensure `.env` values are not visible.
- Avoid showing API keys, admin tokens, private logs, or personal file paths.
- Use public/demo inputs only.
- Do not enable `DOCKER_ALLOW_RESTART=true` for an interview demo unless the target container is intentionally disposable.
- Say "observed selected Skill" instead of "this prompt will definitely choose X".
- Demo prompt buttons fill input only; confirm before clicking `开始诊断`.
- Offline replay must be visibly labeled as replay, not live execution.

## Closing Summary

End with:

"This demo shows how I extended and verified an existing Skill-first AIOps/RAG system: the runtime chooses a Skill, plans steps, calls gated read-only tools, streams SSE events, and produces a Markdown report. My AgentOps/EvalOps additions persist run summaries, expose a console and APIs, replay recorded fixtures, run lightweight offline eval, and add metrics, cache, tests, and CI. The portfolio docs separate upstream capabilities, my engineering enhancements, and experimental future work."

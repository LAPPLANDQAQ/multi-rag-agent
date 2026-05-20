# V5 Upgrade Plan

This plan starts from the Phase 0 baseline and keeps each phase independently reversible. Runtime behavior should remain unchanged unless a phase explicitly introduces the new feature and its validation passes.

## Phase 1 - AgentOps SQLite / SQLAlchemy Data Layer

- Goal: add a local persistence layer for diagnosis runs, events, tool calls, token usage, retrieval evidence, and evaluation metadata.
- Files likely to change: `requirements.txt`, `app/core/`, new `app/agentops/` or `app/services/agentops_*`, new migration/bootstrap scripts, `.env.example`.
- Risk level: medium.
- Validation command: `python -m compileall -q app mcp_servers scripts` plus a focused database bootstrap command against a temporary SQLite file.
- Rollback note: remove the new persistence package, SQLAlchemy dependency, database config keys, and generated local SQLite files.

## Phase 2 - AgentOps CRUD API

- Goal: expose read/write APIs for run records, run events, annotations, and dashboard queries without changing existing diagnosis endpoints.
- Files likely to change: `app/api/v1/`, `app/main.py`, AgentOps service/model files, API schemas.
- Risk level: medium.
- Validation command: `python -m compileall -q app mcp_servers scripts` and API smoke requests for create/list/detail/delete against a temporary database.
- Rollback note: unregister the AgentOps router and remove the AgentOps API module while keeping Phase 1 storage code if still needed.

## Phase 3 - Save Diagnosis Runs From Existing SSE Stream

- Goal: persist the existing `/api/v1/aiops/diagnose` SSE lifecycle, including selected skill, plan, tool calls, usage events, retrieval context, and final report.
- Files likely to change: `app/api/v1/aiops.py`, `app/services/aiops_service.py`, `app/runtime/agent_harness.py`, AgentOps writer/service files.
- Risk level: high.
- Validation command: run one real diagnosis through the SSE endpoint, verify the streamed events still arrive in order, and verify a matching AgentOps run record exists.
- Rollback note: remove the AgentOps write hooks from the SSE path and leave the previous streaming behavior intact.

## Phase 4 - AgentOps Web Console

- Goal: add a frontend console for browsing runs, inspecting timeline events, comparing reports, and opening tool/retrieval evidence.
- Files likely to change: `frontend/index.html`, `frontend/app.js`, `frontend/styles.css`, possibly new frontend assets or static modules.
- Risk level: medium.
- Validation command: manual browser smoke check plus API checks for the routes used by the console.
- Rollback note: remove the AgentOps tab/UI code and keep backend APIs available for later rework.

## Phase 5 - Offline EvalOps

- Goal: create offline evaluation datasets and runners for Skill routing, tool execution quality, retrieval accuracy, token usage, and report quality.
- Files likely to change: new `evals/` or `scripts/eval_*`, `docs/portfolio/`, fixture/data directories, possibly AgentOps schemas for eval records.
- Risk level: medium.
- Validation command: run a small offline eval sample and produce a deterministic JSON/Markdown report.
- Rollback note: remove eval scripts and generated reports; no runtime rollback should be needed.

## Phase 6 - pytest Test Suite

- Goal: add regression tests for API schemas, Skill validation, routing, SSE event normalization, fixture validation, and AgentOps storage.
- Files likely to change: `requirements.txt`, new `tests/`, possible small testability hooks in services.
- Risk level: medium.
- Validation command: `pytest`.
- Rollback note: remove the test-only dependency and `tests/` additions if they block development; do not revert runtime fixes independently needed by tests.

## Phase 7 - Prometheus Metrics

- Goal: expose metrics for diagnosis latency, Skill selection, tool execution counts/failures, token usage, retrieval hits, and AgentOps persistence errors.
- Files likely to change: `requirements.txt`, `app/main.py`, `app/core/` or `app/observability/`, diagnosis/tool execution paths.
- Risk level: medium.
- Validation command: `python -m compileall -q app mcp_servers scripts` and `Invoke-RestMethod http://localhost:9900/metrics`.
- Rollback note: remove the metrics middleware/exporter and instrumentation calls; keep AgentOps records as the source of historical data.

## Phase 8 - Memory / Redis Cache Layer

- Goal: formalize Redis-backed memory/cache behavior for RAG Chat, repeated retrievals, and optional diagnosis context reuse with explicit TTLs.
- Files likely to change: `app/core/`, `app/services/`, `.env.example`, docs, possibly existing chat memory code.
- Risk level: medium.
- Validation command: run chat memory smoke checks with Redis enabled and disabled, then verify graceful fallback when Redis is unavailable.
- Rollback note: disable the feature with env flags and remove cache calls from hot paths if latency or correctness regresses.

## Phase 9 - GitHub Actions CI

- Goal: add CI for compile checks, Skill validation, frontend fixture validation, smoke-check script syntax, and pytest.
- Files likely to change: `.github/workflows/`, `scripts/`, docs.
- Risk level: low.
- Validation command: run the same CI commands locally, then verify the GitHub Actions workflow on a pushed branch.
- Rollback note: remove the workflow file or mark failing jobs non-blocking while preserving local validation scripts.

## Phase 10 - README and Portfolio Documentation Update

- Goal: update public documentation after V5 features stabilize, including AgentOps screenshots/usage, EvalOps commands, metrics, limitations, and rollback guidance.
- Files likely to change: `README.md`, `docs/portfolio/`, possibly `frontend/demo_fixtures/README.md`.
- Risk level: low.
- Validation command: documentation review plus `git diff --check`.
- Rollback note: revert documentation-only commits without touching runtime feature commits.

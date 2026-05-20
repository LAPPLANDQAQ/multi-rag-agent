# AgentOps Architecture

## Design Goal

AgentOps adds traceability, eval, and product-console capabilities around the existing AIOps agent without replacing or rewriting the core LangGraph diagnosis graph. The live diagnosis path still streams through the existing Skill-first pipeline; AgentOps observes that stream as a side channel and stores only summary/business records needed for review and demos.

## Data Flow

```text
User diagnosis
  -> existing POST /api/v1/aiops/diagnose SSE stream
  -> side-channel event aggregation in app/api/v1/aiops.py
  -> diagnosis_runs SQLite records
  -> AgentOps REST APIs
  -> AgentOps Console in frontend/
```

The important boundary is that stream persistence is best-effort. A database, cache, or metrics failure should not interrupt the live SSE response.

## Storage Responsibilities

- Milvus: vector chunks and RAG retrieval data used by the existing knowledge-base path.
- SQLite: AgentOps business records such as diagnosis runs, demo scenarios, eval cases, and eval results.
- Redis/Memory: optional cache for low-risk read-only AgentOps reads. Redis is not mandatory; memory fallback is supported.
- `frontend/demo_fixtures`: reviewed real SSE recordings for offline replay. Synthetic fixtures should not be presented as live agent behavior.

## API Modules

- `app/api/v1/aiops.py`: existing live diagnosis SSE endpoint, with additive best-effort AgentOps persistence hooks.
- `app/api/v1/agentops.py`: CRUD/read APIs for AgentOps summary, runs, scenarios, eval cases, and eval results.
- `app/api/v1/metrics.py`: Prometheus text endpoint at `GET /metrics`.
- `app/agentops/repository.py`: SQLAlchemy repository for business records.
- `app/agentops/service.py`: short-lived session facade for API and eval callers.
- `app/agentops/eval.py`: deterministic offline fixture evaluation helpers.

## Frontend Modules

- AIOps tab: existing diagnosis workflow and SSE event rendering.
- AgentOps tab: additive console for summary, run history, Markdown report review, demo scenarios, eval cases, eval results, and recorded fixture playback.
- Offline replay: explicitly labeled as recorded SSE playback and not a live LLM/tool call.

## Failure Isolation

AgentOps uses best-effort boundaries:

- Live diagnosis should continue even if run persistence fails.
- Cache miss, serialization failure, or Redis outage should degrade to memory/no cache behavior.
- Metrics labels are coarse and should never include user prompts, secrets, raw URLs, or report text.
- Offline eval handles an empty fixture set as a valid smoke-level report rather than inventing sample data.

## What This Does Not Claim

- It does not claim ownership of the upstream LangGraph topology, AgentHarness, MCP servers, or open-webSearch implementation.
- It does not claim production deployment; the current target is a local demo and interview-ready engineering portfolio.
- It does not claim benchmark-grade diagnosis accuracy from the offline fixture evaluator.

## Future Work

- PostgreSQL backend for shared/multi-user AgentOps records.
- Alembic migrations for schema evolution.
- OpenTelemetry spans in addition to Prometheus-style metrics.
- Richer eval datasets with stable sample sizes and rubric-based report quality checks.
- Role-based access control before any production-facing deployment.

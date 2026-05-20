# Portfolio Architecture Notes

Collection time: 2026-05-17T22:20+08:00  
Evidence base: local code inspection plus `docs/portfolio/facts.md`, `release_notes.md`, and `sse_contract.md`
Git commit baseline: `801c7453c19f5e6f6793d1e17df69193b1772acd`

## Scope And Attribution

This document explains the local repository architecture for interview discussion. It does not claim exclusive authorship of upstream architecture. Source and attribution notes are summarized in `docs/portfolio/release_notes.md`.

Safe phrasing:
- "I analyzed, documented, packaged, and verified the existing Skill-first AIOps/RAG system."
- "I added portfolio documentation and reproducibility checks around the existing codebase."

Unsafe phrasing:
- "I implemented the full LangGraph topology."
- "I designed the upstream AgentHarness, MCP tool model, or native Skills."

## High-Level Flow

```text
User or Alertmanager
        |
        v
FastAPI API layer
        |
        v
AIOps SSE service
        |
        v
LangGraph: SkillRouter -> Planner -> Executor -> Replanner -> Report
        |
        +--> RAG retrieval: Milvus / hybrid retrieval / reranker config
        |
        +--> MCP tools: system, websearch, winlog, network, docker
        |
        v
SSE event stream -> frontend monitoring and report UI
```

## FastAPI Layer

Relevant files:
- `app/main.py`
- `app/api/v1/aiops.py`
- `app/api/v1/chat.py`
- `app/api/v1/skills.py`
- `app/api/v1/documents.py`
- `app/api/v1/health.py`
- `app/api/v1/webhook.py`

The API layer exposes:
- AIOps diagnosis through `POST /api/v1/aiops/diagnose`.
- RAG chat through `POST /api/v1/chat/stream`.
- Skill metadata through `GET /api/v1/skills`.
- Health and readiness endpoints.
- Knowledge-base document endpoints guarded by `X-KB-Admin-Token`.
- Alertmanager webhook intake.

The AIOps endpoint returns an SSE stream. It does not return a single blocking JSON report.

## LangGraph Agent Layer

Relevant files:
- `app/agents/graph.py`
- `app/agents/skill_router.py`
- `app/agents/planner.py`
- `app/agents/executor.py`
- `app/agents/replanner.py`
- `app/agents/fork_runner.py`
- `app/runtime/agent_harness.py`

The current graph shape is:

```text
START
  -> skill_router
  -> planner
  -> executor
  -> replanner
  -> executor or planner or END
```

The graph also has a `fork_skill` node for Skills that declare fork-style context. Phase C does not modify this topology.

`AgentHarness` centralizes context assembly, model selection, reroute limits, fast-path replanner decisions, budget/stat events, and fallback text. It is treated as part of the existing runtime control plane; source notes are summarized in `release_notes.md`.

## Skill-First Routing

Relevant files:
- `app/skills/registry.py`
- `app/skills/loader.py`
- `app/skills/models.py`
- `app/skills/definitions/*/SKILL.md`

The registry loads `app/skills/definitions/<skill_name>/SKILL.md` at process startup. The current local Skill definitions inspected in Phase A are:

| Skill | Purpose | Risk |
|---|---|---|
| `host_resource_diagnosis` | Local CPU, memory, disk, and process diagnosis | low |
| `network_diagnosis` | DNS, HTTP, ping, and TCP port diagnosis | low |
| `container_diagnosis` | Docker container status, stats, logs, inspect, and gated restart | medium |
| `generic_oncall` | Fallback SRE troubleshooting path | low |

Router output must be observed from actual SSE events during a demo. Do not pre-claim that a specific input will select a specific Skill.

## Planner, Executor, Replanner, Report

Planner:
- Uses the selected Skill playbook to build a short diagnosis plan.
- Should avoid inventing tool names and should stay within the current Skill context.

Executor:
- Executes the current plan step.
- Uses real tools first when available.
- Emits `step_start`, `step_token`, `tool_call`, and `usage` stream events through the stream sink.
- May run read-only tools in parallel through the runtime tool runner.

Replanner:
- Decides whether evidence is sufficient, whether to continue, or whether a reroute is warranted.
- Produces the final report through the `response` field when complete.

Report:
- Final user-facing output is Markdown delivered through SSE `report` events.
- Report quality depends on actual tool/RAG evidence collected during the run.

## RAG And Milvus

Relevant files:
- `app/services/rag_service.py`
- `app/services/rag/retrieval.py`
- `app/core/vector_store.py`
- `app/core/hybrid_retriever.py`
- `app/core/reranker.py`
- `scripts/ingest_kb_corpus.py`

The local facts baseline records:
- `MILVUS_HOST=localhost`
- `MILVUS_PORT=19530`
- `MILVUS_COLLECTION=multi_agent_kb`
- `RAG_TOP_K=3`
- `RAG_HYBRID_ENABLED=True`
- `RAG_RERANK_ENABLED=True`
- `RAG_RERANK_MODEL=gte-rerank-v2`

These are configuration facts, not benchmark results. Phase B did not find a local eval script for RAG MRR or recall reproduction.

## MCP Tool Layer

Relevant files:
- `mcp_servers/system_server.py`
- `mcp_servers/websearch_server.py`
- `mcp_servers/winlog_server.py`
- `mcp_servers/network_server.py`
- `mcp_servers/docker_server.py`
- `app/core/mcp_client.py`
- `app/tools/meta.py`
- `app/runtime/permissions.py`

Local startup mapping from Phase A:

| Server | Port | URL |
|---|---:|---|
| system | 8005 | `http://localhost:8005/mcp` |
| websearch | 8006 | `http://localhost:8006/mcp` |
| winlog | 8008 | `http://localhost:8008/mcp` |
| network | 8009 | `http://localhost:8009/mcp` |
| docker | 8011 | `http://localhost:8011/mcp` |

Tool risk is not uniform. Most inspection tools are read-only. `docker_restart` is high-risk and disabled unless restart permission is explicitly enabled.

## SSE Observability

Relevant document:
- `docs/portfolio/sse_contract.md`

The AIOps diagnosis stream uses `POST /api/v1/aiops/diagnose`. The SSE event name is `message`, and the `data` field is a JSON string.

Important event types inspected in code:
- `start`
- `skill_selected`
- `plan`
- `step_start`
- `step_token`
- `tool_call`
- `usage`
- `step_complete`
- `replan`
- `report`
- `complete`
- `error`
- `transition`
- `progress`

The schema file and runtime stream have some drift: runtime code emits more event types than `app/schemas/aiops.py` documents. Treat `sse_contract.md` as the current portfolio-facing reference until runtime capture is added.

## Risk Boundaries

Hard integration boundaries:
- Do not rewrite the LangGraph main topology.
- Do not rewrite `app/runtime/agent_harness.py`.
- Do not rewrite the tool registry or permission model.
- Do not upgrade PyMilvus to 3.x.
- Do not upgrade Express to 5.x, Zod to 4.x, or Koffi to 3.x.
- Do not delete upstream license, author, NOTICE, or third-party attribution.
- Do not add production write operations, real credentials, real server credentials, or destructive tools.

Operational boundaries:
- Knowledge-base document upload/delete endpoints are write paths and require admin token.
- Docker restart is high-risk and disabled by default.
- Runtime demo claims should be based on observed SSE events and health checks, not assumed routing.

## Fallback Principles

The system is designed to degrade rather than fabricate:
- If RAG retrieval fails or has no hits, the response should state that evidence is missing.
- If MCP tools are unavailable, the diagnosis should report tool unavailability instead of inventing metrics.
- If Docker is unavailable, container diagnosis should be demonstrated as a degraded path or skipped.
- If benchmark scripts are absent, README and resume text must avoid unsupported metric claims.

## Interview Narrative

The strongest honest narrative is:

"I took an existing open-source Multi-Agent AIOps/RAG system and made it interview-ready by auditing facts, clarifying source boundaries, documenting the SSE contract, checking dependency health, and replacing unsupported metric claims with documented local evidence and explicit gaps. I can walk through how the Skill-first LangGraph flow works, how MCP tools are gated, and where the demo is read-only versus risky."

# Ownership Matrix

Collection time: 2026-05-17T22:00:39+08:00  
Git commit: `801c7453c19f5e6f6793d1e17df69193b1772acd`

This document defines how repository areas may be described in README, resume, and interview demos.

## Red Line

Anything marked **Upstream** must never be described as "implemented by me", "designed by me", or "developed by me" in README, resume text, or interview narration. Safe verbs are "analyzed", "documented", "verified", "packaged", "configured", and "demonstrated".

## Matrix

| Path or area | Ownership state | Safe wording | Notes |
|---|---|---|---|
| `app/runtime/agent_harness.py` | Upstream V2 baseline | understand / analyze / demonstrate | Do not rewrite in packaging phases. Treat as existing runtime control-plane code. |
| `app/agents/graph.py` | Upstream | analyze multi-stage diagnosis flow | Main LangGraph topology is a hard boundary and must not be rewritten. |
| `app/skills/definitions/host_resource_diagnosis/` | Upstream | analyze / demonstrate native Skill | Existing native Skill. |
| `app/skills/definitions/network_diagnosis/` | Upstream | analyze / demonstrate native Skill | Existing native Skill. |
| `app/skills/definitions/container_diagnosis/` | Upstream | analyze / demonstrate native Skill | Existing native Skill; includes gated `docker_restart`. |
| `app/skills/definitions/generic_oncall/` | Upstream | analyze / demonstrate native Skill | Existing fallback Skill. |
| `mcp_servers/*` | Upstream | configure / verify / demonstrate MCP tools | Do not rewrite server or permission model during packaging. |
| `open-webSearch-main/` | Third-party open-source | configure / verify / demonstrate | Local copy of open-webSearch. Local license file is Apache License 2.0. |
| `requirements.txt` | Mine: version baseline / packaging / documentation / verification, if local change is intentional | converged / pinned / verified dependency baseline | File is modified in the working tree before Phase A docs were added. Do not claim upstream core implementation from this. |
| `open-webSearch-main/package.json` | Mine: Node baseline convergence, if local change is intentional | converged / verified Node dependency baseline | File is modified in the working tree before Phase A docs were added. |
| `open-webSearch-main/package-lock.json` | Mine: Node baseline convergence, if local change is intentional | locked / verified Node dependency baseline | File is modified in the working tree before Phase A docs were added. |
| `docs/portfolio/*` | Mine: newly added packaging documentation | created / documented / verified | Portfolio packaging docs include facts, ownership, SSE contract, dependency audit, benchmark reproducibility, architecture, demo script, and resume-safe notes. |
| `scripts/smoke_check.ps1` | Mine: demo packaging addition | added / verified read-only smoke check | Phase E adds a Windows read-only smoke script. |
| `scripts/smoke_check.sh` | Mine: demo packaging addition | added / verified read-only smoke check | Phase E adds a Bash/Zsh read-only smoke script. |
| `frontend/index.html`, `frontend/app.js`, `frontend/styles.css` demo prompt buttons and offline replay UI | Mine: demo packaging addition | added demo support / added offline replay UI | Phase D adds input-fill buttons and a replay path that requires a real captured fixture. |
| `frontend/demo_fixtures/README.md` | Mine: demo packaging documentation | documented fixture capture rules | No synthetic JSON fixture is added. |
| `frontend/index.html`, `frontend/app.js`, `frontend/styles.css` browser-side Markdown export | Mine: demo packaging addition | added browser-only report export | Phase F adds a client-side `.md` download after final report generation. No backend endpoint, PDF export, email, webhook, or server-side report storage is added. |
| `app/skills/definitions/database_connection_diagnosis/` | Mine: newly added Skill | added / validated staged Skill | Phase G adds one low-risk database connection diagnosis Skill after staging validation. It uses only existing read-only tools and does not add database credentials or write operations. |
| `scripts/validate_skill.py` | Mine: newly added validator | added / validated Skill validator | Phase G adds a read-only offline validator for one `SKILL.md` file. It does not start servers or mutate data. |
| `app/agentops/*` | Mine: AgentOps engineering enhancement | added SQLAlchemy data layer and service facade | Additive business data layer for diagnosis runs, demo scenarios, eval cases, and eval results. Does not replace the upstream LangGraph diagnosis graph. |
| `app/api/v1/agentops.py` | Mine: AgentOps engineering enhancement | added RESTful AgentOps APIs | CRUD/read APIs for AgentOps records. Safe to describe as an added API layer around existing diagnosis behavior. |
| `app/agentops/eval.py` | Mine: EvalOps engineering enhancement | added offline fixture evaluation | Deterministic eval helper for recorded SSE fixtures. Do not claim benchmark-grade model quality from smoke-level fixture metrics. |
| `scripts/run_agent_eval.py` | Mine: EvalOps engineering enhancement | added offline eval CLI | Runs offline fixture evaluation and writes a Markdown report. Live mode is intentionally not implemented yet. |
| `app/core/metrics.py` | Mine: observability enhancement | added Prometheus-style metrics | Exposes application counters/histograms through `/metrics`. Use coarse labels only; do not claim full OpenTelemetry tracing. |
| `app/core/cache.py` | Mine: cache enhancement | added optional memory/Redis cache abstraction | Used only for low-risk read-only AgentOps data. Redis is optional and memory fallback works. |
| `.github/workflows/ci.yml` | Mine: CI enhancement | added conservative GitHub Actions checks | Python compile/pip/pytest and Node audit/build/test checks. Uses dummy CI env values and no real API keys. |
| `tests/*` | Mine: regression test suite | added pytest coverage for AgentOps, EvalOps, metrics, cache, fixtures, and smoke scripts | Test suite validates added layers and selected existing contracts. Do not claim it exhaustively tests every upstream runtime path. |
| `frontend/index.html`, `frontend/app.js`, `frontend/styles.css` AgentOps tab changes | Mine: AgentOps Web Console enhancement | added console UI for runs, scenarios, eval cases, eval results, and recorded fixture playback | Frontend console calls AgentOps APIs and reuses recorded fixture workflow. It is a local demo/admin console, not a production deployment claim. |

## Safe Resume Framing

Safe:
- "Packaged and verified an open-source Multi-Agent AIOps/RAG project for reproducible local demos."
- "Documented ownership boundaries, SSE contract, dependency audit, and local runtime facts."
- "Analyzed the existing LangGraph Skill-first diagnosis flow and MCP tool integration."
- "Added an AgentOps/EvalOps layer with SQLAlchemy persistence, REST APIs, a web console, offline fixture evaluation, metrics, cache, pytest coverage, and CI around the existing diagnosis flow."

Unsafe:
- "I implemented the full LangGraph multi-agent architecture."
- "I designed the upstream AgentHarness and tool permission model."
- "I reproduced benchmark metrics" unless Phase B produces local evidence.

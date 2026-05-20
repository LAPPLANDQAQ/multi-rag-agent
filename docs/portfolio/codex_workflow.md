# Codex Workflow Notes

This document is an interview asset for explaining how the AgentOps/EvalOps upgrade was executed with AI assistance while protecting project boundaries.

## 1. How Requirements Were Split Into Phases

The work was split into reversible phases: baseline freeze, data layer, CRUD API, SSE persistence, web console, offline eval, pytest, metrics, cache, CI, and documentation. Each phase had a narrow objective, explicit rollback path, and validation commands.

## 2. How Codex Prompts Were Constrained

Prompts named exact files to inspect, files likely to change, hard constraints, validation commands, and commit messages. The constraints explicitly blocked real secrets, external service requirements in tests, production claims, benchmark overclaiming, and rewrites of the core diagnosis graph.

## 3. What Files Codex Was Allowed To Touch

Allowed touch areas were additive and phase-specific:

- `app/agentops/`
- `app/api/v1/agentops.py`
- `app/api/v1/metrics.py`
- `app/core/metrics.py`
- `app/core/cache.py`
- `scripts/init_agentops_db.py`
- `scripts/run_agent_eval.py`
- `tests/`
- `frontend/` AgentOps console and fixture replay additions
- `.github/workflows/ci.yml`
- `docs/portfolio/` and `README.md`

## 4. What Files Were Protected

Protected boundaries included:

- The upstream LangGraph topology in `app/agents/graph.py`.
- Existing runtime control-plane behavior in `app/runtime/agent_harness.py`, except for documentation/inspection.
- Third-party `open-webSearch-main/` implementation.
- License, third-party notices, and open-source origin descriptions.
- Any `.env`, private logs, API keys, credentials, or personal inputs.

## 5. How Validation Was Run After Each Phase

Every feature phase ran a scoped validation first, then broader checks such as:

```powershell
python -m compileall -q app mcp_servers scripts
pytest -q
python scripts\validate_skill.py
python scripts\run_agent_eval.py --mode offline
```

CI added the same conservative checks for Python plus Node install/audit/build/test for `open-webSearch-main`.

## 6. How Diffs Were Reviewed

Diffs were reviewed for:

- File scope matching the phase prompt.
- No unrelated runtime rewrites.
- No secrets or private values.
- No raw user input in metric labels or cache keys.
- Tests covering new behavior.
- Documentation separating upstream capabilities from local enhancements.

## 7. How Rollback Was Planned

Each phase had an explicit rollback note. Examples:

- AgentOps APIs can be unregistered while preserving storage code.
- SSE persistence hooks can be removed without changing the live stream contract.
- Metrics instrumentation can be removed while keeping AgentOps records.
- Cache can be disabled through config or removed from low-risk read paths.
- Documentation-only changes can be reverted without touching runtime feature commits.

## 8. What Tasks Were Suitable For AI Generation

Good AI-assisted tasks included:

- Boilerplate SQLAlchemy CRUD and schemas.
- API route wiring with existing FastAPI patterns.
- Repetitive frontend console rendering code.
- Deterministic pytest cases.
- Prometheus metric registration and coarse helper wrappers.
- CI YAML.
- Portfolio documentation drafts based on inspected files.

## 9. What Tasks Required Human Verification

Human review is still needed for:

- Whether recorded SSE fixtures contain private data.
- Whether demo wording is accurate for a specific interview.
- Whether benchmark/accuracy claims are acceptable for a resume.
- Whether Docker restart or other high-risk operations should ever be enabled.
- Whether UI screenshots represent a clean environment.
- Whether GitHub Actions should be made branch-protection-required.

## 10. Lessons Learned

- Small, reversible phases are safer than large rewrites when an existing agent stack already works.
- Side-channel persistence avoids destabilizing the live SSE path.
- Tests and CI are more useful when they avoid external LLM, Milvus, Redis, and Docker dependencies.
- Eval wording must distinguish fixture regression checks from benchmark-grade accuracy.
- Ownership docs are necessary when a repository mixes upstream code, third-party subprojects, and local enhancements.

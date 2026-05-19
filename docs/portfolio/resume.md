# Resume-Safe Project Notes

Collection time: 2026-05-17T22:20+08:00  
Evidence base: `ownership.md`, `facts.md`, `benchmark_local.md`, and `dep_audit.md`  
Git commit baseline: `801c7453c19f5e6f6793d1e17df69193b1772acd`

## Project Title

Multi-Agent AIOps/RAG Platform Packaging and Verification

## Honest Project Description

Packaged and verified an open-source Multi-Agent AIOps/RAG diagnosis project for local, reproducible interview demos. The underlying system combines FastAPI, LangGraph, Skill-first routing, RAG/Milvus retrieval, MCP tool services, and SSE observability. My packaging work focused on factual documentation, ownership boundaries, dependency audit, runtime contract documentation, and resume-safe wording.

## Resume Bullets

Use only bullets that match the final completed phases.

- Packaged an open-source Multi-Agent AIOps/RAG system into an interview-ready local demo, documenting verified configuration, dependency status, and runtime boundaries.
- Audited project ownership and attribution across upstream LangGraph agent code, native Skills, MCP servers, third-party open-webSearch, and personally added portfolio documentation.
- Documented the AIOps SSE contract for `POST /api/v1/aiops/diagnose`, including observed event types such as `skill_selected`, `plan`, `step_start`, `tool_call`, `usage`, `report`, and `error`.
- Verified local dependency health with `pip check` and `npm audit --json`, recording current Python/Node baselines and unresolved environment warnings.
- Replaced unsupported benchmark claims with a reproducibility note after finding no local benchmark/eval script for historical token, tool-latency, or RAG MRR metrics.

## Optional Bullets After Later Phases

Do not use these until the corresponding phase is implemented and verified.

- Added cross-platform read-only smoke checks for service health, dependency status, and demo readiness.
- Added frontend demo prompt controls and an explicitly labeled offline replay mode based on recorded SSE fixtures.
- Added browser-side Markdown export for generated diagnosis reports without adding backend storage or download endpoints.
- Added and validated a read-only database connection diagnosis Skill using the local Skill schema and tool registry.

## Safe Interview Wording

Safe:
- "I analyzed how the Skill Router, Planner, Executor, Replanner, and Report stages interact."
- "I documented the SSE stream so frontend/demo behavior can be verified against code."
- "I clarified which parts are upstream and which parts are my packaging/documentation work."
- "I found that benchmark metrics in the README were not locally reproducible because no benchmark/eval runner exists in this checkout."
- "I kept risky operations like Docker restart behind existing guardrails and did not add destructive tools."

Unsafe:
- "I built the full LangGraph multi-agent architecture from scratch."
- "I implemented the upstream AgentHarness control plane."
- "I wrote all native Skills and MCP servers."
- "I reproduced the RAG MRR improvement."
- "The system improves tokens by 66.5%" unless a later local benchmark runner and output prove it.
- "The router always selects a specific Skill for a prompt." Say that the demo observes the actual `skill_selected` event instead.

## Evidence Map

| Claim | Evidence |
|---|---|
| Packaging docs were created | `docs/portfolio/*` |
| Ownership boundaries were documented | `docs/portfolio/ownership.md` |
| Runtime facts were inspected | `docs/portfolio/facts.md` |
| SSE contract was documented | `docs/portfolio/sse_contract.md` |
| Dependency audit was recorded | `docs/portfolio/dep_audit.md` |
| Benchmark claims are not reproduced | `docs/portfolio/benchmark_local.md` |

## One-Minute Project Pitch

"This is a packaging and verification project around an open-source Multi-Agent AIOps/RAG platform. I focused on making it honest and reproducible for interviews: I audited the local configuration, documented which code is upstream versus my additions, captured the SSE event contract, checked dependency health, and removed unsupported benchmark claims from the public narrative. The demo can show the existing Skill-first LangGraph flow selecting a playbook, planning steps, calling gated MCP tools, and streaming a Markdown report."


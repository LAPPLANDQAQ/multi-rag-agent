# Local Benchmark Reproducibility Check

Collection time: 2026-05-17T22:08:50+08:00  
Git commit: `801c7453c19f5e6f6793d1e17df69193b1772acd`  
Phase: B - benchmark/eval reproducibility check

## Objective

Determine whether this repository contains locally runnable benchmark or eval scripts, and separate reproducible facts from README or code-comment metric claims.

## Environment Notes

| Item | Observed value | Command/source | Sample size | Resume-safe use |
|---|---|---|---:|---|
| OS | `Microsoft Windows NT 10.0.26200.0` | `[System.Environment]::OSVersion.VersionString` | n=1 | Environment note only |
| Python | `Python 3.12.9` | `.\.venv\Scripts\python.exe --version` | n=1 | Environment note only |
| Node.js | `v24.14.0` | `node --version` | n=1 | Environment note only |
| Docker Compose | Docker daemon unavailable; config access warning | `docker compose ps` | n=1 | Not resume metric |
| Milvus port | `127.0.0.1:19530 timeout` | TCP probe, 500ms timeout | n=1 | Not available during check |
| Redis port | `127.0.0.1:6379 timeout` | TCP probe, 500ms timeout | n=1 | Not available during check |
| FastAPI port | `127.0.0.1:9900 timeout` | TCP probe, 500ms timeout | n=1 | Service not running during check |
| open-webSearch port | `127.0.0.1:3210 timeout` | TCP probe, 500ms timeout | n=1 | Service not running during check |
| Chat model config | `DASHSCOPE_CHAT_MODEL=qwen-max` | `.env`, value only | n=1 | Config fact only |
| Router model config | `DASHSCOPE_ROUTER_MODEL=qwen-turbo` | `.env`, value only | n=1 | Config fact only |
| Embedding model config | `DASHSCOPE_EMBEDDING_MODEL=text-embedding-v4` | `.env`, value only | n=1 | Config fact only |
| Optional third-party endpoint | Provider base URL configured | `.env`, value only | n=1 | Config fact only |
| API keys | Model-provider keys present, values redacted | `.env` presence check | n=1 | Do not disclose |
| Web search provider | `open_websearch`, base URL `http://127.0.0.1:3210` | `.env`, value only | n=1 | Config fact only |

Docker command output included:

```text
failed to connect to the docker API at npipe:////./pipe/docker_engine; check if the path is correct and if the daemon is running
```

## Search Commands Used

Search time: 2026-05-17T22:08+08:00  
Commit: `801c7453c19f5e6f6793d1e17df69193b1772acd`

```powershell
rg --files scripts docs README.md app open-webSearch-main |
  rg -i "(^|[\\/])(benchmark|bench|eval|evaluate|metrics|rag|recall|mrr)|benchmark|bench|eval|evaluate|metrics|rag|recall|mrr"
```

Output summary:

```text
app\services\rag_service.py
app\services\rag\__init__.py
app\services\rag\web_context.py
app\services\rag\utils.py
app\services\rag\retrieval.py
app\services\rag\memory.py
```

This filename search found RAG implementation modules, not benchmark or eval scripts.

```powershell
rg -n -i "benchmark|bench|eval|evaluate|metrics|recall|mrr|RAG MRR|token|工具执行|检索准确率" README.md docs scripts app open-webSearch-main\package.json
```

Output summary:
- `README.md` says the project has benchmark and RAG offline eval scripts.
- `README.md` lists token and RAG MRR metrics.
- `app/config.py` comments mention needing an eval script to tune hybrid weights.
- `app/core/hybrid_retriever.py` comments mention general recall claims from external references.
- `app/utils/splitter.py` comments mention MRR changing from `0.882` to `0.938`.
- `open-webSearch-main/package.json` contains test scripts for open-webSearch itself, not this repository's RAG benchmark.

```powershell
if (Test-Path tests) { rg --files tests } else { Write-Output 'tests directory not present' }
```

Output:

```text
tests directory not present
```

```powershell
Get-ChildItem -Path scripts -Force | Select-Object Name,Length,LastWriteTime
```

Output summary:

| Script | Benchmark/eval? | Notes |
|---|---|---|
| `convert_prometheus_alerts.py` | No | Corpus conversion utility |
| `fetch_kb_corpus.ps1` | No | Corpus fetch utility |
| `ingest_kb_corpus.py` | No | KB ingestion utility; supports dry-run smoke check |
| `mock_alert.py` | No | Alert/mock webhook utility |

## Discovered Benchmark/Eval Scripts

No local benchmark or eval script was found for:
- RAG MRR reproduction
- retrieval recall measurement
- input token before/after measurement
- tool execution latency benchmark
- end-to-end AIOps diagnosis quality evaluation

The README metric table is therefore not locally reproduced by this Phase B check.

## Attempted Runs

No benchmark/eval command was run because no benchmark/eval script was found.

The Phase A dry-run command remains a useful smoke check but is not a benchmark:

```powershell
.\.venv\Scripts\python.exe scripts\ingest_kb_corpus.py --dry-run --limit 5
```

Phase A output summary:
- 5 Markdown files scanned.
- 27 chunks produced.
- 0 split failures.
- No Milvus writes because `--dry-run` was used.

Sample size: n=5 files. This result is smoke-level and not resume-safe as a retrieval quality metric.

## README Metric Status

| README/code claim | Local reproduction status | Resume-safe? |
|---|---|---|
| Planner input tokens `9098 -> 575`, down `93.5%` | Not reproduced; no local measurement script found | No |
| Full-chain input tokens `10526 -> 2450`, down `76.7%` | Not reproduced; no local measurement script found | No |
| Full-chain total tokens `11889 -> 3988`, down `66.5%` | Not reproduced; no local measurement script found | No |
| Tool catalog input tokens down `55.3%` | Not reproduced; no local measurement script found | No |
| RAG MRR `0.882 -> 0.938` | Not reproduced; no local eval script found | No |
| Streaming usage/token display exists in code | Code-inspection only; not benchmark | Yes, as an implementation/inspection statement only |

## Required Wording

Local reproduction of upstream README benchmark metrics was not completed because no local benchmark/eval script was found for the README token, tool catalog, retrieval recall, or MRR claims. Resume-facing statements will only reference locally verified smoke checks and documented implementation work.

## Smoke-Level Alternative Proposal

A small smoke-level eval is feasible later without changing the core system:

- Use a fixed JSON/Markdown fixture of 3 to 5 public/demo incidents from `data/kb_corpus`.
- Run `scripts/ingest_kb_corpus.py --dry-run --limit N` to verify corpus parsing.
- If Milvus and the API are running, query a fixed set of questions through an existing read-only RAG path and record:
  - returned source filenames,
  - whether expected source appears in top-k,
  - latency from client-side timing,
  - model/provider config,
  - sample size.
- Keep results in `docs/portfolio/benchmark_local.md` or a new explicitly smoke-level document.

This should be described as "local smoke check" rather than "benchmark" unless it has a clear dataset, scoring rule, and repeatable runner.

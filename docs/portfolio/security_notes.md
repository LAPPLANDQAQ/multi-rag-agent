# Security And Privacy Notes

Collection time: 2026-05-17T22:50+08:00  
Scope: Security and privacy cleanup for GitHub upload, screenshots, and interview demos.  
Commit baseline: `801c7453c19f5e6f6793d1e17df69193b1772acd`  
Working tree: packaging changes are uncommitted.

## Checks Performed

Commands were run with sanitized output. Secret-like matches were reported by file, line, and pattern category only; secret values were not printed.

- `git check-ignore .env`
- `git ls-files -- .env .env.example .gitignore logs data frontend\demo_fixtures`
- `git log --oneline -- .env`
- `git log -S "sk-" --oneline --all --`
- `git log -S "DASHSCOPE_API_KEY" --oneline --all --`
- `git log -S "OPENAI_API_KEY" --oneline --all --`
- strict historical regex scan for `sk-[A-Za-z0-9_-]{20,}`, `DASHSCOPE_API_KEY=...`, and `OPENAI_API_KEY=...`
- sanitized tracked-file scan for API key, token, and strict `sk-...` patterns
- sanitized local `logs/`, `data/`, and `frontend/demo_fixtures/` scan for key/token/password/private-key/url-credential patterns
- `.env.example` placeholder review
- final validation commands listed below

## Findings

### `.env`

- `.env` is ignored by `.gitignore`.
- `.env` is not tracked by Git.
- `git log --oneline -- .env` returned no commits.
- Local `.env` exists and contains sensitive variable names such as API keys and admin tokens. Values were not copied into this document.
- Do not show `.env` in screenshots or screen shares.

### `.env.example`

- `.env.example` is tracked.
- It contains placeholders such as `your-dashscope-api-key`, empty optional provider keys, and `change-this-admin-token`.
- No plaintext production key was recorded from `.env.example`.

### Git History

- `git log -S "sk-"` returned historical commits, but strict historical regex scanning did not find an `sk-...` token-shaped secret with 20+ following characters.
- Historical `DASHSCOPE_API_KEY=...` occurrences were placeholders in `.env.example` and README examples.
- `OPENAI_API_KEY` strict history scan returned no hits.
- `.env` patch history sensitive-pattern scan returned zero hits.

If any real key was ever copied into a prompt, terminal, screenshot, or external service outside this repository, rotate it from the provider console.

### Tracked Files

- Tracked-file scan found placeholder API key assignments in `.env.example` and README examples.
- No strict `sk-...` token-shaped tracked-file hit was found.
- `data/kb_corpus/` is tracked and appears to be public/demo corpus material. It was not ignored wholesale because existing files are part of the demo evidence base.

### Local Logs And Data

- `logs/` contains local runtime logs and is ignored by Git.
- Sanitized scan found the word `token` in logs and public corpus files, but no strict `sk-...`, API-key assignment, password, private-key marker, or URL-with-credentials hit was reported.
- Do not upload or screenshot `logs/` without a fresh review. Logs can contain local paths, timing, prompts, or future tool outputs.
- `frontend/demo_fixtures/README.md` is safe documentation. Captured replay JSON files are ignored because they may contain real tool output or prompts.

## Ignore Rule Updates

`.gitignore` now covers:

- `.env`, `.env.*`, with `.env.example` explicitly allowed.
- `logs/` and common runtime log files.
- local vector/database state under `data/milvus/`, `data/redis/`, `data/minio/`, and `data/etcd/`.
- private/local data directories: `data/uploads/`, `data/private/`, `data/local/`, and `data/tmp/`.
- local DB files: `*.db`, `*.sqlite`, `*.sqlite3`.
- generated reports and exports: `reports/`, `exports/`, `generated_reports/`, `*.diagnosis.md`, and `*.report.md`.
- captured frontend replay JSON: `frontend/demo_fixtures/*.json`, while keeping `frontend/demo_fixtures/README.md`.
- local REPL/history files such as `.python_history`, `.node_repl_history`, `.psql_history`, `.rediscli_history`, and `ConsoleHost_history.txt`.

## Screenshot And Recording Checklist

Before any public screenshot, recording, or interview screen share:

- Close terminals showing `.env`, API keys, admin tokens, provider dashboards, or private file paths.
- Do not show raw `logs/` or live provider request/response payloads.
- Use public/demo inputs only.
- If offline replay JSON is added later, verify it contains no secrets, private hostnames, private IPs, personal paths, or non-public logs before sharing.
- Prefer showing `docs/portfolio/*`, `/api/v1/skills`, and the frontend demo page after confirming health checks.
- Re-run `scripts/smoke_check.ps1` before a live demo.

## Residual Risks

- Local `.env` contains real configuration and must remain local.
- Existing tracked public corpus under `data/kb_corpus/` is large and should be reviewed again if any private documents are ever added.
- Historical pickaxe hits for `sk-` were not strict token-shaped hits, but provider-side rotation is still the correct response if a real key may have been exposed outside Git.
- Runtime `/api/v1/skills` was unavailable in recent phases, so runtime screenshots should wait until services are healthy.

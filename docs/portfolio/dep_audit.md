# Dependency Audit

Collection time: 2026-05-17T22:00:39+08:00  
Git commit: `801c7453c19f5e6f6793d1e17df69193b1772acd`

## Python Audit

Command:

```powershell
.\.venv\Scripts\python.exe -m pip check
```

Sample size: n=1 command run  
Collected at: 2026-05-17T21:59+08:00  
Result: pass

Output summary:

```text
No broken requirements found.
```

Relevant baseline file: `requirements.txt`

Notable constraints observed:
- `pymilvus>=2.6.14,<3.0.0`
- `fastapi>=0.136.1,<1.0.0`
- `langgraph>=1.2.0,<2.0.0`
- `fastmcp>=3.3.1,<4.0.0`

## Node Audit

Command:

```powershell
cd open-webSearch-main
npm.cmd audit --json
```

Sample size: n=1 command run  
Collected at: 2026-05-17T21:59+08:00  
Result: pass

Output summary:

```json
{
  "vulnerabilities": {
    "info": 0,
    "low": 0,
    "moderate": 0,
    "high": 0,
    "critical": 0,
    "total": 0
  },
  "dependencies": {
    "prod": 203,
    "dev": 14,
    "optional": 0,
    "peer": 0,
    "peerOptional": 0,
    "total": 216
  }
}
```

Relevant baseline files:
- `open-webSearch-main/package.json`
- `open-webSearch-main/package-lock.json`

Notable constraints observed in `open-webSearch-main/package.json`:
- Node engine: `>=20.18.1`
- `express`: `^4.22.2`
- `zod`: `^3.25.76`
- `koffi`: `^2.16.2`

## Unresolved Warnings

- Docker commands report a local config warning: `C:\Users\wth\.docker\config.json: Access is denied`. This did not affect `pip check` or `npm audit`.
- The working tree already had local modifications to `requirements.txt`, `open-webSearch-main/package.json`, and `open-webSearch-main/package-lock.json` before Phase A documentation was created. This audit records their current local state but does not attribute those edits to Phase A.


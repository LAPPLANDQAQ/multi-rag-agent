# AIOps SSE Contract

Collection time: 2026-05-17T22:00:39+08:00  
Git commit: `801c7453c19f5e6f6793d1e17df69193b1772acd`  
Evidence level: code inspection only. No live SSE stream was captured in Phase A.

## Endpoint

Source: `app/api/v1/aiops.py`, `app/main.py`  
Sample size: n=2 code files  

- Method: `POST`
- Path: `/api/v1/aiops/diagnose`
- Request model: `DiagnosisRequest`
- Request fields:
  - `session_id`: string, default `default`
  - `query`: string, required, 1 to 4000 characters
- Response: `EventSourceResponse`
- SSE event name: always `message`
- SSE data: JSON string encoded with `ensure_ascii=False`

Example transport frame:

```text
event: message
data: {"type":"start","stage":"diagnosis_init","message":"...","data":{"query":"...","session_id":"..."}}
```

## Event Envelope

Source: `app/services/aiops_service.py`  
Sample size: n=1 helper function  

Most backend events are built with:

```json
{
  "type": "event_type",
  "stage": "stage_name",
  "message": "human-readable text",
  "data": {}
}
```

Important implementation detail: `_make_event()` stores all extra fields inside `data`. Events emitted directly by `AgentHarness.build_usage_stats_event()` and `AgentHarness.build_budget_event()` already include top-level `label`, `detail`, `elapsed_ms`, and `data`; `aiops_service` passes their top-level fields through `_make_event()`, so the final SSE places those fields inside `data`.

## Known Events

Source files:
- `app/services/aiops_service.py`
- `app/agents/executor.py`
- `app/runtime/tool_runner.py`
- `app/runtime/agent_harness.py`
- `frontend/app.js`

Sample size: n=5 code files  
Evidence: code inspection only

| Type | Stage | Data fields observed | Producer | Frontend handling |
|---|---|---|---|---|
| `start` | `diagnosis_init` | `query`, `session_id` | `stream_diagnose()` | Sets status to Skill Router working |
| `error` | `concurrency_limited` | `max_concurrency` | `stream_diagnose()` | Generic error handling |
| `transition` | reason value, for example internal transition reason | `node`, `ts`, `reason` | transition history in node output | Logged only unless frontend later handles it |
| `skill_selected` | `skill_selected` | `skill`, `reason` | `skill_router` conversion | Highlights selected Skill |
| `report` | `report_generated` | `report`, optional `fork` | `skill_router`, `replanner`, `fork_skill` conversions | Renders final Markdown report |
| `plan` | `plan_created` | `plan` | `planner` conversion | Renders plan list |
| `step_start` | `step_start` after wrapping | `iteration`, `step`, `total` | `app/agents/executor.py` via stream sink | Creates in-progress step card |
| `step_token` | `step_token` after wrapping | `iteration`, `content` | `app/runtime/tool_runner.py` via stream sink | Appends streaming text |
| `usage` | `usage` after wrapping | `round`, `input_tokens`, `output_tokens`, `total_tokens`, optional cache/model fields | `app/runtime/tool_runner.py` via stream sink | Updates monitor token counts |
| `tool_call` | `tool_call` after wrapping | `name`, `elapsed_ms`, `read_only`, `result_chars`, `status`, `iteration` | `app/runtime/tool_runner.py` via stream sink | Updates tool-call feed |
| `step_complete` | `step_executed` | `iteration`, `step`, `result_preview` | `executor` node conversion | Marks step done |
| `replan` | `plan_updated` | `plan` | `replanner` node conversion | Adds replanner adjustment row |
| `progress` | `budget_warning` or `budget_exceeded` inside data | nested `type`, `stage`, `label`, `detail`, `elapsed_ms`, budget fields | `AgentHarness.build_budget_event()` wrapped by `_make_event()` | Not explicitly handled in current `frontend/app.js` |
| `progress` | `stats` inside data | nested `type`, `stage`, `label`, `detail`, `elapsed_ms`, token/time/tool stats | `AgentHarness.build_usage_stats_event()` wrapped by `_make_event()` | Not explicitly handled in current `frontend/app.js` |
| `complete` | `diagnosis_complete` | none | `stream_diagnose()` | Sets completion status |
| `error` | `diagnosis_failed` | `error_type` | graph runner or outer exception | Renders error |
| `error` | `stream_failure` | `error_type` | `app/api/v1/aiops.py` wrapper | Renders error |

## Schema Mismatch To Track

Source: `app/schemas/aiops.py`  
Sample size: n=1 schema file  

`EventType` includes `start`, `skill_selected`, `plan`, `step_start`, `step_complete`, `replan`, `report`, `complete`, and `error`. Runtime code and frontend logic also use `transition`, `step_token`, `usage`, `tool_call`, and `progress`. This is a documentation/schema drift, not a confirmed runtime failure.

## Example Payloads From Code Inspection

`skill_selected`:

```json
{
  "type": "skill_selected",
  "stage": "skill_selected",
  "message": "已选定 Skill: host_resource_diagnosis",
  "data": {
    "skill": "host_resource_diagnosis",
    "reason": "User input matches host resource triggers"
  }
}
```

`step_complete`:

```json
{
  "type": "step_complete",
  "stage": "step_executed",
  "message": "完成第 1 步",
  "data": {
    "iteration": 1,
    "step": "收集关键证据",
    "result_preview": "..."
  }
}
```

`tool_call` after wrapping:

```json
{
  "type": "tool_call",
  "stage": "tool_call",
  "message": "",
  "data": {
    "name": "docker_ps",
    "elapsed_ms": 123,
    "read_only": true,
    "result_chars": 200,
    "status": "ok",
    "iteration": 1
  }
}
```

## Uncertainty

- No runtime SSE capture was available in Phase A.
- `/api/v1/skills` timed out, so this contract is not correlated with a live server session.
- Some emitted events are not represented in `app/schemas/aiops.py`; update docs or schema only in a later approved phase.


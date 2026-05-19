# Offline Demo Replay Fixtures

This directory stores persistent offline demo fixtures for the AIOps web UI.

Fixtures must be generated from a real `POST /api/v1/aiops/diagnose` SSE run. Do not create synthetic, edited, or invented event streams.

## Fixture Format

The frontend recorder downloads JSON in this shape:

```json
{
  "metadata": {
    "schema_version": 1,
    "recorded_at": "2026-05-18T12:00:00.000Z",
    "source": "real_sse",
    "scenario_id": "local-resource",
    "input": "My computer is very slow...",
    "app_commit": "unknown",
    "event_count": 12,
    "duration_ms": 3456
  },
  "events": [
    {
      "event": "message",
      "data": {
        "type": "start",
        "stage": "diagnosis_init",
        "message": "...",
        "data": {
          "query": "...",
          "session_id": "..."
        }
      },
      "timestamp": "2026-05-18T12:00:00.100Z",
      "offset_ms": 100
    }
  ]
}
```

`metadata.source` must be `real_sse`, and `metadata.event_count` must be greater than zero.

## Installing A Downloaded Fixture

Use the helper script from the repository root:

```powershell
python scripts/install_demo_fixture.py path/to/downloaded_fixture.json --id host_resource_demo --title "Host resource diagnosis demo"
```

The script validates the recording, copies it into this directory, and updates `manifest.json`. The web UI loads `manifest.json` at startup and never calls the backend during offline playback.

## Safety

Review the downloaded JSON before installing or committing it. Remove secrets, tokens, private hostnames, internal IPs, personal paths, and private log content. Keep the selected Skill, event order, event data, and report as recorded; do not improve or fabricate the stream.

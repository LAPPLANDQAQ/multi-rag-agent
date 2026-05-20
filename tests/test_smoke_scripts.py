from pathlib import Path


def test_smoke_and_agentops_scripts_exist():
    expected = [
        "scripts/smoke_check.ps1",
        "scripts/smoke_check.sh",
        "scripts/init_agentops_db.py",
        "scripts/run_agent_eval.py",
    ]

    for script in expected:
        path = Path(script)
        assert path.is_file(), script
        assert path.stat().st_size > 0, script

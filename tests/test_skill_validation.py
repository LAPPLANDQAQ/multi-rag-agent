import subprocess
import sys
from pathlib import Path

from scripts.validate_skill import iter_default_skill_paths, validate_skills


def test_validate_skill_module_validates_builtin_skills():
    paths = iter_default_skill_paths()

    assert paths
    assert validate_skills(paths) == 0


def test_validate_skill_cli_help_is_import_safe():
    result = subprocess.run(
        [sys.executable, "scripts/validate_skill.py", "--help"],
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0
    assert "Validate one SKILL.md file" in result.stdout


def test_validate_skill_script_exists():
    assert Path("scripts/validate_skill.py").is_file()

"""Validate SKILL.md files without starting application services.

The validator intentionally stays read-only:
- parses the supplied SKILL.md through the project loader
- checks required fields and directory naming
- checks allowed_tools against the local static tool metadata registry
- emits clear diagnostics and exits non-zero on validation errors
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Iterable

from loguru import logger


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.skills.loader import SkillLoadError, load_skill_from_file  # noqa: E402
from app.tools.meta import TOOL_META, get_meta  # noqa: E402

logger.remove()


DEFAULT_SKILLS_DIR = PROJECT_ROOT / "app" / "skills" / "definitions"
REQUIRED_FIELDS = ("name", "display_name", "description", "allowed_tools", "risk_level")
VALID_RISK_LEVELS = {"low", "medium", "high"}


def _display_path(path: Path) -> str:
    try:
        return str(path.relative_to(PROJECT_ROOT))
    except ValueError:
        return str(path)


def _emit(prefix: str, message: str) -> None:
    print(f"[{prefix}] {message}")


def _validate_path(path: Path) -> list[str]:
    errors: list[str] = []
    if not path.exists():
        errors.append(f"file does not exist: {_display_path(path)}")
        return errors
    if not path.is_file():
        errors.append(f"path is not a file: {_display_path(path)}")
    if path.name != "SKILL.md":
        errors.append(f"expected filename SKILL.md, got {path.name!r}")
    return errors


def _validate_required_fields(skill: object) -> list[str]:
    errors: list[str] = []
    for field in REQUIRED_FIELDS:
        value = getattr(skill, field, None)
        if value is None:
            errors.append(f"missing required field: {field}")
        elif isinstance(value, str) and not value.strip():
            errors.append(f"required field is empty: {field}")
        elif isinstance(value, list) and not value:
            errors.append(f"required list field is empty: {field}")
    return errors


def _validate_tools(tool_names: Iterable[str], skill_risk_level: str) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    seen: set[str] = set()

    for tool_name in tool_names:
        if tool_name in seen:
            errors.append(f"duplicate allowed_tool: {tool_name}")
            continue
        seen.add(tool_name)

        if tool_name not in TOOL_META:
            errors.append(f"unknown allowed_tool: {tool_name}")
            continue

        meta = get_meta(tool_name)
        if not meta.read_only:
            warnings.append(f"allowed_tool is not read-only: {tool_name} (risk={meta.risk_level})")
        if meta.risk_level == "high" or meta.destructive:
            warnings.append(f"allowed_tool is high-risk/destructive: {tool_name}")
        if skill_risk_level == "low" and (not meta.read_only or meta.risk_level == "high" or meta.destructive):
            errors.append(f"low-risk Skill cannot allow non-read-only/high-risk tool: {tool_name}")

    return errors, warnings


def validate_skill(path: Path) -> int:
    errors = _validate_path(path)
    warnings: list[str] = []
    if errors:
        for error in errors:
            _emit("ERROR", error)
        return 1

    try:
        skill = load_skill_from_file(path)
    except SkillLoadError as exc:
        _emit("ERROR", f"loader rejected {_display_path(path)}: {exc}")
        return 1

    _emit("OK", f"loaded {_display_path(path)} as {skill.name!r}")

    required_errors = _validate_required_fields(skill)
    errors.extend(required_errors)
    if not required_errors:
        _emit("OK", f"required fields present: {', '.join(REQUIRED_FIELDS)}")

    if skill.risk_level not in VALID_RISK_LEVELS:
        errors.append(f"invalid risk_level: {skill.risk_level!r}")
    else:
        _emit("OK", f"risk_level: {skill.risk_level}")

    parent_name = path.parent.name
    if parent_name != skill.name:
        errors.append(f"directory name {parent_name!r} must match skill name {skill.name!r}")
    else:
        _emit("OK", "directory name matches skill name")

    if not skill.playbook.strip():
        errors.append("playbook body is empty")
    else:
        _emit("OK", f"playbook body present ({len(skill.playbook)} chars)")

    tool_errors, tool_warnings = _validate_tools(skill.allowed_tools, skill.risk_level)
    errors.extend(tool_errors)
    warnings.extend(tool_warnings)
    if not tool_errors:
        _emit("OK", f"allowed_tools registered: {', '.join(skill.allowed_tools)}")

    for warning in warnings:
        _emit("WARN", warning)
    for error in errors:
        _emit("ERROR", error)

    if errors:
        _emit("FAIL", f"{len(errors)} error(s), {len(warnings)} warning(s)")
        return 1

    _emit("PASS", f"{skill.name} is valid ({len(warnings)} warning(s))")
    return 0


def iter_default_skill_paths() -> list[Path]:
    """Return built-in Skill files in deterministic order."""

    return sorted(DEFAULT_SKILLS_DIR.glob("*/SKILL.md"))


def validate_skills(paths: Iterable[Path]) -> int:
    total = 0
    failures = 0
    for path in paths:
        if total:
            print()
        total += 1
        if validate_skill(path.resolve()) != 0:
            failures += 1

    if total == 0:
        _emit("ERROR", f"no Skill files found under {_display_path(DEFAULT_SKILLS_DIR)}")
        return 1

    prefix = "PASS" if failures == 0 else "FAIL"
    _emit(prefix, f"validated {total} skill file(s), {failures} failure(s)")
    return 1 if failures else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Validate one SKILL.md file, or all built-in Skills when no path is provided."
    )
    parser.add_argument(
        "skill_path",
        type=Path,
        nargs="?",
        help="Optional path to one SKILL.md file. Defaults to app/skills/definitions/*/SKILL.md.",
    )
    args = parser.parse_args(argv)
    if args.skill_path:
        return validate_skill(args.skill_path.resolve())
    return validate_skills(iter_default_skill_paths())


if __name__ == "__main__":
    raise SystemExit(main())

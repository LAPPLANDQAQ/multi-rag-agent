"""Install a real AIOps SSE recording as a frontend offline demo fixture."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
FIXTURE_DIR = REPO_ROOT / "frontend" / "demo_fixtures"
MANIFEST_PATH = FIXTURE_DIR / "manifest.json"
FIXTURE_ID_RE = re.compile(r"^[A-Za-z0-9_-]+$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Install a downloaded real_sse recording into frontend/demo_fixtures/."
    )
    parser.add_argument("fixture_json", help="Path to the downloaded fixture JSON.")
    parser.add_argument("--id", required=True, help="Stable fixture id, e.g. host_resource_demo.")
    parser.add_argument("--title", required=True, help="Human-readable title shown in the UI.")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite an existing fixture file and manifest entry with the same id.",
    )
    return parser.parse_args()


def load_json(path: Path) -> dict[str, Any]:
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError as exc:
        raise ValueError(f"file not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid JSON in {path}: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError("fixture JSON must be an object with metadata and events")
    return data


def validate_fixture(data: dict[str, Any]) -> dict[str, Any]:
    metadata = data.get("metadata")
    if not isinstance(metadata, dict):
        raise ValueError("fixture metadata must be an object")
    if metadata.get("source") != "real_sse":
        raise ValueError('fixture metadata.source must be "real_sse"')
    try:
        event_count = int(metadata.get("event_count", 0))
    except (TypeError, ValueError) as exc:
        raise ValueError("fixture metadata.event_count must be an integer") from exc
    if event_count <= 0:
        raise ValueError("fixture metadata.event_count must be greater than zero")
    events = data.get("events")
    if not isinstance(events, list) or not events:
        raise ValueError("fixture events must be a non-empty array")
    return metadata


def validate_fixture_id(fixture_id: str) -> None:
    if not FIXTURE_ID_RE.fullmatch(fixture_id):
        raise ValueError("--id may only contain letters, numbers, underscores, and hyphens")


def load_manifest() -> dict[str, Any]:
    if not MANIFEST_PATH.exists():
        return {"fixtures": []}
    try:
        with MANIFEST_PATH.open("r", encoding="utf-8") as f:
            manifest = json.load(f)
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid manifest JSON in {MANIFEST_PATH}: {exc}") from exc
    if not isinstance(manifest, dict):
        raise ValueError("manifest.json must be an object")
    fixtures = manifest.get("fixtures")
    if fixtures is None:
        manifest["fixtures"] = []
    elif not isinstance(fixtures, list):
        raise ValueError("manifest.json fixtures must be an array")
    return manifest


def write_manifest(manifest: dict[str, Any]) -> None:
    FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    with MANIFEST_PATH.open("w", encoding="utf-8", newline="\n") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
        f.write("\n")


def install_fixture(
    source_path: Path,
    *,
    fixture_id: str,
    title: str,
    force: bool,
) -> Path:
    validate_fixture_id(fixture_id)
    data = load_json(source_path)
    metadata = validate_fixture(data)

    FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    dest_name = f"{fixture_id}.json"
    dest_path = FIXTURE_DIR / dest_name
    if dest_path.exists() and not force:
        raise ValueError(f"{dest_path} already exists; pass --force to overwrite it")

    manifest = load_manifest()
    existing = [
        item
        for item in manifest["fixtures"]
        if isinstance(item, dict) and (item.get("id") == fixture_id or item.get("path") == dest_name)
    ]
    if existing and not force:
        raise ValueError(f"manifest already contains fixture id/path {fixture_id}; pass --force")

    if source_path.resolve() != dest_path.resolve():
        shutil.copy2(source_path, dest_path)

    manifest["fixtures"] = [
        item
        for item in manifest["fixtures"]
        if not (
            isinstance(item, dict)
            and (item.get("id") == fixture_id or item.get("path") == dest_name)
        )
    ]
    manifest["fixtures"].append(
        {
            "id": fixture_id,
            "title": title,
            "path": dest_name,
            "recorded_at": metadata.get("recorded_at", ""),
            "event_count": int(metadata.get("event_count", 0)),
            "duration_ms": int(metadata.get("duration_ms", 0) or 0),
            "source": metadata.get("source", ""),
        }
    )
    write_manifest(manifest)
    return dest_path


def main() -> int:
    args = parse_args()
    try:
        installed = install_fixture(
            Path(args.fixture_json),
            fixture_id=args.id,
            title=args.title,
            force=args.force,
        )
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    print(f"installed fixture: {installed.relative_to(REPO_ROOT)}")
    print(f"updated manifest: {MANIFEST_PATH.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

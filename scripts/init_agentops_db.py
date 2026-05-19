"""Initialize the AgentOps SQLite database."""

from pathlib import Path
import sys

from sqlalchemy import inspect

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.agentops import models  # noqa: F401,E402
from app.agentops.db import Base, create_engine, redact_db_url  # noqa: E402
from app.config import settings  # noqa: E402


def main() -> int:
    try:
        engine = create_engine(settings.agentops_db_url)
        Base.metadata.create_all(bind=engine)
        existing_tables = set(inspect(engine).get_table_names())
        expected_tables = sorted(Base.metadata.tables.keys())

        print(f"AgentOps database URL: {redact_db_url(settings.agentops_db_url)}")
        print("Created/verified tables:")
        for table_name in expected_tables:
            status = "ok" if table_name in existing_tables else "missing"
            print(f"- {table_name}: {status}")

        missing = [table for table in expected_tables if table not in existing_tables]
        return 1 if missing else 0
    except Exception as exc:
        print(f"AgentOps database initialization failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

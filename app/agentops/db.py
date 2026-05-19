"""SQLAlchemy engine and session helpers for AgentOps."""

from pathlib import Path
from typing import Iterator

from sqlalchemy import create_engine as sqlalchemy_create_engine
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    """Base class for AgentOps ORM models."""


def ensure_sqlite_parent_dir(db_url: str) -> None:
    """Create the parent directory for file-backed SQLite URLs."""

    url = make_url(db_url)
    if not url.drivername.startswith("sqlite"):
        return
    if not url.database or url.database == ":memory:":
        return

    Path(url.database).expanduser().parent.mkdir(parents=True, exist_ok=True)


def create_engine(db_url: str | None = None) -> Engine:
    """Create an AgentOps SQLAlchemy engine."""

    resolved_url = db_url or settings.agentops_db_url
    ensure_sqlite_parent_dir(resolved_url)

    kwargs: dict[str, object] = {"future": True}
    if make_url(resolved_url).drivername.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}

    return sqlalchemy_create_engine(resolved_url, **kwargs)


def create_session_factory(engine: Engine) -> sessionmaker[Session]:
    """Create a short-lived session factory bound to an engine."""

    return sessionmaker(
        bind=engine,
        autoflush=False,
        autocommit=False,
        expire_on_commit=False,
    )


engine = create_engine()
SessionLocal = create_session_factory(engine)


def get_session() -> Iterator[Session]:
    """Yield one short-lived AgentOps session."""

    with SessionLocal() as session:
        yield session


def create_all(bind: Engine | None = None) -> None:
    """Create all AgentOps tables."""

    Base.metadata.create_all(bind=bind or engine)


def redact_db_url(db_url: str) -> str:
    """Redact password material from a SQLAlchemy URL string."""

    url = make_url(db_url)
    if url.password is None:
        return str(url)
    return str(url.set(password="***"))

"""Pydantic schemas for the AgentOps data layer."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


TagInput = list[str] | str | None


class OrmModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class DiagnosisRunCreate(BaseModel):
    session_id: str | None = None
    title: str | None = None
    input_text: str
    selected_skill: str | None = None
    status: Literal["running", "succeeded", "failed"] = "running"
    started_at: datetime | None = None
    finished_at: datetime | None = None
    duration_ms: int | None = None
    event_count: int = 0
    tool_call_count: int = 0
    report_markdown: str | None = None
    error_message: str | None = None
    fixture_id: str | None = None


class DiagnosisRunUpdate(BaseModel):
    session_id: str | None = None
    title: str | None = None
    selected_skill: str | None = None
    status: Literal["running", "succeeded", "failed"] | None = None
    finished_at: datetime | None = None
    duration_ms: int | None = None
    event_count: int | None = None
    tool_call_count: int | None = None
    report_markdown: str | None = None
    error_message: str | None = None
    fixture_id: str | None = None


class DiagnosisRunRead(OrmModel):
    id: str
    session_id: str | None
    title: str
    input_text: str
    selected_skill: str | None
    status: str
    started_at: datetime
    finished_at: datetime | None
    duration_ms: int | None
    event_count: int
    tool_call_count: int
    report_markdown: str | None
    error_message: str | None
    fixture_id: str | None
    created_at: datetime


class DiagnosisRunList(BaseModel):
    items: list[DiagnosisRunRead]
    total: int
    limit: int
    offset: int


class DemoScenarioCreate(BaseModel):
    id: str
    title: str
    description: str | None = None
    input_text: str
    expected_skill: str | None = None
    tags: TagInput = None
    is_builtin: bool = False


class DemoScenarioUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    input_text: str | None = None
    expected_skill: str | None = None
    tags: TagInput = Field(default=None)
    is_builtin: bool | None = None


class DemoScenarioRead(OrmModel):
    id: str
    title: str
    description: str | None
    input_text: str
    expected_skill: str | None
    tags: str | None
    is_builtin: bool
    created_at: datetime
    updated_at: datetime


class DemoScenarioList(BaseModel):
    items: list[DemoScenarioRead]
    total: int
    limit: int
    offset: int


class EvalCaseCreate(BaseModel):
    id: str
    name: str
    input_text: str
    expected_skill: str | None = None
    expected_tools: TagInput = None
    tags: TagInput = None
    enabled: bool = True


class EvalCaseUpdate(BaseModel):
    name: str | None = None
    input_text: str | None = None
    expected_skill: str | None = None
    expected_tools: TagInput = Field(default=None)
    tags: TagInput = Field(default=None)
    enabled: bool | None = None


class EvalCaseRead(OrmModel):
    id: str
    name: str
    input_text: str
    expected_skill: str | None
    expected_tools: str | None
    tags: str | None
    enabled: bool
    created_at: datetime
    updated_at: datetime


class EvalCaseList(BaseModel):
    items: list[EvalCaseRead]
    total: int
    limit: int
    offset: int


class EvalResultCreate(BaseModel):
    case_id: str | None = None
    run_id: str | None = None
    mode: Literal["offline", "live"] = "offline"
    skill_match: bool | None = None
    has_report: bool = False
    has_error: bool = False
    event_count: int = 0
    tool_call_count: int = 0
    duration_ms: int | None = None
    score: float | None = None
    detail_json: str | None = None


class EvalResultRead(OrmModel):
    id: str
    case_id: str | None
    run_id: str | None
    mode: str
    skill_match: bool | None
    has_report: bool
    has_error: bool
    event_count: int
    tool_call_count: int
    duration_ms: int | None
    score: float | None
    detail_json: str | None
    created_at: datetime


class EvalResultList(BaseModel):
    items: list[EvalResultRead]
    total: int
    limit: int
    offset: int


class EvalResultSummary(BaseModel):
    total: int
    skill_match_count: int
    report_count: int
    error_count: int
    average_score: float | None

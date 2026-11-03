from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Job:
    id: str
    kind: str
    status: str
    options: dict[str, Any]
    input_assets: list[str]
    result_assets: list[dict[str, Any]] = field(default_factory=list)
    manifest_path: str | None = None
    export_path: str | None = None
    progress: int = 0
    message: str = ""
    error: str | None = None
    attempts: int = 0
    max_attempts: int = 2
    created_at: str = ""
    updated_at: str = ""
    started_at: str | None = None
    finished_at: str | None = None
    next_attempt_at: str | None = None


@dataclass
class PipelineResult:
    assets: list[dict[str, Any]]
    manifest: dict[str, Any]
    message: str = "处理完成"


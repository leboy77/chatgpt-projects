from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from .models import Job


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


class JobStore:
    """Small durable job store based on SQLite.

    A dedicated connection is opened for each operation so worker threads and
    request threads never share a connection.
    """

    def __init__(self, database_path: Path, default_max_attempts: int = 2):
        self.database_path = Path(database_path)
        self.default_max_attempts = default_max_attempts
        self._lock = threading.RLock()
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(
            self.database_path, timeout=15, isolation_level=None
        )
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA foreign_keys=ON")
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS jobs (
                    id TEXT PRIMARY KEY,
                    kind TEXT NOT NULL,
                    status TEXT NOT NULL,
                    options_json TEXT NOT NULL,
                    input_assets_json TEXT NOT NULL,
                    result_assets_json TEXT NOT NULL,
                    manifest_path TEXT,
                    export_path TEXT,
                    progress INTEGER NOT NULL DEFAULT 0,
                    message TEXT NOT NULL DEFAULT '',
                    error TEXT,
                    attempts INTEGER NOT NULL DEFAULT 0,
                    max_attempts INTEGER NOT NULL DEFAULT 2,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    started_at TEXT,
                    finished_at TEXT,
                    next_attempt_at TEXT
                )
                """
            )
            connection.execute(
                "CREATE INDEX IF NOT EXISTS idx_jobs_status_created "
                "ON jobs(status, created_at)"
            )
            columns = {
                row["name"]
                for row in connection.execute("PRAGMA table_info(jobs)")
            }
            if "export_path" not in columns:
                connection.execute(
                    "ALTER TABLE jobs ADD COLUMN export_path TEXT"
                )

    def create_job(
        self,
        kind: str,
        options: dict[str, Any],
        input_assets: list[str],
        *,
        status: str = "queued",
    ) -> Job:
        job_id = uuid.uuid4().hex
        now = utc_now()
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                INSERT INTO jobs (
                    id, kind, status, options_json, input_assets_json,
                    result_assets_json, max_attempts, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, '[]', ?, ?, ?)
                """,
                (
                    job_id,
                    kind,
                    status,
                    json.dumps(options, ensure_ascii=False),
                    json.dumps(input_assets, ensure_ascii=False),
                    self.default_max_attempts,
                    now,
                    now,
                ),
            )
        return self.get(job_id)

    def enqueue_job(self, job_id: str) -> None:
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                UPDATE jobs SET
                    status = 'queued',
                    message = '等待执行',
                    updated_at = ?
                WHERE id = ? AND status = 'draft'
                """,
                (utc_now(), job_id),
            )

    def get(self, job_id: str) -> Job:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM jobs WHERE id = ?", (job_id,)
            ).fetchone()
        if row is None:
            raise KeyError(job_id)
        return self._row_to_job(row)

    def set_input_assets(self, job_id: str, input_assets: list[str]) -> None:
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                UPDATE jobs SET input_assets_json = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    json.dumps(input_assets, ensure_ascii=False),
                    utc_now(),
                    job_id,
                ),
            )

    def list(self, limit: int = 30) -> list[Job]:
        limit = max(1, min(limit, 100))
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?", (limit,)
            ).fetchall()
        return [self._row_to_job(row) for row in rows]

    def claim_next(self) -> Job | None:
        with self._lock, self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            try:
                row = connection.execute(
                    """
                    SELECT id FROM jobs
                    WHERE status = 'queued'
                      AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
                    ORDER BY created_at ASC
                    LIMIT 1
                    """,
                    (utc_now(),),
                ).fetchone()
                if row is None:
                    connection.execute("COMMIT")
                    return None
                now = utc_now()
                connection.execute(
                    """
                    UPDATE jobs SET
                        status = 'running',
                        attempts = attempts + 1,
                        progress = 1,
                        message = '任务执行中',
                        error = NULL,
                        started_at = COALESCE(started_at, ?),
                        updated_at = ?,
                        next_attempt_at = NULL
                    WHERE id = ? AND status = 'queued'
                    """,
                    (now, now, row["id"]),
                )
                connection.execute("COMMIT")
            except Exception:
                connection.execute("ROLLBACK")
                raise
        return self.get(row["id"])

    def update_progress(
        self, job_id: str, progress: int, message: str | None = None
    ) -> None:
        progress = max(0, min(100, int(progress)))
        with self._lock, self._connect() as connection:
            if message is None:
                connection.execute(
                    "UPDATE jobs SET progress = ?, updated_at = ? WHERE id = ?",
                    (progress, utc_now(), job_id),
                )
            else:
                connection.execute(
                    """
                    UPDATE jobs SET progress = ?, message = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (progress, message, utc_now(), job_id),
                )

    def set_export_path(self, job_id: str, export_path: str) -> None:
        with self._lock, self._connect() as connection:
            connection.execute(
                "UPDATE jobs SET export_path = ?, updated_at = ? WHERE id = ?",
                (export_path, utc_now(), job_id),
            )

    def mark_succeeded(
        self,
        job_id: str,
        result_assets: list[dict[str, Any]],
        manifest_path: str,
        message: str,
        export_path: str | None = None,
    ) -> None:
        now = utc_now()
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                UPDATE jobs SET
                    status = 'succeeded',
                    result_assets_json = ?,
                    manifest_path = ?,
                    export_path = ?,
                    progress = 100,
                    message = ?,
                    error = NULL,
                    updated_at = ?,
                    finished_at = ?,
                    next_attempt_at = NULL
                WHERE id = ?
                """,
                (
                    json.dumps(result_assets, ensure_ascii=False),
                    manifest_path,
                    export_path,
                    message,
                    now,
                    now,
                    job_id,
                ),
            )

    def mark_failed(
        self,
        job_id: str,
        error: str,
        *,
        final: bool = False,
        retry_delay_seconds: int = 2,
    ) -> str:
        """Record a failure and return the resulting status."""
        with self._lock, self._connect() as connection:
            row = connection.execute(
                "SELECT attempts, max_attempts FROM jobs WHERE id = ?", (job_id,)
            ).fetchone()
            if row is None:
                raise KeyError(job_id)
            now = utc_now()
            if final or row["attempts"] >= row["max_attempts"]:
                connection.execute(
                    """
                    UPDATE jobs SET
                        status = 'failed',
                        error = ?,
                        message = '任务失败',
                        updated_at = ?,
                        finished_at = ?,
                        next_attempt_at = NULL
                    WHERE id = ?
                    """,
                    (error, now, now, job_id),
                )
                return "failed"
            next_attempt = (
                datetime.now(timezone.utc)
                + timedelta(seconds=max(1, retry_delay_seconds))
            ).isoformat(timespec="milliseconds")
            connection.execute(
                """
                UPDATE jobs SET
                    status = 'queued',
                    error = ?,
                    message = '等待重试',
                    progress = 0,
                    updated_at = ?,
                    next_attempt_at = ?
                WHERE id = ?
                """,
                (error, now, next_attempt, job_id),
            )
            return "queued"

    def recover_orphaned(self) -> int:
        with self._lock, self._connect() as connection:
            cursor = connection.execute(
                """
                UPDATE jobs SET
                    status = 'queued',
                    message = '服务重启，任务重新排队',
                    progress = 0,
                    updated_at = ?,
                    next_attempt_at = NULL
                WHERE status = 'running'
                """,
                (utc_now(),),
            )
            return cursor.rowcount

    @staticmethod
    def _row_to_job(row: sqlite3.Row) -> Job:
        return Job(
            id=row["id"],
            kind=row["kind"],
            status=row["status"],
            options=json.loads(row["options_json"]),
            input_assets=json.loads(row["input_assets_json"]),
            result_assets=json.loads(row["result_assets_json"]),
            manifest_path=row["manifest_path"],
            export_path=row["export_path"],
            progress=row["progress"],
            message=row["message"],
            error=row["error"],
            attempts=row["attempts"],
            max_attempts=row["max_attempts"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            started_at=row["started_at"],
            finished_at=row["finished_at"],
            next_attempt_at=row["next_attempt_at"],
        )

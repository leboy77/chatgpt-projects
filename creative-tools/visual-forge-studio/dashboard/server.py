from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import json
import mimetypes
import os
import re
import secrets
import sqlite3
import threading
import time
import uuid
from datetime import datetime, timezone
from email import policy
from email.parser import BytesParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlsplit

try:
    from PIL import Image
except Exception:  # pragma: no cover - Docker installs Pillow via requirements.txt.
    Image = None


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"


def load_env() -> None:
    env_file = BASE_DIR / ".env"
    if not env_file.exists():
        return
    for raw_line in env_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("\"'")
        if key and key not in os.environ:
            os.environ[key] = value


load_env()


class Settings:
    def __init__(self) -> None:
        self.host = os.getenv("DASHBOARD_HOST", "127.0.0.1")
        self.port = int(os.getenv("DASHBOARD_PORT", "8766"))
        data_value = os.getenv("DASHBOARD_DATA_DIR", str(BASE_DIR / "data"))
        data_path = Path(data_value).expanduser()
        if not data_path.is_absolute():
            data_path = BASE_DIR / data_path
        self.data_dir = data_path.resolve()
        self.admin_user = os.getenv("DASHBOARD_ADMIN_USER", "admin")
        self.admin_password = os.getenv("DASHBOARD_ADMIN_PASSWORD", "admin123")
        self.token_secret = os.getenv("DASHBOARD_TOKEN_SECRET", "").strip()
        self.allowed_origins = os.getenv("DASHBOARD_ALLOWED_ORIGINS", "*")
        self.ensure_directories()

    def ensure_directories(self) -> None:
        (self.data_dir / "files").mkdir(parents=True, exist_ok=True)
        (self.data_dir / "thumbs").mkdir(parents=True, exist_ok=True)

    @property
    def database_path(self) -> Path:
        return self.data_dir / "dashboard.sqlite3"

    @property
    def secret_path(self) -> Path:
        return self.data_dir / "secret.key"

    def secret(self) -> str:
        if self.token_secret:
            return self.token_secret
        if self.secret_path.exists():
            return self.secret_path.read_text(encoding="utf-8").strip()
        value = secrets.token_urlsafe(48)
        self.secret_path.write_text(value, encoding="utf-8")
        return value


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def new_id() -> str:
    return uuid.uuid4().hex


def safe_filename(value: str) -> str:
    stem = Path(value).stem
    suffix = Path(value).suffix.lower()
    stem = re.sub(r"[^\w.-]+", "-", stem, flags=re.UNICODE).strip(".-")
    return f"{stem[:80] or 'file'}{suffix[:10]}"


def password_hash(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000
    )
    return f"pbkdf2_sha256${salt}${digest.hex()}"


def password_matches(password: str, encoded: str) -> bool:
    try:
        _, salt, expected = encoded.split("$", 2)
    except ValueError:
        return False
    actual = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000
    ).hex()
    return hmac.compare_digest(actual, expected)


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


class Database:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._lock = threading.RLock()
        self._connect()
        self._initialize()
        self._bootstrap()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(
            self.settings.database_path, timeout=15, isolation_level=None
        )
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA foreign_keys=ON")
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    username TEXT NOT NULL UNIQUE,
                    display_name TEXT NOT NULL,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'member',
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    created_by TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS project_members (
                    project_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'member',
                    PRIMARY KEY (project_id, user_id)
                );

                CREATE TABLE IF NOT EXISTS tasks (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    group_id TEXT,
                    module TEXT NOT NULL,
                    sku TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'completed',
                    prompt TEXT NOT NULL DEFAULT '',
                    options_json TEXT NOT NULL DEFAULT '{}',
                    error TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    completed_at TEXT
                );

                CREATE TABLE IF NOT EXISTS artifacts (
                    id TEXT PRIMARY KEY,
                    task_id TEXT NOT NULL,
                    kind TEXT NOT NULL DEFAULT 'image',
                    filename TEXT NOT NULL,
                    mime TEXT NOT NULL,
                    size INTEGER NOT NULL,
                    sha256 TEXT NOT NULL,
                    storage_key TEXT NOT NULL,
                    thumb_key TEXT,
                    width INTEGER,
                    height INTEGER,
                    metadata_json TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at);
                CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
                CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
                CREATE INDEX IF NOT EXISTS idx_artifacts_task ON artifacts(task_id);
                """
            )

    def _bootstrap(self) -> None:
        settings = self.settings
        with self._connect() as connection:
            row = connection.execute(
                "SELECT id FROM users WHERE username = ?", (settings.admin_user,)
            ).fetchone()
            if row:
                return
            admin_id = new_id()
            now = now_iso()
            connection.execute(
                """
                INSERT INTO users (id, username, display_name, password_hash, role, created_at)
                VALUES (?, ?, ?, ?, 'admin', ?)
                """,
                (
                    admin_id,
                    settings.admin_user,
                    "管理员",
                    password_hash(settings.admin_password),
                    now,
                ),
            )
            project_id = new_id()
            connection.execute(
                """
                INSERT INTO projects (id, name, description, created_by, created_at)
                VALUES (?, '默认项目', '插件默认上报项目', ?, ?)
                """,
                (project_id, admin_id, now),
            )
            connection.execute(
                """
                INSERT INTO project_members (project_id, user_id, role)
                VALUES (?, ?, 'admin')
                """,
                (project_id, admin_id),
            )

    def execute(self, sql: str, params: tuple = ()) -> None:
        with self._lock, self._connect() as connection:
            connection.execute(sql, params)

    def query_one(self, sql: str, params: tuple = ()) -> sqlite3.Row | None:
        with self._connect() as connection:
            return connection.execute(sql, params).fetchone()

    def query_all(self, sql: str, params: tuple = ()) -> list[sqlite3.Row]:
        with self._connect() as connection:
            return connection.execute(sql, params).fetchall()


class Auth:
    def __init__(self, settings: Settings):
        self.settings = settings

    def issue(self, user: sqlite3.Row) -> str:
        now = int(time.time())
        payload = {
            "sub": user["id"],
            "role": user["role"],
            "iat": now,
            "exp": now + 7 * 24 * 3600,
        }
        header = {"alg": "HS256", "typ": "JWT"}
        body = (
            b64url(json.dumps(header, separators=(",", ":")).encode("utf-8"))
            + "."
            + b64url(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
        )
        signature = hmac.new(
            self.settings.secret().encode("utf-8"), body.encode("ascii"), hashlib.sha256
        ).digest()
        return body + "." + b64url(signature)

    def verify(self, token: str) -> dict[str, Any] | None:
        try:
            body, signature = token.rsplit(".", 1)
            expected = hmac.new(
                self.settings.secret().encode("utf-8"),
                body.encode("ascii"),
                hashlib.sha256,
            ).digest()
            if not hmac.compare_digest(expected, b64url_decode(signature)):
                return None
            _, payload_text = body.split(".", 1)
            payload = json.loads(b64url_decode(payload_text).decode("utf-8"))
            if int(payload.get("exp", 0)) < int(time.time()):
                return None
            return payload
        except Exception:
            return None


def make_thumbnail(data: bytes, thumb_path: Path) -> tuple[int | None, int | None]:
    if Image is None:
        return None, None
    try:
        with Image.open(__import__("io").BytesIO(data)) as image:
            image.load()
            width, height = image.size
            image.thumbnail((520, 520))
            image.convert("RGB").save(thumb_path, "WEBP", quality=82)
            return width, height
    except Exception:
        return None, None


class DashboardHandler(BaseHTTPRequestHandler):
    server_version = "VisualForgeDashboard/0.1"
    sys_version = ""

    @property
    def db(self) -> Database:
        return self.server.db

    @property
    def auth(self) -> Auth:
        return self.server.auth

    def log_message(self, format: str, *args: Any) -> None:
        print(f"[dashboard] {self.address_string()} - {format % args}", flush=True)

    def _cors(self) -> None:
        origin = self.headers.get("Origin", "")
        allowed = self.server.settings.allowed_origins
        if origin and (allowed == "*" or origin in allowed.split(",")):
            self.send_header(
                "Access-Control-Allow-Origin", "*" if allowed == "*" else origin
            )
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE")

    def _json(self, status: int, payload: Any) -> None:
        content = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self._cors()
        self.end_headers()
        self.wfile.write(content)

    def _error(self, status: int, message: str) -> None:
        self._json(status, {"detail": message})

    def _read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            raise ValueError("请求内容为空")
        payload = json.loads(self.rfile.read(length).decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("请求内容必须是 JSON 对象")
        return payload

    def _current_user(self) -> sqlite3.Row | None:
        header = self.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            self._error(401, "缺少登录凭证")
            return None
        payload = self.auth.verify(header[7:].strip())
        if not payload:
            self._error(401, "登录凭证无效或已过期")
            return None
        user = self.db.query_one("SELECT * FROM users WHERE id = ?", (payload["sub"],))
        if not user:
            self._error(401, "用户不存在")
            return None
        return user

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:
        try:
            parsed = urlsplit(self.path)
            path = unquote(parsed.path)
            query = parse_qs(parsed.query)
            if path == "/":
                return self._static("index.html")
            if path in {"/styles.css", "/app.js"}:
                return self._static(path[1:])
            if path == "/api/v1/health":
                return self._json(200, {"ok": True, "service": "visualforge-dashboard"})
            if path == "/api/v1/auth/me":
                user = self._current_user()
                if not user:
                    return
                return self._json(200, self._serialize_user(user))
            if path == "/api/v1/projects":
                user = self._current_user()
                if not user:
                    return
                projects = self.db.query_all(
                    """
                    SELECT p.* FROM projects p
                    JOIN project_members pm ON pm.project_id = p.id
                    WHERE pm.user_id = ?
                    ORDER BY p.created_at ASC
                    """,
                    (user["id"],),
                )
                return self._json(
                    200, {"projects": [self._serialize_project(row) for row in projects]}
                )
            if path == "/api/v1/users":
                user = self._current_user()
                if not user or user["role"] != "admin":
                    return self._error(403, "仅管理员可查看成员")
                rows = self.db.query_all("SELECT * FROM users ORDER BY created_at ASC")
                return self._json(200, {"users": [self._serialize_user(row) for row in rows]})
            if path == "/api/v1/stats/overview":
                user = self._current_user()
                if not user:
                    return
                return self._json(200, self._overview(user))
            if path == "/api/v1/tasks":
                user = self._current_user()
                if not user:
                    return
                return self._json(200, self._list_tasks(user, query))
            match = re.fullmatch(r"/api/v1/tasks/([^/]+)", path)
            if match:
                user = self._current_user()
                if not user:
                    return
                return self._json(200, self._get_task(match.group(1)))
            match = re.fullmatch(r"/api/v1/tasks/([^/]+)/artifacts", path)
            if match:
                user = self._current_user()
                if not user:
                    return
                return self._json(200, self._task_artifacts(match.group(1)))
            match = re.fullmatch(r"/api/v1/artifacts/([^/]+)/download", path)
            if match:
                user = self._current_user()
                if not user:
                    return
                return self._download_artifact(match.group(1))
            match = re.fullmatch(r"/api/v1/artifacts/([^/]+)/thumbnail", path)
            if match:
                user = self._current_user()
                if not user:
                    return
                return self._download_thumbnail(match.group(1))
            self._error(404, "接口不存在")
        except Exception as exc:
            print(f"[dashboard] GET error: {exc}", flush=True)
            self._error(500, "服务内部错误")

    def do_POST(self) -> None:
        try:
            path = urlsplit(self.path).path
            if path == "/api/v1/auth/login":
                return self._login()
            if path == "/api/v1/users":
                user = self._current_user()
                if not user:
                    return
                return self._create_user(user)
            if path == "/api/v1/projects":
                user = self._current_user()
                if not user:
                    return
                return self._create_project(user)
            if path == "/api/v1/tasks":
                user = self._current_user()
                if not user:
                    return
                return self._create_task(user)
            match = re.fullmatch(r"/api/v1/tasks/([^/]+)/artifacts", path)
            if match:
                user = self._current_user()
                if not user:
                    return
                return self._upload_artifacts(user, match.group(1))
            match = re.fullmatch(r"/api/v1/tasks/([^/]+)/status", path)
            if match:
                user = self._current_user()
                if not user:
                    return
                return self._update_task_status(user, match.group(1))
            self._error(404, "接口不存在")
        except (ValueError, json.JSONDecodeError) as exc:
            self._error(400, str(exc) or "请求参数无效")
        except Exception as exc:
            print(f"[dashboard] POST error: {exc}", flush=True)
            self._error(500, "服务内部错误")

    def _static(self, name: str) -> None:
        path = STATIC_DIR / name
        if not path.is_file():
            self._error(404, "页面不存在")
            return
        content = path.read_bytes()
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        if content_type.startswith("text/") or content_type == "application/javascript":
            content_type += "; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self._cors()
        self.end_headers()
        self.wfile.write(content)

    def _login(self) -> None:
        payload = self._read_json()
        username = str(payload.get("username", "")).strip()
        password = str(payload.get("password", ""))
        user = self.db.query_one("SELECT * FROM users WHERE username = ?", (username,))
        if not user or not password_matches(password, user["password_hash"]):
            self._error(401, "用户名或密码错误")
            return
        self._json(200, {"token": self.auth.issue(user), "user": self._serialize_user(user)})

    def _create_user(self, actor: sqlite3.Row) -> None:
        if actor["role"] != "admin":
            self._error(403, "仅管理员可添加成员")
            return
        payload = self._read_json()
        username = str(payload.get("username", "")).strip()
        display_name = str(payload.get("display_name") or username).strip()
        password = str(payload.get("password", ""))
        role = str(payload.get("role", "member"))
        if not re.fullmatch(r"[A-Za-z0-9_.-]{3,32}", username):
            self._error(400, "用户名需为 3 到 32 位字母、数字或 ._-")
            return
        if len(password) < 6:
            self._error(400, "密码至少 6 位")
            return
        if role not in {"admin", "member", "viewer"}:
            self._error(400, "角色无效")
            return
        if self.db.query_one("SELECT id FROM users WHERE username = ?", (username,)):
            self._error(409, "用户名已存在")
            return
        user_id = new_id()
        self.db.execute(
            """
            INSERT INTO users (id, username, display_name, password_hash, role, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (user_id, username, display_name, password_hash(password), role, now_iso()),
        )
        project = self.db.query_one("SELECT id FROM projects ORDER BY created_at ASC LIMIT 1")
        if project:
            self.db.execute(
                """
                INSERT OR IGNORE INTO project_members (project_id, user_id, role)
                VALUES (?, ?, 'member')
                """,
                (project["id"], user_id),
            )
        user = self.db.query_one("SELECT * FROM users WHERE id = ?", (user_id,))
        self._json(201, self._serialize_user(user))

    def _create_project(self, actor: sqlite3.Row) -> None:
        if actor["role"] != "admin":
            self._error(403, "仅管理员可创建项目")
            return
        payload = self._read_json()
        name = str(payload.get("name", "")).strip()
        if not name:
            self._error(400, "项目名称不能为空")
            return
        project_id = new_id()
        now = now_iso()
        self.db.execute(
            """
            INSERT INTO projects (id, name, description, created_by, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (project_id, name, str(payload.get("description", "")), actor["id"], now),
        )
        self.db.execute(
            """
            INSERT INTO project_members (project_id, user_id, role)
            VALUES (?, ?, 'admin')
            """,
            (project_id, actor["id"]),
        )
        project = self.db.query_one("SELECT * FROM projects WHERE id = ?", (project_id,))
        self._json(201, self._serialize_project(project))

    def _create_task(self, actor: sqlite3.Row) -> None:
        payload = self._read_json()
        task_id = str(payload.get("id") or new_id())
        project_id = str(payload.get("project_id") or "")
        if not project_id:
            project = self.db.query_one("SELECT id FROM projects ORDER BY created_at ASC LIMIT 1")
            project_id = project["id"] if project else ""
        if not project_id:
            self._error(400, "缺少项目 ID")
            return
        now = now_iso()
        self.db.execute(
            """
            INSERT INTO tasks (
                id, project_id, user_id, group_id, module, sku, status, prompt,
                options_json, error, created_at, updated_at, completed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                project_id=excluded.project_id,
                user_id=excluded.user_id,
                group_id=excluded.group_id,
                module=excluded.module,
                sku=excluded.sku,
                status=excluded.status,
                prompt=excluded.prompt,
                options_json=excluded.options_json,
                error=excluded.error,
                updated_at=excluded.updated_at,
                completed_at=COALESCE(excluded.completed_at, tasks.completed_at)
            """,
            (
                task_id,
                project_id,
                actor["id"],
                str(payload.get("group_id") or ""),
                str(payload.get("module") or "product_generate"),
                str(payload.get("sku") or ""),
                str(payload.get("status") or "completed"),
                str(payload.get("prompt") or ""),
                json.dumps(payload.get("options") or {}, ensure_ascii=False),
                str(payload.get("error") or "") or None,
                str(payload.get("created_at") or now),
                now,
                str(payload.get("completed_at") or "") or None,
            ),
        )
        self._json(200, self._get_task(task_id))

    def _update_task_status(self, actor: sqlite3.Row, task_id: str) -> None:
        task = self._get_task(task_id)
        if not task:
            self._error(404, "任务不存在")
            return
        payload = self._read_json()
        self.db.execute(
            "UPDATE tasks SET status = ?, error = ?, updated_at = ?, completed_at = ? WHERE id = ?",
            (
                str(payload.get("status") or "completed"),
                str(payload.get("error") or "") or None,
                now_iso(),
                str(payload.get("completed_at") or now_iso()),
                task_id,
            ),
        )
        self._json(200, self._get_task(task_id))

    def _upload_artifacts(self, actor: sqlite3.Row, task_id: str) -> None:
        task = self.db.query_one("SELECT * FROM tasks WHERE id = ?", (task_id,))
        if not task:
            self._error(404, "任务不存在")
            return
        content_type = self.headers.get("Content-Type", "")
        if not content_type.lower().startswith("multipart/form-data"):
            self._error(400, "请使用 multipart/form-data 上传")
            return
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length)
        message = BytesParser(policy=policy.default).parsebytes(
            (f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n").encode("utf-8")
            + body
        )
        artifacts = []
        for part in message.iter_parts():
            filename = part.get_filename()
            if not filename:
                continue
            data = part.get_payload(decode=True) or b""
            artifacts.append(self._save_artifact(task, filename, part.get_content_type(), data))
        if not artifacts:
            self._error(400, "没有找到可上传文件")
            return
        self._json(201, {"artifacts": artifacts})

    def _save_artifact(
        self, task: sqlite3.Row, filename: str, mime: str, data: bytes
    ) -> dict[str, Any]:
        artifact_id = new_id()
        name = safe_filename(filename)
        storage_key = f"files/{task['id']}/{artifact_id}-{name}"
        path = self.server.settings.data_dir / storage_key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        thumb_key = None
        width = height = None
        if (mime or "").startswith("image/") or name.lower().endswith(
            (".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp")
        ):
            thumb_name = f"{artifact_id}.webp"
            thumb_key = f"thumbs/{thumb_name}"
            thumb_path = self.server.settings.data_dir / thumb_key
            width, height = make_thumbnail(data, thumb_path)
        sha = hashlib.sha256(data).hexdigest()
        self.db.execute(
            """
            INSERT INTO artifacts (
                id, task_id, kind, filename, mime, size, sha256,
                storage_key, thumb_key, width, height, metadata_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?)
            """,
            (
                artifact_id,
                task["id"],
                "image" if (mime or "").startswith("image/") else "file",
                name,
                mime or "application/octet-stream",
                len(data),
                sha,
                storage_key,
                thumb_key,
                width,
                height,
                now_iso(),
            ),
        )
        self.db.execute("UPDATE tasks SET updated_at = ? WHERE id = ?", (now_iso(), task["id"]))
        return {
            "id": artifact_id,
            "task_id": task["id"],
            "kind": "image" if (mime or "").startswith("image/") else "file",
            "filename": name,
            "mime": mime or "application/octet-stream",
            "size": len(data),
            "sha256": sha,
            "width": width,
            "height": height,
        }

    def _list_tasks(self, actor: sqlite3.Row, query: dict[str, list[str]]) -> dict[str, Any]:
        where = []
        params: list[Any] = []
        project = query.get("project", [""])[0]
        member = query.get("user", [""])[0]
        module = query.get("module", [""])[0]
        sku = query.get("sku", [""])[0]
        status = query.get("status", [""])[0]
        keyword = query.get("q", [""])[0]
        if project:
            where.append("project_id = ?")
            params.append(project)
        if member:
            where.append("user_id = ?")
            params.append(member)
        if module:
            where.append("module = ?")
            params.append(module)
        if sku:
            where.append("sku LIKE ?")
            params.append(f"%{sku}%")
        if status:
            where.append("status = ?")
            params.append(status)
        if keyword:
            where.append("(prompt LIKE ? OR sku LIKE ?)")
            params.extend([f"%{keyword}%", f"%{keyword}%"])
        clause = "WHERE " + " AND ".join(where) if where else ""
        limit = max(1, min(int(query.get("limit", ["24"])[0] or 24), 200))
        offset = max(0, int(query.get("offset", ["0"])[0] or 0))
        rows = self.db.query_all(
            f"SELECT * FROM tasks {clause} ORDER BY created_at DESC LIMIT ? OFFSET ?",
            tuple(params + [limit, offset]),
        )
        tasks = []
        for row in rows:
            task = self._serialize_task(row)
            first = self.db.query_one(
                """
                SELECT id, thumb_key FROM artifacts
                WHERE task_id = ? AND thumb_key IS NOT NULL
                ORDER BY created_at ASC LIMIT 1
                """,
                (row["id"],),
            )
            count = self.db.query_one(
                "SELECT COUNT(*) AS c FROM artifacts WHERE task_id = ?", (row["id"],)
            )
            task["artifact_count"] = count["c"] if count else 0
            task["thumbnail_url"] = (
                f"/api/v1/artifacts/{first['id']}/thumbnail" if first else None
            )
            tasks.append(task)
        return {"tasks": tasks}

    def _get_task(self, task_id: str) -> dict[str, Any]:
        row = self.db.query_one("SELECT * FROM tasks WHERE id = ?", (task_id,))
        if not row:
            self._error(404, "任务不存在")
            return {}
        return self._serialize_task(row)

    def _task_artifacts(self, task_id: str) -> dict[str, Any]:
        task = self.db.query_one("SELECT * FROM tasks WHERE id = ?", (task_id,))
        if not task:
            self._error(404, "任务不存在")
            return {}
        rows = self.db.query_all(
            "SELECT * FROM artifacts WHERE task_id = ? ORDER BY created_at ASC", (task_id,)
        )
        return {"artifacts": [self._serialize_artifact(row) for row in rows]}

    def _download_artifact(self, artifact_id: str) -> None:
        row = self.db.query_one("SELECT * FROM artifacts WHERE id = ?", (artifact_id,))
        if not row:
            self._error(404, "文件不存在")
            return
        path = self.server.settings.data_dir / row["storage_key"]
        self._send_file(path, row["filename"], row["mime"])

    def _download_thumbnail(self, artifact_id: str) -> None:
        row = self.db.query_one("SELECT * FROM artifacts WHERE id = ?", (artifact_id,))
        if not row or not row["thumb_key"]:
            self._error(404, "缩略图不存在")
            return
        path = self.server.settings.data_dir / row["thumb_key"]
        self._send_file(path, f"{artifact_id}.webp", "image/webp")

    def _send_file(self, path: Path, filename: str, mime: str) -> None:
        if not path.is_file():
            self._error(404, "文件不存在")
            return
        content = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "public, max-age=3600")
        self._cors()
        self.end_headers()
        self.wfile.write(content)

    def _overview(self, actor: sqlite3.Row) -> dict[str, Any]:
        total = self.db.query_one("SELECT COUNT(*) AS c FROM tasks")["c"]
        artifacts = self.db.query_one("SELECT COUNT(*) AS c FROM artifacts")["c"]
        today = now_iso()[:10]
        today_tasks = self.db.query_one(
            "SELECT COUNT(*) AS c FROM tasks WHERE substr(created_at, 1, 10) = ?", (today,)
        )["c"]
        by_module = self.db.query_all(
            "SELECT module, COUNT(*) AS c FROM tasks GROUP BY module ORDER BY c DESC"
        )
        by_user = self.db.query_all(
            """
            SELECT u.display_name, u.username, COUNT(t.id) AS c
            FROM tasks t JOIN users u ON u.id = t.user_id
            GROUP BY u.id ORDER BY c DESC
            """
        )
        member_count = self.db.query_one("SELECT COUNT(*) AS c FROM users")["c"]
        return {
            "total_tasks": total,
            "total_artifacts": artifacts,
            "today_tasks": today_tasks,
            "member_count": member_count,
            "modules": [{"module": row["module"], "count": row["c"]} for row in by_module],
            "users": [
                {"display_name": row["display_name"], "username": row["username"], "count": row["c"]}
                for row in by_user
            ],
        }

    @staticmethod
    def _serialize_user(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "username": row["username"],
            "display_name": row["display_name"],
            "role": row["role"],
            "created_at": row["created_at"],
        }

    @staticmethod
    def _serialize_project(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "name": row["name"],
            "description": row["description"],
            "created_at": row["created_at"],
        }

    @staticmethod
    def _serialize_task(row: sqlite3.Row) -> dict[str, Any]:
        try:
            options = json.loads(row["options_json"] or "{}")
        except json.JSONDecodeError:
            options = {}
        return {
            "id": row["id"],
            "project_id": row["project_id"],
            "user_id": row["user_id"],
            "group_id": row["group_id"],
            "module": row["module"],
            "sku": row["sku"],
            "status": row["status"],
            "prompt": row["prompt"],
            "options": options,
            "error": row["error"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "completed_at": row["completed_at"],
        }

    @staticmethod
    def _serialize_artifact(row: sqlite3.Row) -> dict[str, Any]:
        try:
            metadata = json.loads(row["metadata_json"] or "{}")
        except json.JSONDecodeError:
            metadata = {}
        return {
            "id": row["id"],
            "task_id": row["task_id"],
            "kind": row["kind"],
            "filename": row["filename"],
            "mime": row["mime"],
            "size": row["size"],
            "sha256": row["sha256"],
            "width": row["width"],
            "height": row["height"],
            "metadata": metadata,
            "download_url": f"/api/v1/artifacts/{row['id']}/download",
            "thumbnail_url": (
                f"/api/v1/artifacts/{row['id']}/thumbnail" if row["thumb_key"] else None
            ),
        }


class DashboardServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address: tuple[str, int], settings: Settings):
        self.settings = settings
        self.db = Database(settings)
        self.auth = Auth(settings)
        super().__init__(address, DashboardHandler)


def main() -> None:
    parser = argparse.ArgumentParser(description="Visual Forge 团队看板")
    parser.add_argument("--host", default=os.getenv("DASHBOARD_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.getenv("DASHBOARD_PORT", "8766")))
    args = parser.parse_args()
    settings = Settings()
    settings.host = args.host
    settings.port = args.port
    server = DashboardServer((settings.host, settings.port), settings)
    print(f"Visual Forge dashboard listening at http://{settings.host}:{settings.port}")
    try:
        server.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

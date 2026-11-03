from __future__ import annotations

import json
import logging
import mimetypes
import os
import shutil
import threading
import zipfile
from email import policy
from email.parser import BytesParser
from html import escape
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, quote, unquote, urlsplit

from .config import Settings
from .exporting import create_export_group, export_job_to_desktop
from .imaging import safe_filename
from .models import Job
from .pipelines import SUPPORTED_JOB_KINDS
from .providers import build_provider
from .store import JobStore
from .worker import WorkerPool


logger = logging.getLogger(__name__)
ALLOWED_IMAGE_SUFFIXES = {
    ".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tif", ".tiff"
}
MAX_UPLOAD_BYTES = 30 * 1024 * 1024
MAX_REQUEST_BYTES = 256 * 1024 * 1024
WEB_DIR = Path(__file__).resolve().parent / "web"


class RequestError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def _asset_url(settings: Settings, job_id: str, asset_path: str) -> str | None:
    try:
        relative = Path(asset_path).resolve().relative_to(
            settings.job_dir(job_id).resolve()
        )
    except (ValueError, OSError):
        return None
    return f"/api/jobs/{job_id}/files/{quote(relative.as_posix(), safe='/')}"


def serialize_job(job: Job, settings: Settings) -> dict[str, Any]:
    assets = []
    for asset in job.result_assets:
        item = {key: value for key, value in asset.items() if key != "path"}
        item["url"] = _asset_url(settings, job.id, asset["path"])
        assets.append(item)
    return {
        "id": job.id,
        "kind": job.kind,
        "status": job.status,
        "options": job.options,
        "inputs": [Path(item).name for item in job.input_assets],
        "outputs": assets,
        "manifest_url": (
            f"/api/jobs/{job.id}/files/outputs/manifest.json"
            if job.manifest_path else None
        ),
        "download_url": (
            f"/api/jobs/{job.id}/download" if job.status == "succeeded" else None
        ),
        "export_url": (
            f"/api/jobs/{job.id}/export" if job.status == "succeeded" else None
        ),
        "export_path": job.export_path,
        "progress": job.progress,
        "message": job.message,
        "error": job.error,
        "attempts": job.attempts,
        "max_attempts": job.max_attempts,
        "created_at": job.created_at,
        "updated_at": job.updated_at,
        "started_at": job.started_at,
        "finished_at": job.finished_at,
    }


def _parse_options(raw: str) -> dict[str, Any]:
    try:
        value = json.loads(raw or "{}")
    except json.JSONDecodeError as exc:
        raise RequestError(400, f"options 不是有效 JSON：{exc}") from exc
    if not isinstance(value, dict):
        raise RequestError(400, "options 必须是 JSON 对象")
    return value


class VisualForgeHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address: tuple[str, int], settings: Settings):
        self.settings = settings
        settings.ensure_directories()
        self.store = JobStore(settings.database_path, settings.max_attempts)
        self.provider = build_provider(settings)
        self.worker_pool = WorkerPool(settings, self.store, self.provider)
        super().__init__(address, VisualForgeRequestHandler)

    def start_workers(self) -> None:
        self.worker_pool.start()

    def server_close(self) -> None:
        self.worker_pool.stop()
        super().server_close()


class VisualForgeRequestHandler(BaseHTTPRequestHandler):
    server: VisualForgeHTTPServer
    server_version = "VisualForge/0.1"
    sys_version = ""

    def log_message(self, format: str, *args: Any) -> None:
        logger.info("%s - %s", self.address_string(), format % args)

    def do_GET(self) -> None:
        try:
            self._handle_get()
        except RequestError as exc:
            self._send_json(exc.status, {"detail": exc.message})
        except (BrokenPipeError, ConnectionResetError):
            return
        except Exception:
            logger.exception("Unhandled GET request")
            self._send_json(500, {"detail": "服务内部错误"})

    def do_POST(self) -> None:
        try:
            self._handle_post()
        except RequestError as exc:
            self._send_json(exc.status, {"detail": exc.message})
        except (BrokenPipeError, ConnectionResetError):
            return
        except Exception:
            logger.exception("Unhandled POST request")
            self._send_json(500, {"detail": "服务内部错误"})

    def do_OPTIONS(self) -> None:
        origin = self._extension_origin()
        if not origin:
            self._send_json(403, {"detail": "仅允许浏览器扩展访问"})
            return
        self.send_response(204)
        self._send_cors_headers(origin)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _extension_origin(self) -> str | None:
        origin = self.headers.get("Origin", "")
        if origin.startswith(("chrome-extension://", "moz-extension://")):
            return origin
        return None

    def _send_cors_headers(self, origin: str) -> None:
        self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "600")
        if self.headers.get("Access-Control-Request-Private-Network") == "true":
            self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Cross-Origin-Resource-Policy", "cross-origin")

    def _handle_get(self) -> None:
        parsed = urlsplit(self.path)
        path = unquote(parsed.path)
        if path == "/api/health":
            settings = self.server.settings
            provider = self.server.provider
            self._send_json(200, {
                "ok": True,
                "provider": provider.name,
                "model": settings.image_model if provider.name != "mock" else None,
                "workers": settings.worker_count,
                "demo_mode": provider.name == "mock",
                    "export_dir": str(settings.export_dir),
                    "paused": self.server.worker_pool.paused,
            })
            return
        if path == "/api/jobs":
            limit_text = parse_qs(parsed.query).get("limit", ["30"])[0]
            try:
                limit = int(limit_text)
            except ValueError:
                limit = 30
            self._send_json(200, {
                "jobs": [
                    serialize_job(job, self.server.settings)
                    for job in self.server.store.list(limit=limit)
                ]
            })
            return
        if path.startswith("/api/jobs/"):
            self._handle_job_get(path)
            return
        if path in {"/", "/studio"}:
            self._send_file(WEB_DIR / "studio.html", cache=False)
            return
        if path == "/classic":
            self._send_file(WEB_DIR / "index.html", cache=False)
            return
        if path.startswith("/assets/"):
            relative = path.removeprefix("/assets/")
            target = (WEB_DIR / relative).resolve()
            if not target.is_relative_to(WEB_DIR.resolve()) or not target.is_file():
                raise RequestError(404, "文件不存在")
            self._send_file(target, cache=True)
            return
        raise RequestError(404, "页面不存在")

    def _handle_job_get(self, path: str) -> None:
        tail = path.removeprefix("/api/jobs/")
        job_id, _, suffix = tail.partition("/")
        if not job_id:
            raise RequestError(404, "任务不存在")
        try:
            job = self.server.store.get(job_id)
        except KeyError as exc:
            raise RequestError(404, "任务不存在") from exc
        if not suffix:
            self._send_json(200, serialize_job(job, self.server.settings))
            return
        if suffix == "download":
            self._send_download(job)
            return
        if suffix.startswith("files/"):
            relative = suffix.removeprefix("files/")
            root = self.server.settings.job_dir(job.id).resolve()
            target = (root / relative).resolve()
            if not target.is_relative_to(root) or not target.is_file():
                raise RequestError(404, "文件不存在")
            self._send_file(target)
            return
        raise RequestError(404, "接口不存在")

    def _handle_post(self) -> None:
        path = urlsplit(self.path).path
        if path == "/api/export/open":
            self._open_export_folder()
            return
        if path == "/api/export/reserve":
            self._reserve_export_group()
            return
        if path in {"/api/queue/pause", "/api/queue/resume"}:
            if path.endswith("/pause"):
                self.server.worker_pool.pause()
            else:
                self.server.worker_pool.resume()
            self._send_json(200, {"paused": self.server.worker_pool.paused})
            return
        if path.startswith("/api/jobs/") and path.endswith("/export"):
            job_id = path.removeprefix("/api/jobs/").removesuffix("/export")
            self._export_job(job_id)
            return
        if path != "/api/jobs":
            raise RequestError(404, "接口不存在")
        length_text = self.headers.get("Content-Length", "0")
        try:
            length = int(length_text)
        except ValueError as exc:
            raise RequestError(400, "Content-Length 无效") from exc
        if length <= 0:
            raise RequestError(400, "请求内容为空")
        if length > MAX_REQUEST_BYTES:
            raise RequestError(413, "单次请求内容超过 256MB")
        content_type = self.headers.get("Content-Type", "")
        if not content_type.lower().startswith("multipart/form-data"):
            raise RequestError(400, "请使用 multipart/form-data 上传")

        body = self.rfile.read(length)
        message = BytesParser(policy=policy.default).parsebytes(
            (
                f"Content-Type: {content_type}\r\n"
                "MIME-Version: 1.0\r\n\r\n"
            ).encode("utf-8") + body
        )
        fields: dict[str, list[Any]] = {}
        for part in message.iter_parts():
            name = part.get_param("name", header="content-disposition")
            if name:
                fields.setdefault(name, []).append(part)
        kind = self._field_text(fields, "kind")
        options = _parse_options(self._field_text(fields, "options", "{}"))
        file_parts = [
            part for part in fields.get("files", [])
            if part.get_filename() is not None
        ]
        self._create_job(kind, options, file_parts)

    @staticmethod
    def _field_text(
        fields: dict[str, list[Any]], name: str, default: str | None = None
    ) -> str:
        values = fields.get(name)
        if not values:
            if default is not None:
                return default
            raise RequestError(400, f"缺少表单字段：{name}")
        payload = values[0].get_payload(decode=True) or b""
        return payload.decode("utf-8", errors="replace")

    def _create_job(
        self, kind: str, options: dict[str, Any], parts: list[Any]
    ) -> None:
        if kind not in SUPPORTED_JOB_KINDS:
            raise RequestError(400, f"未知任务类型：{kind}")
        if kind in {"logo_recolor", "logo_color_batch"} and not parts:
            raise RequestError(400, "该任务至少需要上传 1 个 Logo")
        if kind == "logo_recolor" and len(parts) != 1:
            raise RequestError(400, "单 Logo 多色任务只能上传 1 个 Logo")
        if kind == "product_generate":
            if not str(options.get("prompt", "")).strip() and not options.get("prompts"):
                raise RequestError(400, "请输入产品描述")

        job = self.server.store.create_job(kind, options, [], status="draft")
        try:
            saved = self._save_parts(job.id, parts)
            self.server.store.set_input_assets(job.id, saved)
            self.server.store.enqueue_job(job.id)
        except RequestError as exc:
            self.server.store.mark_failed(job.id, exc.message, final=True)
            raise
        except Exception as exc:
            logger.exception("Could not save uploads for job %s", job.id)
            self.server.store.mark_failed(
                job.id, f"保存上传文件失败：{exc}", final=True
            )
            raise RequestError(500, "保存上传文件失败") from exc
        self._send_json(201, serialize_job(
            self.server.store.get(job.id), self.server.settings
        ))

    def _save_parts(self, job_id: str, parts: list[Any]) -> list[str]:
        input_dir = self.server.settings.job_dir(job_id) / "inputs"
        input_dir.mkdir(parents=True, exist_ok=True)
        saved: list[str] = []
        seen: set[str] = set()
        for index, part in enumerate(parts, start=1):
            original = safe_filename(part.get_filename() or f"upload-{index}.png")
            suffix = Path(original).suffix.lower()
            if suffix not in ALLOWED_IMAGE_SUFFIXES:
                raise RequestError(400, f"不支持的图片格式：{original}")
            content = part.get_payload(decode=True) or b""
            if len(content) > MAX_UPLOAD_BYTES:
                raise RequestError(413, f"文件超过 30MB：{original}")
            if not content:
                raise RequestError(400, f"上传文件为空：{original}")
            name = original
            counter = 2
            while name.lower() in seen:
                name = f"{Path(original).stem}-{counter}{suffix}"
                counter += 1
            seen.add(name.lower())
            destination = input_dir / name
            destination.write_bytes(content)
            saved.append(str(destination.resolve()))
        return saved

    def _send_download(self, job: Job) -> None:
        if job.status != "succeeded":
            raise RequestError(409, "任务尚未完成")
        archive = self.server.settings.job_dir(job.id) / "visualforge-result.zip"
        if not archive.exists():
            with zipfile.ZipFile(
                archive, "w", compression=zipfile.ZIP_DEFLATED
            ) as bundle:
                used_names: set[str] = set()
                output_root = self.server.settings.job_dir(job.id) / "outputs"
                paths = [
                    path.resolve()
                    for path in output_root.glob("*.png")
                    if path.is_file()
                ]
                paths.extend(
                    Path(asset["path"]).resolve()
                    for asset in job.result_assets
                )
                if job.manifest_path:
                    paths.append(Path(job.manifest_path))
                    paths.append(Path(job.manifest_path).with_suffix(".csv"))
                unique_paths = list(dict.fromkeys(paths))
                for path in unique_paths:
                    if not path.exists():
                        continue
                    name = path.name
                    if name in used_names:
                        name = f"{path.parent.name}-{path.name}"
                    used_names.add(name)
                    bundle.write(path, arcname=name)
        self._send_file(
            archive, download_name=f"visualforge-{job.id[:8]}.zip"
        )

    def _export_job(self, job_id: str) -> None:
        try:
            job = self.server.store.get(job_id)
        except KeyError as exc:
            raise RequestError(404, "任务不存在") from exc
        if job.status != "succeeded":
            raise RequestError(409, "任务尚未完成")
        try:
            export_path = Path(job.export_path) if job.export_path else None
            if not export_path or not export_path.is_dir():
                export_path = export_job_to_desktop(
                    self.server.settings,
                    job,
                    job.manifest_path,
                )
                self.server.store.set_export_path(job.id, str(export_path))
        except Exception as exc:
            logger.exception("Could not export job %s", job_id)
            raise RequestError(500, f"导出失败：{exc}") from exc
        self._send_json(
            200,
            {"export_path": str(export_path), "root": str(self.server.settings.export_dir)},
        )

    def _reserve_export_group(self) -> None:
        length_text = self.headers.get("Content-Length", "0")
        try:
            length = int(length_text)
        except ValueError as exc:
            raise RequestError(400, "Content-Length 无效") from exc
        if length <= 0 or length > 64 * 1024:
            raise RequestError(400, "导出分组请求无效")
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError
            folder = create_export_group(
                self.server.settings,
                str(payload.get("kind") or ""),
                str(payload.get("sku") or ""),
                str(payload.get("started_at") or ""),
            )
        except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise RequestError(400, str(exc) or "导出分组请求无效") from exc
        self._send_json(
            200,
            {
                "export_path": str(folder),
                "root": str(self.server.settings.export_dir),
            },
        )

    def _open_export_folder(self) -> None:
        folder = self.server.settings.export_dir
        folder.mkdir(parents=True, exist_ok=True)
        try:
            if os.name == "nt":
                os.startfile(str(folder))
            else:
                import subprocess

                subprocess.Popen(["xdg-open", str(folder)])
        except OSError as exc:
            raise RequestError(500, f"无法打开文件夹：{exc}") from exc
        self._send_json(200, {"opened": str(folder)})

    def _send_json(self, status: int, payload: dict[str, Any]) -> None:
        content = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        origin = self._extension_origin()
        if origin:
            self._send_cors_headers(origin)
        self.end_headers()
        self.wfile.write(content)

    def _send_file(
        self,
        path: Path,
        *,
        download_name: str | None = None,
        cache: bool = False,
    ) -> None:
        if not path.is_file():
            raise RequestError(404, "文件不存在")
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        if content_type.startswith("text/") or content_type in {
            "application/javascript", "application/json"
        }:
            content_type += "; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(path.stat().st_size))
        self.send_header(
            "Cache-Control", "public, max-age=3600" if cache else "no-store"
        )
        self.send_header("X-Content-Type-Options", "nosniff")
        origin = self._extension_origin()
        if origin:
            self._send_cors_headers(origin)
        if download_name:
            self.send_header(
                "Content-Disposition",
                f'attachment; filename="{escape(download_name, quote=True)}"',
            )
        self.end_headers()
        with path.open("rb") as stream:
            shutil.copyfileobj(stream, self.wfile)


def build_server(
    settings: Settings | None = None,
    *,
    host: str | None = None,
    port: int | None = None,
) -> VisualForgeHTTPServer:
    settings = settings or Settings.from_env()
    return VisualForgeHTTPServer(
        (
            host if host is not None else settings.host,
            port if port is not None else settings.port,
        ),
        settings,
    )


def serve_forever(settings: Settings | None = None) -> None:
    settings = settings or Settings.from_env()
    server = build_server(settings)
    server.start_workers()
    logger.info(
        "Visual Forge listening at http://%s:%s",
        server.server_address[0], server.server_address[1],
    )
    try:
        server.serve_forever(poll_interval=0.5)
    finally:
        server.server_close()


def run_in_thread(
    settings: Settings | None = None,
) -> tuple[VisualForgeHTTPServer, threading.Thread]:
    server = build_server(settings or Settings.from_env(), host="127.0.0.1", port=0)
    server.start_workers()
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, thread

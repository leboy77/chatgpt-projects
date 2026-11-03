from __future__ import annotations

import os
import ctypes
from dataclasses import dataclass
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent


def load_local_env(path: Path | None = None) -> None:
    """Load a small .env file without overriding existing environment values."""
    env_path = path or PROJECT_ROOT / ".env"
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("\"'")
        if key and key not in os.environ:
            os.environ[key] = value


def _env_int(name: str, default: int, minimum: int = 1) -> int:
    try:
        return max(minimum, int(os.getenv(name, str(default))))
    except ValueError:
        return default


def default_export_dir() -> Path:
    if os.name == "nt":
        try:
            from ctypes import wintypes

            folder_id = "{B4BFCC3A-DB2C-424C-B029-7FE99A87C641}"
            guid = ctypes.create_string_buffer(16)
            if ctypes.windll.ole32.CLSIDFromString(
                folder_id, ctypes.byref(guid)
            ) == 0:
                path_ptr = ctypes.c_wchar_p()
                if (
                    ctypes.windll.shell32.SHGetKnownFolderPath(
                        ctypes.byref(guid), 0, None, ctypes.byref(path_ptr)
                    )
                    == 0
                ):
                    path = Path(path_ptr.value)
                    ctypes.windll.ole32.CoTaskMemFree(path_ptr)
                    return path / "VisualForge商品图"
        except (AttributeError, OSError):
            pass
    desktop = Path.home() / "Desktop"
    return desktop / "VisualForge商品图"


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    provider: str = "mock"
    api_base_url: str = "https://api.openai.com/v1"
    api_key: str = ""
    image_model: str = "gpt-image-1"
    request_timeout: int = 180
    worker_count: int = 2
    max_attempts: int = 2
    host: str = "127.0.0.1"
    port: int = 8765
    export_dir: Path = Path()

    @classmethod
    def from_env(cls) -> "Settings":
        load_local_env()
        data_value = os.getenv("VISUALFORGE_DATA_DIR", str(PROJECT_ROOT / "data"))
        data_dir = Path(data_value).expanduser()
        if not data_dir.is_absolute():
            data_dir = PROJECT_ROOT / data_dir
        export_value = os.getenv("VISUALFORGE_EXPORT_DIR", "")
        export_dir = (
            Path(export_value).expanduser()
            if export_value
            else default_export_dir()
        )
        return cls(
            data_dir=data_dir.resolve(),
            provider=os.getenv("IMAGE_PROVIDER", "mock").strip().lower(),
            api_base_url=os.getenv(
                "IMAGE_API_BASE_URL", "https://api.openai.com/v1"
            ).rstrip("/"),
            api_key=os.getenv("IMAGE_API_KEY", "").strip(),
            image_model=os.getenv("IMAGE_MODEL", "gpt-image-1").strip(),
            request_timeout=_env_int("IMAGE_REQUEST_TIMEOUT", 180, 10),
            worker_count=_env_int("VISUALFORGE_WORKERS", 2),
            max_attempts=_env_int("VISUALFORGE_MAX_ATTEMPTS", 2),
            host=os.getenv("VISUALFORGE_HOST", "127.0.0.1"),
            port=_env_int("VISUALFORGE_PORT", 8765),
            export_dir=export_dir.resolve(),
        )

    @property
    def database_path(self) -> Path:
        return self.data_dir / "visualforge.sqlite3"

    @property
    def jobs_dir(self) -> Path:
        return self.data_dir / "jobs"

    def job_dir(self, job_id: str) -> Path:
        return self.jobs_dir / job_id

    def ensure_directories(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.jobs_dir.mkdir(parents=True, exist_ok=True)
        self.export_dir.mkdir(parents=True, exist_ok=True)


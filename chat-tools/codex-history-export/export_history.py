#!/usr/bin/env python3
"""Export local Codex sessions into readable Markdown and a lossless copy."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import quote


CODEX_HOME = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex"))
SESSION_DIR = CODEX_HOME / "sessions"
INDEX_PATH = CODEX_HOME / "session_index.jsonl"
ATTACHMENTS_DIR = CODEX_HOME / "attachments"
OUTPUT_DIR = Path.cwd() / f"codex-history-export-{datetime.now():%Y%m%d-%H%M%S}"
READABLE_DIR = OUTPUT_DIR / "readable"
RAW_SESSION_DIR = OUTPUT_DIR / "raw" / "sessions"
RAW_ATTACHMENTS_DIR = OUTPUT_DIR / "raw" / "attachments"


def read_json_lines(path: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            records.append(value)
    return records


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def message_text(payload: dict[str, Any]) -> str:
    parts: list[str] = []
    for part in payload.get("content", []):
        if isinstance(part, str):
            if part.strip():
                parts.append(part)
            continue
        if not isinstance(part, dict):
            continue
        text = part.get("text")
        if isinstance(text, str) and text.strip():
            parts.append(text)
            continue
        part_type = part.get("type", "")
        if part_type in {"input_image", "image"}:
            parts.append("[图片附件：请从原始会话归档或原工作区恢复]")
        elif part_type:
            parts.append(f"[附件类型：{part_type}]")
    return "\n\n".join(parts).strip()


def safe_filename(value: str) -> str:
    forbidden = '<>:"/\\|?*'
    result = "".join("_" if char in forbidden or ord(char) < 32 else char for char in value)
    return result.strip(" .")[:100] or "untitled"


def reset_generated_dir(path: Path) -> None:
    output_root = OUTPUT_DIR.resolve()
    resolved = path.resolve()
    if resolved.parent != output_root and output_root not in resolved.parents:
        raise RuntimeError(f"Refusing to reset directory outside export root: {resolved}")
    if resolved.exists():
        shutil.rmtree(resolved)
    resolved.mkdir(parents=True, exist_ok=True)


def load_titles() -> dict[str, str]:
    if not INDEX_PATH.is_file():
        return {}
    titles: dict[str, str] = {}
    for record in read_json_lines(INDEX_PATH):
        thread_id = str(record.get("id", ""))
        title = str(record.get("thread_name", "")).strip()
        if thread_id and title:
            titles[thread_id] = title
    return titles


def session_identity(records: list[dict[str, Any]], path: Path) -> tuple[str, str | None]:
    for record in records:
        if record.get("type") != "session_meta":
            continue
        payload = record.get("payload", {})
        session_id = str(payload.get("id") or payload.get("session_id") or "").strip()
        timestamp = payload.get("timestamp") or record.get("timestamp")
        if session_id:
            return session_id, str(timestamp) if timestamp else None
    fallback_id = path.stem.replace("rollout-", "")[-36:]
    return fallback_id, None


def export_session(
    path: Path,
    titles: dict[str, str],
    current_path: Path | None,
) -> dict[str, Any]:
    records = read_json_lines(path)
    session_id, created_at = session_identity(records, path)
    title = titles.get(session_id, "")
    messages: list[dict[str, str]] = []

    for record in records:
        if record.get("type") != "response_item":
            continue
        payload = record.get("payload", {})
        if payload.get("type") != "message":
            continue
        role = payload.get("role")
        if role not in {"user", "assistant"}:
            continue
        text = message_text(payload)
        if not text:
            continue
        messages.append(
            {
                "timestamp": str(record.get("timestamp", "")),
                "role": role,
                "text": text,
            }
        )
        if not title and role == "user":
            title = " ".join(text.replace("\n", " ").split())[:60]

    title = title or f"Codex session {session_id[:8]}"
    file_key = hashlib.sha1(path.name.encode("utf-8")).hexdigest()[:10]
    stem = f"{safe_filename(title)}_{safe_filename(session_id)}_{file_key}"
    readable_path = READABLE_DIR / f"{stem}.md"
    raw_path = RAW_SESSION_DIR / path.name

    lines = [
        f"# {title}",
        "",
        f"- Session ID: `{session_id}`",
        f"- Created: `{created_at or 'unknown'}`",
        f"- Raw source: `{path}`",
        f"- Export time: `{datetime.now().astimezone().isoformat(timespec='seconds')}`",
        "",
        "> 本文件只包含用户与助手的可见消息；工具调用、工具输出和系统指令保存在原始 JSONL 中。",
        "",
    ]
    for message in messages:
        lines.extend(
            [
                f"## {'用户' if message['role'] == 'user' else '助手'} · {message['timestamp']}",
                "",
                message["text"],
                "",
            ]
        )
    readable_path.write_text("\n".join(lines), encoding="utf-8")
    shutil.copy2(path, raw_path)

    return {
        "session_id": session_id,
        "title": title,
        "created_at": created_at,
        "last_record_at": str(records[-1].get("timestamp", "")) if records else "",
        "raw_file": str(raw_path.relative_to(OUTPUT_DIR)),
        "readable_file": str(readable_path.relative_to(OUTPUT_DIR)),
        "source_file": str(path),
        "record_count": len(records),
        "message_count": len(messages),
        "sha256": sha256(path),
        "is_current_thread": current_path is not None and path == current_path,
    }


def configure_output(path: Path) -> None:
    global OUTPUT_DIR, READABLE_DIR, RAW_SESSION_DIR, RAW_ATTACHMENTS_DIR
    OUTPUT_DIR = path.resolve()
    READABLE_DIR = OUTPUT_DIR / "readable"
    RAW_SESSION_DIR = OUTPUT_DIR / "raw" / "sessions"
    RAW_ATTACHMENTS_DIR = OUTPUT_DIR / "raw" / "attachments"


def main() -> None:
    global CODEX_HOME, SESSION_DIR, INDEX_PATH, ATTACHMENTS_DIR
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=OUTPUT_DIR,
        help="导出目录；默认在当前目录创建带时间戳的新目录",
    )
    parser.add_argument(
        "--codex-home",
        type=Path,
        default=CODEX_HOME,
        help="Codex 数据目录；默认使用 CODEX_HOME 或 ~/.codex",
    )
    parser.add_argument(
        "--current-thread-id",
        default="",
        help="可选：指定当前会话 ID；不填时自动选择最近修改的会话",
    )
    args = parser.parse_args()

    CODEX_HOME = args.codex_home.resolve()
    SESSION_DIR = CODEX_HOME / "sessions"
    INDEX_PATH = CODEX_HOME / "session_index.jsonl"
    ATTACHMENTS_DIR = CODEX_HOME / "attachments"
    configure_output(args.output)

    if not SESSION_DIR.is_dir():
        raise SystemExit(f"Codex sessions directory not found: {SESSION_DIR}")

    reset_generated_dir(READABLE_DIR)
    raw_dir = OUTPUT_DIR / "raw"
    reset_generated_dir(raw_dir)
    RAW_SESSION_DIR.mkdir(parents=True, exist_ok=True)

    titles = load_titles()
    session_paths = sorted(SESSION_DIR.rglob("*.jsonl"))
    if not session_paths:
        raise SystemExit(f"No Codex sessions found in {SESSION_DIR}")
    if args.current_thread_id:
        current_path = next(
            (path for path in session_paths if args.current_thread_id in path.name),
            None,
        )
        if current_path is None:
            raise SystemExit(f"Current thread ID not found: {args.current_thread_id}")
    else:
        current_path = max(session_paths, key=lambda path: path.stat().st_mtime)
    sessions = [
        export_session(path, titles, current_path)
        for path in session_paths
    ]
    sessions.sort(key=lambda item: item.get("created_at") or "")

    if INDEX_PATH.is_file():
        shutil.copy2(INDEX_PATH, OUTPUT_DIR / "raw" / "session_index.jsonl")

    attachments: list[dict[str, Any]] = []
    if ATTACHMENTS_DIR.is_dir():
        RAW_ATTACHMENTS_DIR.mkdir(parents=True, exist_ok=True)
        for path in ATTACHMENTS_DIR.rglob("*"):
            if not path.is_file():
                continue
            relative = path.relative_to(ATTACHMENTS_DIR)
            destination = RAW_ATTACHMENTS_DIR / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, destination)
            attachments.append(
                {
                    "file": str(destination.relative_to(OUTPUT_DIR)),
                    "bytes": path.stat().st_size,
                    "sha256": sha256(path),
                }
            )

    current = next((item for item in sessions if item["is_current_thread"]), None)
    if current:
        current_source = OUTPUT_DIR / current["readable_file"]
        shutil.copy2(current_source, OUTPUT_DIR / "current-thread.md")

    manifest = {
        "format": "codex-session-migration-v1",
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "codex_home": str(CODEX_HOME),
        "session_count": len(sessions),
        "current_thread_id": current["session_id"] if current else None,
        "sessions": sessions,
        "attachments": attachments,
    }
    (OUTPUT_DIR / "migration-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    index_lines = [
        "# Codex 会话索引",
        "",
        f"共 {len(sessions)} 个会话，{sum(item['message_count'] for item in sessions)} 条用户/助手消息。",
        "",
        "| 创建时间 | 会话 | 消息数 | 原始记录数 | 文件 |",
        "| --- | --- | ---: | ---: | --- |",
    ]
    for item in sessions:
        title = item["title"].replace("|", "\\|")
        if item["is_current_thread"]:
            title = f"**{title}**（当前会话）"
        href = quote(item["readable_file"].replace("\\", "/"))
        index_lines.append(
            f"| {item.get('created_at') or '-'} | {title} | {item['message_count']} | "
            f"{item['record_count']} | [打开](<{href}>) |"
        )
    (OUTPUT_DIR / "SESSIONS.md").write_text("\n".join(index_lines) + "\n", encoding="utf-8")

    print(json.dumps(
        {
            "sessions": len(sessions),
            "messages": sum(item["message_count"] for item in sessions),
            "attachments": len(attachments),
            "current_thread": current["readable_file"] if current else None,
        },
        ensure_ascii=False,
    ))


if __name__ == "__main__":
    main()

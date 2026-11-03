from __future__ import annotations

import re
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any

from .config import Settings
from .models import Job


MODULE_NAMES = {
    "logo_recolor": "单Logo多色",
    "logo_color_batch": "单色多Logo",
    "product_generate": "产品裂变",
    "product_color_finalize": "商品配色",
    "pattern_batch_finalize": "印花套图",
}


def _safe_label(value: str, fallback: str = "visual") -> str:
    label = re.sub(r"[^\w#-]+", "-", value, flags=re.UNICODE).strip("-")
    return (label or fallback)[:60]


def create_export_group(
    settings: Settings,
    module_kind: str,
    sku: str,
    started_at: str | None,
) -> Path:
    module_name = MODULE_NAMES.get(module_kind)
    if not module_name:
        raise ValueError("不支持的导出模块")
    try:
        normalized_started_at = (started_at or "").strip()
        if normalized_started_at.endswith("Z"):
            normalized_started_at = normalized_started_at[:-1] + "+00:00"
        timestamp = (
            datetime.fromisoformat(normalized_started_at).astimezone()
            if normalized_started_at
            else datetime.now().astimezone()
        )
    except ValueError as exc:
        raise ValueError("任务开始时间格式无效") from exc
    safe_sku = _safe_label(sku, fallback="")
    stem_parts = [module_name]
    if safe_sku:
        stem_parts.append(safe_sku)
    stem_parts.append(timestamp.strftime("%Y-%m-%d_%H-%M-%S"))
    base_name = "_".join(stem_parts)
    folder = settings.export_dir / base_name
    duplicate = 2
    while folder.exists():
        folder = settings.export_dir / f"{base_name}_{duplicate}"
        duplicate += 1
    folder.mkdir(parents=True, exist_ok=False)
    if module_kind == "pattern_batch_finalize":
        (folder / "生成图").mkdir()
        (folder / "拼图与清单").mkdir()
    return folder


def export_job_to_desktop(
    settings: Settings,
    job: Job,
    manifest_path: str | None,
) -> Path:
    """Copy a completed job into one persistent desktop archive."""

    module_name = MODULE_NAMES.get(job.kind, "视觉生成")
    sku = _safe_label(str(job.options.get("sku") or ""), fallback="")
    colors = job.options.get("colors")
    if isinstance(colors, list):
        label = "-".join(
            str(item.get("hex") if isinstance(item, dict) else item)
            for item in colors
            if item
        )
    else:
        references = job.options.get("references")
        if isinstance(references, list):
            label = f"印花套图-{len(references)}张"
        else:
            label = str(
                job.options.get("color") or job.options.get("prompt") or ""
            )
    group_value = job.options.get("export_group_path")
    if group_value:
        folder = Path(str(group_value)).resolve()
        export_root = settings.export_dir.resolve()
        if not folder.is_relative_to(export_root):
            raise ValueError("导出分组路径超出桌面归档目录")
        folder.mkdir(parents=True, exist_ok=True)
    else:
        folder = create_export_group(
            settings,
            job.kind,
            sku,
            job.created_at,
        )
    generated_dir = folder
    summary_dir = folder
    if job.kind == "pattern_batch_finalize":
        generated_dir = folder / "生成图"
        summary_dir = folder / "拼图与清单"
        generated_dir.mkdir(exist_ok=True)
        summary_dir.mkdir(exist_ok=True)
    output_dir = settings.job_dir(job.id) / "outputs"

    image_index = 1
    batch_index = max(1, int(job.options.get("batch_index", 1) or 1))
    grouped_pattern = bool(group_value) and job.kind == "pattern_batch_finalize"
    for path in sorted(output_dir.iterdir()):
        if path.is_file() and path.suffix.lower() in {
            ".png",
            ".jpg",
            ".jpeg",
            ".webp",
            ".json",
            ".csv",
        }:
            if path.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}:
                prefix = f"批次{batch_index:02d}_" if grouped_pattern else ""
                filename = f"{prefix}{folder.name}_{image_index:02d}_{_safe_label(path.stem, fallback='image')}{path.suffix.lower()}"
                image_index += 1
            else:
                filename = (
                    f"批次{batch_index:02d}_{path.name}"
                    if grouped_pattern
                    else path.name
                )
            destination_dir = (
                summary_dir
                if job.kind == "pattern_batch_finalize"
                and (
                    path.name == "pattern-contact-sheet.png"
                    or path.suffix.lower() in {".json", ".csv"}
                )
                else generated_dir
            )
            shutil.copy2(path, destination_dir / filename)

    if job.input_assets:
        source = Path(job.input_assets[0])
        if source.exists():
            source_name = (
                f"商品主图{source.suffix.lower()}"
                if grouped_pattern
                else f"{folder.name}_00_source{source.suffix.lower()}"
            )
            if not (summary_dir / source_name).exists():
                shutil.copy2(source, summary_dir / source_name)

    if manifest_path:
        manifest = Path(manifest_path)
        if manifest.exists():
            manifest_name = (
                f"批次{batch_index:02d}_manifest.json"
                if grouped_pattern
                else "manifest.json"
            )
            shutil.copy2(manifest, summary_dir / manifest_name)
        csv_path = manifest.with_suffix(".csv")
        if csv_path.exists():
            csv_name = (
                f"批次{batch_index:02d}_manifest.csv"
                if grouped_pattern
                else "manifest.csv"
            )
            shutil.copy2(csv_path, summary_dir / csv_name)

    summary = [
        f"Job: {job.id}",
        f"Type: {job.kind}",
        f"Created: {job.created_at}",
        f"SKU: {sku or '-'}",
        f"Colors: {label}",
        "Files are organized in this single VisualForge desktop archive.",
    ]
    readme_path = summary_dir / "README.txt"
    mode = "a" if readme_path.exists() else "w"
    with readme_path.open(mode, encoding="utf-8") as stream:
        if mode == "a":
            stream.write("\n\n")
        stream.write("\n".join(summary))
    return folder


from __future__ import annotations

import csv
import hashlib
import re
from pathlib import Path
from typing import Any, Iterable

from PIL import Image, ImageDraw


class ImageValidationError(ValueError):
    pass


def normalize_color(value: str) -> str:
    text = str(value).strip().upper()
    if re.fullmatch(r"#[0-9A-F]{6}", text):
        return text
    if re.fullmatch(r"[0-9A-F]{6}", text):
        return f"#{text}"
    if re.fullmatch(r"#[0-9A-F]{3}", text):
        return "#" + "".join(char * 2 for char in text[1:])
    raise ImageValidationError(f"无效颜色值：{value!r}，请使用 #RRGGBB")


def normalize_colors(values: Iterable[str] | str) -> list[str]:
    if isinstance(values, str):
        values = re.split(r"[,;\s]+", values)
    colors: list[str] = []
    for value in values:
        if str(value).strip():
            color = normalize_color(str(value))
            if color not in colors:
                colors.append(color)
    if not colors:
        raise ImageValidationError("至少需要一个目标颜色")
    if len(colors) > 30:
        raise ImageValidationError("单次任务最多支持 30 个颜色")
    return colors


def safe_filename(name: str, fallback: str = "file") -> str:
    stem = Path(name).stem
    suffix = Path(name).suffix.lower()
    stem = re.sub(r"[^\w.-]+", "-", stem, flags=re.UNICODE).strip(" .-_")
    if not stem:
        stem = fallback
    return f"{stem[:80]}{suffix[:10]}"


def load_rgba(path: str | Path) -> Image.Image:
    try:
        with Image.open(path) as source:
            source.load()
            return source.convert("RGBA")
    except Exception as exc:
        raise ImageValidationError(f"无法读取图片：{Path(path).name}") from exc


def _has_transparency(image: Image.Image) -> bool:
    alpha = image.getchannel("A")
    return alpha.getextrema()[0] < 250


def remove_flat_background(image: Image.Image, tolerance: int = 18) -> Image.Image:
    """Remove a connected near-flat background while preserving interior art.

    This is deliberately conservative. Images that already contain alpha are
    left untouched, which is the safest mode for professional logo source files.
    """

    rgba = image.convert("RGBA")
    if _has_transparency(rgba):
        return rgba

    rgb = rgba.convert("RGB")
    pixels = rgb.load()
    width, height = rgb.size
    if width < 3 or height < 3:
        return rgba

    corner_colors = [
        pixels[0, 0],
        pixels[width - 1, 0],
        pixels[0, height - 1],
        pixels[width - 1, height - 1],
    ]
    background = tuple(
        sorted(color[channel] for color in corner_colors)[1] for channel in range(3)
    )
    seed_points = [
        point
        for point in [
            (0, 0),
            (width - 1, 0),
            (0, height - 1),
            (width - 1, height - 1),
            (width // 2, 0),
            (width // 2, height - 1),
            (0, height // 2),
            (width - 1, height // 2),
        ]
        if max(
            abs(pixels[point][channel] - background[channel])
            for channel in range(3)
        )
        <= tolerance
    ]
    if not seed_points:
        return rgba

    sentinel = (255, 0, 255)
    work = rgb.copy()
    for point in seed_points:
        if work.getpixel(point) != sentinel:
            ImageDraw.floodfill(work, point, sentinel, thresh=tolerance)

    transparent_mask = Image.new("L", rgba.size, 0)
    pixel_source = (
        work.get_flattened_data()
        if hasattr(work, "get_flattened_data")
        else work.getdata()
    )
    transparent_mask.putdata(
        [255 if pixel == sentinel else 0 for pixel in pixel_source]
    )
    alpha = rgba.getchannel("A")
    alpha = Image.composite(Image.new("L", rgba.size, 0), alpha, transparent_mask)
    rgba.putalpha(alpha)
    return rgba


def trim_transparent(image: Image.Image, padding: int = 12) -> Image.Image:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ImageValidationError("图片中没有可见内容")
    left, top, right, bottom = bbox
    left = max(0, left - padding)
    top = max(0, top - padding)
    right = min(image.width, right + padding)
    bottom = min(image.height, bottom + padding)
    return image.crop((left, top, right, bottom))


def prepare_logo(
    source_path: str | Path,
    *,
    remove_background: bool | str = "auto",
    trim: bool = True,
    tolerance: int = 18,
) -> Image.Image:
    image = load_rgba(source_path)
    should_remove = remove_background is True or (
        str(remove_background).lower() == "auto" and not _has_transparency(image)
    )
    if should_remove:
        image = remove_flat_background(image, tolerance=max(0, min(80, tolerance)))
    if trim:
        image = trim_transparent(image)
    return image


def recolor_image(image: Image.Image, color: str) -> Image.Image:
    normalized = normalize_color(color)
    target = tuple(bytes.fromhex(normalized[1:]))
    solid = Image.new("RGBA", image.size, (*target, 255))
    solid.putalpha(image.getchannel("A"))
    return solid


def unique_output_path(
    directory: Path, stem: str, suffix: str, seen: set[str] | None = None
) -> Path:
    seen = seen if seen is not None else set()
    candidate = f"{stem}{suffix}"
    index = 2
    while candidate.lower() in seen:
        candidate = f"{stem}-{index}{suffix}"
        index += 1
    seen.add(candidate.lower())
    return directory / candidate


def save_logo(path: Path, image: Image.Image) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG", optimize=True)
    return path


def file_sha256(path: str | Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def asset_record(
    path: Path, *, source: str | None = None, **metadata: Any
) -> dict[str, Any]:
    with Image.open(path) as image:
        width, height = image.size
    record: dict[str, Any] = {
        "name": path.name,
        "path": str(path.resolve()),
        "content_type": "image/png",
        "size": path.stat().st_size,
        "width": width,
        "height": height,
        "sha256": file_sha256(path),
    }
    if source is not None:
        record["source"] = source
    record.update(metadata)
    return record


def write_manifest_csv(manifest: dict[str, Any], path: Path) -> None:
    outputs = manifest.get("outputs", [])
    fieldnames = [
        "name",
        "source",
        "color",
        "direction",
        "prompt",
        "delta_e",
        "qa_status",
        "coverage",
        "variant_type",
        "muse_delta_e",
        "sha256",
    ]
    with path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for output in outputs:
            writer.writerow(output)


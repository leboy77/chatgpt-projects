from __future__ import annotations

import math
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageOps

from .imaging import ImageValidationError, asset_record
from .product_color import save_srgb_png


def finalize_pattern_batch(
    base_path: Path,
    generated_paths: list[Path],
    references: list[dict[str, Any]],
    output_dir: Path,
    options: dict[str, Any],
    progress=None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if not generated_paths:
        raise ImageValidationError("没有可归档的印花生成图")
    if len(generated_paths) != len(references):
        raise ImageValidationError("印花生成图数量与参考图数量不一致")
    try:
        with Image.open(base_path) as source:
            source.load()
            base_size = source.size
    except Exception as exc:
        raise ImageValidationError(f"无法读取白底商品图：{exc}") from exc

    outputs: list[dict[str, Any]] = []
    total = len(generated_paths)
    for index, (generated_path, reference) in enumerate(
        zip(generated_paths, references, strict=True), start=1
    ):
        try:
            with Image.open(generated_path) as source:
                source.load()
                image = ImageOps.fit(
                    source.convert("RGB"),
                    base_size,
                    method=Image.Resampling.LANCZOS,
                    centering=(0.5, 0.5),
                )
            reference_name = reference.get("name") or f"reference-{index}"
            safe_stem = Path(reference_name).stem[:70]
            path = output_dir / f"{index:02d}-{safe_stem}.png"
            save_srgb_png(image, path)
            outputs.append(
                {
                    "path": str(path.resolve()),
                    "name": path.name,
                    "source": reference_name,
                    "reference_index": index,
                    "background_mode": options.get("background_mode", "keep"),
                    "variant_type": "pattern_transfer",
                }
            )
        except Exception:
            continue
        if progress:
            progress(
                10 + int(index / max(1, total) * 82),
                f"已归档印花结果 {index}/{total}",
            )
    if not outputs:
        raise ImageValidationError("所有印花结果都无法读取")

    sheet = output_dir / "pattern-contact-sheet.png"
    make_pattern_contact_sheet(outputs, sheet, columns=4)
    if sheet.exists():
        outputs.append(
            {
                "path": str(sheet.resolve()),
                "name": sheet.name,
                "source": "all-pattern-results",
                "variant_type": "contact_sheet",
            }
        )
    return outputs, {
        "mode": "pattern_transfer_batch",
        "background_mode": options.get("background_mode", "keep"),
        "reference_count": len(references),
        "output_count": len(outputs) - 1,
        "batch_limit_mb": options.get("batch_limit_mb", 24),
    }


def make_pattern_contact_sheet(
    outputs: list[dict[str, Any]],
    destination: Path,
    *,
    columns: int = 4,
) -> Path | None:
    if not outputs:
        return None
    tile_width = 360
    tile_height = 450
    image_height = 390
    columns = max(1, min(columns, len(outputs)))
    rows = math.ceil(len(outputs) / columns)
    canvas = Image.new(
        "RGB",
        (columns * tile_width, rows * tile_height),
        (248, 246, 241),
    )
    draw = ImageDraw.Draw(canvas)
    for index, output in enumerate(outputs):
        row, column = divmod(index, columns)
        with Image.open(output["path"]) as source:
            source.load()
            tile_image = ImageOps.contain(
                source.convert("RGB"),
                (tile_width - 24, image_height - 28),
                Image.Resampling.LANCZOS,
            )
        x = column * tile_width + (tile_width - tile_image.width) // 2
        y = row * tile_height + (image_height - tile_image.height) // 2
        canvas.paste(tile_image, (x, y))
        label = Path(output["name"]).stem[:35]
        draw.text(
            (column * tile_width + 12, row * tile_height + image_height + 10),
            label,
            fill=(45, 52, 48),
        )
    destination.parent.mkdir(parents=True, exist_ok=True)
    save_srgb_png(canvas, destination)
    return destination


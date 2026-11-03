from __future__ import annotations

import io
import json
import shutil
from pathlib import Path
from typing import Any, Callable

from PIL import Image, ImageOps

from .config import Settings
from .imaging import (
    ImageValidationError,
    asset_record,
    normalize_color,
    normalize_colors,
    prepare_logo,
    recolor_image,
    safe_filename,
    save_logo,
    unique_output_path,
    write_manifest_csv,
)
from .models import Job, PipelineResult
from .providers import ImageProvider, ProviderError, parse_size
from .pattern import finalize_pattern_batch
from .product_color import (
    apply_target_color,
    color_status,
    create_auto_product_mask,
    create_region_color_mask,
    create_target_color_mask,
    delta_e_2000,
    load_product_mask,
    make_contact_sheet,
    measure_color_delta,
    normalize_product_colors,
    save_srgb_png,
)


SUPPORTED_JOB_KINDS = {
    "logo_recolor",
    "logo_color_batch",
    "product_generate",
    "product_color_finalize",
    "pattern_batch_finalize",
}
ProgressCallback = Callable[[int, str], None]


class NonRetryableJobError(RuntimeError):
    pass


VARIATION_DIRECTIONS: list[tuple[str, str]] = [
    (
        "studio",
        "Premium studio hero shot, clean seamless backdrop, controlled softbox "
        "lighting, centered product composition, high-end commercial photography.",
    ),
    (
        "lifestyle",
        "Natural lifestyle scene that communicates real use, believable props, "
        "warm editorial lighting, shallow but controlled depth of field.",
    ),
    (
        "detail",
        "Macro material and craftsmanship detail, tactile texture, precise "
        "highlights, premium catalog photography.",
    ),
    (
        "seasonal",
        "Seasonal retail campaign scene with restrained decorative props, bold "
        "color blocking, aspirational art direction and generous negative space.",
    ),
    (
        "editorial",
        "Magazine editorial still life, sculptural shadows, sophisticated palette, "
        "dynamic but product-led composition.",
    ),
    (
        "flat_lay",
        "Top-down flat lay on a refined surface, carefully arranged companion "
        "objects, crisp commercial lighting and balanced negative space.",
    ),
    (
        "outdoor",
        "Premium outdoor context with authentic ambient light, shallow depth of "
        "field, natural materials and a strong sense of place.",
    ),
    (
        "gift",
        "Premium gifting concept, elegant packaging accents, celebratory but "
        "restrained styling, commercial campaign quality.",
    ),
]


def _bool_option(options: dict[str, Any], key: str, default: bool) -> bool:
    value = options.get(key, default)
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() not in {"false", "0", "no", "off", ""}
    return bool(value)


def _background_option(options: dict[str, Any]) -> bool | str:
    value = options.get("remove_background", "auto")
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    return "auto" if text == "auto" else text not in {"false", "0", "no", "off"}


def _write_manifest(
    output_dir: Path, manifest: dict[str, Any]
) -> tuple[Path, list[dict[str, Any]]]:
    manifest_path = output_dir / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    write_manifest_csv(manifest, output_dir / "manifest.csv")
    outputs = [
        asset_record(
            Path(asset["path"]),
            source=asset.get("source"),
            color=asset.get("color"),
            direction=asset.get("direction"),
            prompt=asset.get("prompt"),
            **{
                key: value
                for key, value in asset.items()
                if key
                not in {
                    "path",
                    "name",
                    "source",
                    "color",
                    "direction",
                    "prompt",
                }
            },
        )
        for asset in manifest["outputs"]
    ]
    manifest["output_records"] = [
        {
            "name": record["name"],
            "sha256": record["sha256"],
            "width": record["width"],
            "height": record["height"],
        }
        for record in outputs
    ]
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return manifest_path, outputs


def recolor_one_logo_to_many(
    source: Path,
    output_dir: Path,
    colors: list[str],
    options: dict[str, Any],
    progress: ProgressCallback | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    try:
        logo = prepare_logo(
            source,
            remove_background=_background_option(options),
            trim=_bool_option(options, "trim", True),
            tolerance=int(options.get("background_tolerance", 18)),
        )
    except (ImageValidationError, OSError, ValueError) as exc:
        raise NonRetryableJobError(str(exc)) from exc

    outputs: list[dict[str, Any]] = []
    seen: set[str] = set()
    for index, color in enumerate(colors, start=1):
        recolored = recolor_image(logo, color)
        path = unique_output_path(
            output_dir,
            f"{safe_filename(source.name)}-{color[1:]}",
            ".png",
            seen,
        )
        save_logo(path, recolored)
        outputs.append(
            {
                "path": str(path.resolve()),
                "name": path.name,
                "source": source.name,
                "color": color,
            }
        )
        if progress:
            progress(
                int(index / max(1, len(colors)) * 95),
                f"已生成颜色 {index}/{len(colors)}",
            )
    return outputs, {
        "mode": "one_logo_many_colors",
        "source": source.name,
        "colors": colors,
        "remove_background": _background_option(options),
        "trim": _bool_option(options, "trim", True),
    }


def recolor_many_logos_to_one(
    sources: list[Path],
    output_dir: Path,
    color: str,
    options: dict[str, Any],
    progress: ProgressCallback | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    outputs: list[dict[str, Any]] = []
    seen: set[str] = set()
    failures: list[dict[str, str]] = []
    for index, source in enumerate(sources, start=1):
        try:
            logo = prepare_logo(
                source,
                remove_background=_background_option(options),
                trim=_bool_option(options, "trim", True),
                tolerance=int(options.get("background_tolerance", 18)),
            )
            recolored = recolor_image(logo, color)
            path = unique_output_path(
                output_dir,
                f"{safe_filename(source.name)}-{color[1:]}",
                ".png",
                seen,
            )
            save_logo(path, recolored)
            outputs.append(
                {
                    "path": str(path.resolve()),
                    "name": path.name,
                    "source": source.name,
                    "color": color,
                }
            )
        except (ImageValidationError, OSError, ValueError) as exc:
            failures.append({"source": source.name, "error": str(exc)})
        if progress:
            progress(
                int(index / max(1, len(sources)) * 95),
                f"已处理 Logo {index}/{len(sources)}",
            )
    if not outputs:
        raise NonRetryableJobError("所有 Logo 均处理失败，请检查源文件")
    return outputs, {
        "mode": "many_logos_one_color",
        "color": color,
        "source_count": len(sources),
        "failed": failures,
        "remove_background": _background_option(options),
        "trim": _bool_option(options, "trim", True),
    }


def build_prompt_variants(
    base_prompt: str,
    count: int,
    preselected: list[str] | None = None,
) -> list[dict[str, str]]:
    base_prompt = " ".join(str(base_prompt).split())
    if not base_prompt:
        raise NonRetryableJobError("请输入产品描述")
    if count < 1 or count > 12:
        raise NonRetryableJobError("裂变数量需在 1 到 12 之间")
    if preselected:
        prompts = [" ".join(str(item).split()) for item in preselected if str(item).strip()]
        if not prompts:
            raise NonRetryableJobError("自定义裂变描述不能为空")
        prompts = prompts[: min(count, 12)]
        if not prompts:
            raise NonRetryableJobError("没有可用的自定义裂变描述")
        return [
            {"direction": f"custom_{index + 1}", "prompt": prompt}
            for index, prompt in enumerate(prompts)
        ]

    fidelity = (
        "Keep the product identity, silhouette, material, proportions, color and "
        "construction exactly consistent. Product is the hero. No invented text, "
        "no watermark, no unrelated logo, no duplicate product."
    )
    variants = []
    for index in range(count):
        direction, description = VARIATION_DIRECTIONS[
            index % len(VARIATION_DIRECTIONS)
        ]
        variants.append(
            {
                "direction": direction,
                "prompt": f"{base_prompt}. {description} {fidelity}",
            }
        )
    return variants


def generate_product_variants(
    output_dir: Path,
    options: dict[str, Any],
    provider: ImageProvider,
    progress: ProgressCallback | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    try:
        count = int(options.get("count", 4))
        size = str(options.get("size", "1024x1024"))
        quality = str(options.get("quality", "high"))
        parse_size(size)
        custom_prompts = options.get("prompts")
        if custom_prompts is not None and not isinstance(custom_prompts, list):
            raise NonRetryableJobError("prompts 必须是字符串数组")
        variants = build_prompt_variants(
            str(options.get("prompt", "")), count, custom_prompts
        )
    except (ValueError, ImageValidationError) as exc:
        raise NonRetryableJobError(str(exc)) from exc

    outputs: list[dict[str, Any]] = []
    seen: set[str] = set()
    for index, variant in enumerate(variants, start=1):
        try:
            raw = provider.generate(variant["prompt"], size, quality)
            if not raw:
                raise ProviderError("图片接口返回了空内容")
            try:
                with Image.open(io.BytesIO(raw)) as generated:
                    generated.load()
                    path = unique_output_path(
                        output_dir,
                        f"{index:02d}-{variant['direction']}",
                        ".png",
                        seen,
                    )
                    path.parent.mkdir(parents=True, exist_ok=True)
                    generated.convert("RGB").save(path, "PNG", optimize=True)
            except Exception as exc:
                if isinstance(exc, ProviderError):
                    raise
                raise ProviderError(f"模型返回内容不是有效图片：{exc}") from exc
            outputs.append(
                {
                    "path": str(path.resolve()),
                    "name": path.name,
                    "direction": variant["direction"],
                    "prompt": variant["prompt"],
                }
            )
        except ProviderError:
            raise
        if progress:
            progress(
                int(index / max(1, len(variants)) * 95),
                f"已生成图片 {index}/{len(variants)}",
            )
    return outputs, {
        "mode": "product_text_to_image_variations",
        "provider": provider.name,
        "base_prompt": options.get("prompt", ""),
        "count": len(outputs),
        "size": size,
        "quality": quality,
        "directions": [item["direction"] for item in variants],
    }


def finalize_product_colors(
    master_path: Path,
    variant_paths: list[Path],
    mask_path: Path | None,
    colors: list[dict[str, str]],
    output_dir: Path,
    options: dict[str, Any],
    progress: ProgressCallback | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if not variant_paths:
        raise NonRetryableJobError("至少需要一张 Muse 生成结果")
    if len(variant_paths) != len(colors):
        raise NonRetryableJobError(
            f"生成图数量 {len(variant_paths)} 与色号数量 {len(colors)} 不一致"
        )
    try:
        with Image.open(master_path) as source:
            source.load()
            master = source.convert("RGB")
    except Exception as exc:
        raise NonRetryableJobError(f"无法读取商品主图：{exc}") from exc

    try:
        pass_limit = float(options.get("pass_limit", 3.0))
        review_limit = float(options.get("review_limit", 5.0))
    except (TypeError, ValueError) as exc:
        raise NonRetryableJobError("色彩质检阈值必须是数字") from exc
    if review_limit < pass_limit:
        raise NonRetryableJobError("review_limit 不能小于 pass_limit")
    region = str(options.get("region", "whole")).lower()
    if region not in {"whole", "upper", "lower"}:
        raise NonRetryableJobError("region 只支持 whole、upper、lower")

    provided_mask = None
    if mask_path:
        try:
            provided_mask = load_product_mask(mask_path, master.size)
        except ImageValidationError as exc:
            raise NonRetryableJobError(str(exc)) from exc

    outputs: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []
    diagnostics: list[dict[str, Any]] = []
    total = len(variant_paths)
    for index, (variant_path, color) in enumerate(
        zip(variant_paths, colors, strict=True), start=1
    ):
        try:
            with Image.open(variant_path) as source:
                source.load()
                variant = ImageOps.fit(
                    source.convert("RGB"),
                    master.size,
                    method=Image.Resampling.LANCZOS,
                    centering=(0.5, 0.5),
                )
            if provided_mask is not None:
                mask = provided_mask
                mask_source = "provided"
                mask_pixels = (
                    mask.get_flattened_data()
                    if hasattr(mask, "get_flattened_data")
                    else mask.getdata()
                )
                coverage = sum(
                    1 for value in mask_pixels if value >= 96
                ) / (mask.width * mask.height)
            else:
                target_mask, target_coverage = create_target_color_mask(
                    variant, color["hex"], region=region
                )
                mask = target_mask
                coverage = target_coverage
                mask_source = "target_color"
                if coverage < 0.002:
                    mask, coverage = create_auto_product_mask(master, variant)
                    mask_source = "difference"
                if coverage < 0.002:
                    mask, coverage, _ = create_region_color_mask(
                        master, region=region
                    )
                    mask_source = "dominant_color"
            if coverage < 0.002:
                raise ImageValidationError(
                    "自动识别到的商品区域不足 0.2%，请提供商品遮罩"
                )
            corrected, source_median = apply_target_color(
                variant, mask, color["hex"]
            )
            raw_measured = measure_color_delta(variant, mask)
            measured = measure_color_delta(corrected, mask)
            target_rgb = tuple(bytes.fromhex(color["hex"][1:]))
            muse_delta_e = delta_e_2000(raw_measured, target_rgb)
            delta_e = delta_e_2000(measured, target_rgb)
            qa_status = color_status(delta_e, pass_limit, review_limit)
            output_path = output_dir / f"{index:02d}-{color['hex'][1:]}.png"
            save_srgb_png(corrected, output_path)
            mask_path_out = output_dir / f"{index:02d}-{color['hex'][1:]}-mask.png"
            mask.save(mask_path_out, "PNG", optimize=True)
            raw_path_out = output_dir / f"{index:02d}-{color['hex'][1:]}-muse-raw.png"
            save_srgb_png(variant, raw_path_out)
            outputs.append(
                {
                    "path": str(raw_path_out.resolve()),
                    "name": raw_path_out.name,
                    "source": variant_path.name,
                    "color": color["hex"],
                    "color_name": color.get("name", ""),
                    "muse_delta_e": round(muse_delta_e, 2),
                    "coverage": round(coverage, 4),
                    "mask_source": mask_source,
                    "variant_type": "muse_raw",
                }
            )
            outputs.append(
                {
                    "path": str(output_path.resolve()),
                    "name": output_path.name,
                    "source": variant_path.name,
                    "color": color["hex"],
                    "color_name": color.get("name", ""),
                    "delta_e": round(delta_e, 2),
                    "qa_status": qa_status,
                    "coverage": round(coverage, 4),
                    "mask_source": mask_source,
                    "variant_type": "corrected",
                    "muse_delta_e": round(muse_delta_e, 2),
                    "source_median": source_median,
                }
            )
            diagnostics.append(
                {
                    "color": color["hex"],
                    "mask": str(mask_path_out.resolve()),
                    "raw": str(raw_path_out.resolve()),
                }
            )
        except Exception as exc:
            failures.append(
                {
                    "color": color["hex"],
                    "source": variant_path.name,
                    "error": str(exc),
                }
            )
        if progress:
            progress(
                8 + int(index / max(1, total) * 82),
                f"已校色并质检 {index}/{total}",
            )
    if not outputs:
        raise NonRetryableJobError("所有商品颜色结果均无法校色，请检查主图与遮罩")

    sheet_path = output_dir / "contact-sheet.png"
    make_contact_sheet(
        [item for item in outputs if item.get("qa_status")],
        sheet_path,
        columns=int(options.get("sheet_columns", 4)),
    )
    if sheet_path.exists():
        outputs.append(
            {
                "path": str(sheet_path.resolve()),
                "name": sheet_path.name,
                "source": "all-generated-variants",
                "direction": "contact_sheet",
                "variant_type": "contact_sheet",
            }
        )
    passed = sum(1 for item in outputs if item.get("qa_status") == "pass")
    review = sum(1 for item in outputs if item.get("qa_status") == "review")
    retry = sum(1 for item in outputs if item.get("qa_status") == "retry")
    return outputs, {
        "mode": "muse_product_color_finalize",
        "master": master_path.name,
        "pass_limit": pass_limit,
        "review_limit": review_limit,
        "detected_products": sum(
            1 for item in outputs if item.get("qa_status")
        ),
        "qa": {"pass": passed, "review": review, "retry": retry},
        "failures": failures,
        "diagnostics": diagnostics,
    }


def run_job(
    job: Job,
    settings: Settings,
    provider: ImageProvider,
    progress: ProgressCallback | None = None,
) -> PipelineResult:
    job_dir = settings.job_dir(job.id)
    output_dir = job_dir / "outputs"
    if job.attempts > 1 and output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    inputs = [Path(item) for item in job.input_assets]

    if job.kind == "logo_recolor":
        if len(inputs) != 1:
            raise NonRetryableJobError("单 Logo 多色任务需要且只能上传 1 个 Logo")
        try:
            colors = normalize_colors(job.options.get("colors", []))
        except ImageValidationError as exc:
            raise NonRetryableJobError(str(exc)) from exc
        outputs, metadata = recolor_one_logo_to_many(
            inputs[0], output_dir, colors, job.options, progress
        )
        message = f"已生成 {len(outputs)} 个颜色版本"
    elif job.kind == "logo_color_batch":
        if not inputs:
            raise NonRetryableJobError("单色多 Logo 任务至少需要 1 个 Logo")
        if len(inputs) > 100:
            raise NonRetryableJobError("单次任务最多处理 100 个 Logo")
        try:
            color = normalize_color(str(job.options.get("color", "")))
        except ImageValidationError as exc:
            raise NonRetryableJobError(str(exc)) from exc
        outputs, metadata = recolor_many_logos_to_one(
            inputs, output_dir, color, job.options, progress
        )
        message = f"已统一处理 {len(outputs)} 个 Logo"
    elif job.kind == "product_generate":
        outputs, metadata = generate_product_variants(
            output_dir, job.options, provider, progress
        )
        message = f"已生成 {len(outputs)} 张产品视觉"
    elif job.kind == "product_color_finalize":
        if len(inputs) < 2:
            raise NonRetryableJobError(
                "商品多色任务需要主图和至少一张 Muse 生成图"
            )
        master = inputs[0]
        mask = next(
            (
                path
                for path in inputs[1:]
                if path.name.startswith(("__mask__", "mask-"))
            ),
            None,
        )
        variants = [path for path in inputs[1:] if path != mask]
        try:
            colors = normalize_product_colors(job.options.get("colors", []))
        except ImageValidationError as exc:
            raise NonRetryableJobError(str(exc)) from exc
        outputs, metadata = finalize_product_colors(
            master,
            variants,
            mask,
            colors,
            output_dir,
            job.options,
            progress,
        )
        qa = metadata["qa"]
        message = (
            f"已输出 {qa['pass'] + qa['review'] + qa['retry']} 个颜色，"
            f"通过 {qa['pass']}，复核 {qa['review']}，需重试 {qa['retry']}"
        )
    elif job.kind == "pattern_batch_finalize":
        if len(inputs) < 2:
            raise NonRetryableJobError(
                "印花套图任务需要白底商品图和至少一张 Muse 生成图"
            )
        references = job.options.get("references")
        if not isinstance(references, list):
            raise NonRetryableJobError("references 必须是参考图信息数组")
        try:
            outputs, metadata = finalize_pattern_batch(
                inputs[0],
                inputs[1:],
                references,
                output_dir,
                job.options,
                progress,
            )
        except ImageValidationError as exc:
            raise NonRetryableJobError(str(exc)) from exc
        message = f"已归档 {metadata['output_count']} 张印花套图"
    else:
        raise NonRetryableJobError(f"未知任务类型：{job.kind}")

    manifest = {
        "job_id": job.id,
        "kind": job.kind,
        "metadata": metadata,
        "outputs": outputs,
        "notes": "所有图片及 CSV、JSON 清单均由 Visual Forge 自动生成。",
    }
    manifest_path, output_records = _write_manifest(output_dir, manifest)
    return PipelineResult(
        assets=output_records,
        manifest={"path": str(manifest_path.resolve()), **manifest},
        message=message,
    )


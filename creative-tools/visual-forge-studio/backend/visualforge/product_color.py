from __future__ import annotations

import math
import re
import colorsys
from collections import deque
from pathlib import Path
from typing import Any

from PIL import Image, ImageChops, ImageCms, ImageDraw, ImageFilter, ImageOps

from .imaging import ImageValidationError, asset_record, normalize_color


_SRGB_PROFILE = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()


def save_srgb_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG", optimize=True, icc_profile=_SRGB_PROFILE)


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def rgb_to_lab(rgb: tuple[int, int, int]) -> tuple[float, float, float]:
    """Convert sRGB 0..255 to CIE Lab D65."""

    def linear(channel: int) -> float:
        value = channel / 255.0
        return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4

    red, green, blue = (linear(channel) for channel in rgb)
    x = (red * 0.4124564 + green * 0.3575761 + blue * 0.1804375) / 0.95047
    y = red * 0.2126729 + green * 0.7151522 + blue * 0.0721750
    z = (red * 0.0193339 + green * 0.1191920 + blue * 0.9503041) / 1.08883

    epsilon = 216 / 24389
    kappa = 24389 / 27

    def pivot(value: float) -> float:
        return value ** (1 / 3) if value > epsilon else (kappa * value + 16) / 116

    fx, fy, fz = pivot(x), pivot(y), pivot(z)
    return (116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz))


def delta_e_2000(
    first: tuple[int, int, int], second: tuple[int, int, int]
) -> float:
    lab1 = rgb_to_lab(first)
    lab2 = rgb_to_lab(second)
    lightness1, a1, b1 = lab1
    lightness2, a2, b2 = lab2
    chroma1 = math.hypot(a1, b1)
    chroma2 = math.hypot(a2, b2)
    mean_chroma = (chroma1 + chroma2) / 2
    compensation = 1 - 0.5 * math.sqrt(
        mean_chroma**7 / (mean_chroma**7 + 25**7)
    )
    a1_prime = (1 + compensation) * a1
    a2_prime = (1 + compensation) * a2
    chroma1_prime = math.hypot(a1_prime, b1)
    chroma2_prime = math.hypot(a2_prime, b2)

    def hue(a_value: float, b_value: float) -> float:
        angle = math.degrees(math.atan2(b_value, a_value))
        return angle + 360 if angle < 0 else angle

    hue1 = hue(a1_prime, b1)
    hue2 = hue(a2_prime, b2)
    delta_lightness = lightness2 - lightness1
    delta_chroma = chroma2_prime - chroma1_prime
    if chroma1_prime * chroma2_prime == 0:
        delta_hue_angle = 0.0
    else:
        delta_hue_angle = hue2 - hue1
        if delta_hue_angle > 180:
            delta_hue_angle -= 360
        elif delta_hue_angle < -180:
            delta_hue_angle += 360
    delta_hue = 2 * math.sqrt(chroma1_prime * chroma2_prime) * math.sin(
        math.radians(delta_hue_angle / 2)
    )
    mean_lightness = (lightness1 + lightness2) / 2
    mean_chroma_prime = (chroma1_prime + chroma2_prime) / 2
    if chroma1_prime * chroma2_prime == 0:
        mean_hue = hue1 + hue2
    elif abs(hue1 - hue2) <= 180:
        mean_hue = (hue1 + hue2) / 2
    elif hue1 + hue2 < 360:
        mean_hue = (hue1 + hue2 + 360) / 2
    else:
        mean_hue = (hue1 + hue2 - 360) / 2
    rotation_angle = (
        30
        * math.exp(-((mean_hue - 275) / 25) ** 2)
        if mean_hue is not None
        else 0
    )
    rotation_term = (
        -2
        * math.sqrt(
            mean_chroma_prime**7
            / (mean_chroma_prime**7 + 25**7)
        )
        * math.sin(math.radians(2 * rotation_angle))
    )
    lightness_term = 1 + 0.015 * (mean_lightness - 50) ** 2 / math.sqrt(
        20 + (mean_lightness - 50) ** 2
    )
    chroma_term = 1 + 0.045 * mean_chroma_prime
    hue_term = (
        1
        + 0.015
        * mean_chroma_prime
        * (1 - 0.17 * math.cos(math.radians(mean_hue - 30)) + 0.24 * math.cos(math.radians(2 * mean_hue)) + 0.32 * math.cos(math.radians(3 * mean_hue + 6)) - 0.20 * math.cos(math.radians(4 * mean_hue - 63)))
    )
    lightness_component = delta_lightness / lightness_term
    chroma_component = delta_chroma / chroma_term
    hue_component = delta_hue / hue_term
    return math.sqrt(
        lightness_component**2
        + chroma_component**2
        + hue_component**2
        + rotation_term * chroma_component * hue_component
    )


def _mask_histogram_median(histogram: list[int]) -> int:
    total = sum(histogram)
    if total == 0:
        return 0
    midpoint = total / 2
    cumulative = 0
    for index, count in enumerate(histogram):
        cumulative += count
        if cumulative >= midpoint:
            return index
    return 255


def _largest_components(mask: Image.Image) -> Image.Image:
    width, height = mask.size
    pixels = mask.load()
    visited = bytearray(width * height)
    components: list[tuple[int, list[tuple[int, int]]]] = []
    for y in range(height):
        for x in range(width):
            index = y * width + x
            if visited[index] or pixels[x, y] < 128:
                continue
            queue = deque([(x, y)])
            visited[index] = 1
            points: list[tuple[int, int]] = []
            while queue:
                current_x, current_y = queue.popleft()
                points.append((current_x, current_y))
                for next_x, next_y in (
                    (current_x - 1, current_y),
                    (current_x + 1, current_y),
                    (current_x, current_y - 1),
                    (current_x, current_y + 1),
                ):
                    if not (
                        0 <= next_x < width and 0 <= next_y < height
                    ):
                        continue
                    next_index = next_y * width + next_x
                    if (
                        not visited[next_index]
                        and pixels[next_x, next_y] >= 128
                    ):
                        visited[next_index] = 1
                        queue.append((next_x, next_y))
            components.append((len(points), points))
    if not components:
        return Image.new("L", mask.size, 0)
    components.sort(key=lambda item: item[0], reverse=True)
    largest = components[0][0]
    keep: list[tuple[int, int]] = []
    for area, points in components:
        if area < max(20, int(width * height * 0.0008)):
            continue
        if area >= largest * 0.22:
            keep.extend(points)
    result = Image.new("L", mask.size, 0)
    output = result.load()
    for x, y in keep:
        output[x, y] = 255
    return result


def create_auto_product_mask(
    master: Image.Image,
    variant: Image.Image,
    *,
    difference_threshold: int = 26,
    center_prior: float = 0.08,
) -> tuple[Image.Image, float]:
    """Find regions changed by Muse while rejecting disconnected edge noise."""

    master_rgb = master.convert("RGB")
    variant_rgb = variant.convert("RGB").resize(master_rgb.size, Image.Resampling.LANCZOS)
    difference = ImageChops.difference(master_rgb, variant_rgb).convert("L")
    binary = difference.point(
        lambda value: 255 if value >= difference_threshold else 0
    )
    width, height = binary.size
    prior = Image.new("L", binary.size, 0)
    left = int(width * center_prior)
    right = int(width * (1 - center_prior))
    top = int(height * center_prior * 0.5)
    bottom = int(height * (1 - center_prior * 0.35))
    prior.paste(255, (left, top, right, bottom))
    binary = ImageChops.multiply(binary, prior)
    binary = binary.filter(ImageFilter.MaxFilter(5)).filter(
        ImageFilter.MinFilter(3)
    )

    scale = min(1.0, 360 / max(binary.size))
    small = binary.resize(
        (
            max(1, round(width * scale)),
            max(1, round(height * scale)),
        ),
        Image.Resampling.NEAREST,
    )
    small = _largest_components(small)
    binary = small.resize(binary.size, Image.Resampling.NEAREST)
    binary = binary.filter(ImageFilter.MaxFilter(7)).filter(
        ImageFilter.MinFilter(5)
    )
    feather = binary.filter(ImageFilter.GaussianBlur(3))
    histogram = feather.histogram()
    coverage = sum(histogram[64:]) / (width * height)
    return feather, coverage


def _region_box(
    size: tuple[int, int], region: str
) -> tuple[int, int, int, int]:
    width, height = size
    boxes = {
        "lower": (0.10, 0.34, 0.90, 0.96),
        "upper": (0.08, 0.05, 0.92, 0.68),
        "whole": (0.08, 0.06, 0.92, 0.94),
    }
    left, top, right, bottom = boxes.get(region, boxes["whole"])
    return (
        int(width * left),
        int(height * top),
        int(width * right),
        int(height * bottom),
    )


def _component_metrics(mask: Image.Image) -> dict[str, float]:
    bbox = mask.getchannel("L").getbbox()
    pixels = mask.load()
    width, height = mask.size
    count = border = total_x = total_y = 0
    if bbox is None:
        return {
            "coverage": 0,
            "border_ratio": 1,
            "center_x": 0.5,
            "center_y": 0.5,
        }
    for y in range(bbox[1], bbox[3], 2):
        for x in range(bbox[0], bbox[2], 2):
            if pixels[x, y] < 96:
                continue
            count += 1
            total_x += x
            total_y += y
            if x <= 2 or y <= 2 or x >= width - 3 or y >= height - 3:
                border += 1
    if not count:
        return {
            "coverage": 0,
            "border_ratio": 1,
            "center_x": 0.5,
            "center_y": 0.5,
        }
    return {
        "coverage": count * 4 / (width * height),
        "border_ratio": border / count,
        "center_x": total_x / count / width,
        "center_y": total_y / count / height,
    }


def create_region_color_mask(
    master: Image.Image,
    *,
    region: str = "whole",
) -> tuple[Image.Image, float, tuple[int, int, int]]:
    """Extract a central dominant-color garment when image diff is unavailable."""

    source = master.convert("RGB")
    scale = min(1.0, 480 / max(source.size))
    small = source.resize(
        (
            max(1, round(source.width * scale)),
            max(1, round(source.height * scale)),
        ),
        Image.Resampling.LANCZOS,
    )
    width, height = small.size
    left, top, right, bottom = _region_box(small.size, region)
    sample_left = left + (right - left) * 0.22
    sample_right = right - (right - left) * 0.22
    sample_top = top + (bottom - top) * 0.12
    sample_bottom = bottom - (bottom - top) * 0.08
    buckets: dict[tuple[int, int, int], list[float]] = {}
    pixels = small.load()
    step_x = max(2, width // 130)
    step_y = max(2, height // 170)
    for y in range(int(sample_top), int(sample_bottom), step_y):
        for x in range(int(sample_left), int(sample_right), step_x):
            red, green, blue = pixels[x, y]
            key = (red // 28, green // 28, blue // 28)
            record = buckets.setdefault(key, [0, 0, 0, 0])
            record[0] += 1
            record[1] += red
            record[2] += green
            record[3] += blue
    if not buckets:
        return Image.new("L", master.size, 0), 0.0, (0, 0, 0)
    candidates = sorted(
        (
            (
                count,
                (
                    round(sum_red / count),
                    round(sum_green / count),
                    round(sum_blue / count),
                ),
            )
            for count, sum_red, sum_green, sum_blue in buckets.values()
        ),
        reverse=True,
    )[:18]
    best_mask = Image.new("L", small.size, 0)
    best_color = candidates[0][1]
    best_score = -1.0
    for count, color in candidates:
        red_limit, green_limit, blue_limit = color
        mask = Image.new("L", small.size, 0)
        output = mask.load()
        for y in range(top, bottom, 2):
            for x in range(left, right, 2):
                red, green, blue = pixels[x, y]
                distance = (
                    (red - red_limit) ** 2
                    + (green - green_limit) ** 2
                    + (blue - blue_limit) ** 2
                ) ** 0.5
                if distance <= 48:
                    output[x, y] = 255
                    if x + 1 < width:
                        output[x + 1, y] = 255
                    if y + 1 < height:
                        output[x, y + 1] = 255
        mask = mask.filter(ImageFilter.MaxFilter(5)).filter(
            ImageFilter.MinFilter(3)
        )
        mask = _largest_components(mask)
        metrics = _component_metrics(mask)
        if not 0.012 <= metrics["coverage"] <= 0.72:
            continue
        expected_y = {"upper": 0.35, "lower": 0.60, "whole": 0.48}.get(
            region, 0.48
        )
        count_weight = 1 + min(2.5, (count / 500) ** 0.8)
        score = (
            metrics["coverage"] ** 0.7
            * max(0.08, 1 - metrics["border_ratio"] * 2.0)
            * max(0.2, 1 - abs(metrics["center_x"] - 0.5))
            * max(0.2, 1 - abs(metrics["center_y"] - expected_y) * 2)
            * count_weight
        )
        if score > best_score:
            best_score = score
            best_mask = mask
            best_color = color
    if best_score < 0:
        return Image.new("L", master.size, 0), 0.0, best_color
    full_mask = best_mask.resize(master.size, Image.Resampling.BILINEAR)
    full_mask = full_mask.filter(ImageFilter.GaussianBlur(2))
    metrics = _component_metrics(full_mask)
    return full_mask, metrics["coverage"], best_color


def create_target_color_mask(
    image: Image.Image,
    target_hex: str,
    *,
    region: str = "whole",
) -> tuple[Image.Image, float]:
    """Extract pixels visibly close to the requested target color."""

    target_hex = normalize_color(target_hex)
    target_rgb = tuple(channel / 255 for channel in bytes.fromhex(target_hex[1:]))
    target_h, target_s, target_v = colorsys.rgb_to_hsv(*target_rgb)
    source = image.convert("RGB")
    scale = min(1.0, 480 / max(source.size))
    small = source.resize(
        (
            max(1, round(source.width * scale)),
            max(1, round(source.height * scale)),
        ),
        Image.Resampling.LANCZOS,
    )
    width, height = small.size
    mask = Image.new("L", small.size, 0)
    output = mask.load()
    pixels = small.load()
    for y in range(0, height, 2):
        for x in range(0, width, 2):
            red, green, blue = pixels[x, y]
            hue, saturation, value = colorsys.rgb_to_hsv(
                red / 255, green / 255, blue / 255
            )
            if target_s < 0.16:
                matches = (
                    saturation < 0.28
                    and abs(value - target_v) < 0.36
                )
            else:
                hue_distance = abs(hue - target_h)
                hue_distance = min(hue_distance, 1 - hue_distance)
                matches = (
                    hue_distance <= 0.055
                    and saturation >= max(0.18, target_s * 0.34)
                    and abs(value - target_v) <= 0.52
                )
            if matches:
                output[x, y] = 255
                if x + 1 < width:
                    output[x + 1, y] = 255
                if y + 1 < height:
                    output[x, y + 1] = 255
    mask = mask.filter(ImageFilter.MaxFilter(5)).filter(
        ImageFilter.MinFilter(3)
    )
    mask = _largest_components(mask)
    metrics = _component_metrics(mask)
    if not 0.004 <= metrics["coverage"] <= 0.72:
        return Image.new("L", image.size, 0), 0.0
    full_mask = mask.resize(image.size, Image.Resampling.BILINEAR)
    full_mask = full_mask.filter(ImageFilter.GaussianBlur(2))
    return full_mask, _component_metrics(full_mask)["coverage"]


def load_product_mask(path: Path, size: tuple[int, int]) -> Image.Image:
    try:
        with Image.open(path) as source:
            source.load()
            if "A" in source.getbands():
                mask = source.getchannel("A")
            else:
                mask = source.convert("L")
    except Exception as exc:
        raise ImageValidationError(f"无法读取遮罩：{path.name}") from exc
    if mask.size != size:
        mask = mask.resize(size, Image.Resampling.BILINEAR)
    return mask.point(lambda value: 0 if value < 20 else value)


def apply_target_color(
    image: Image.Image,
    mask: Image.Image,
    target_hex: str,
) -> tuple[Image.Image, int]:
    target_hex = normalize_color(target_hex)
    target_rgb = tuple(bytes.fromhex(target_hex[1:]))
    source = image.convert("RGB")
    hsv = source.convert("HSV")
    hue, saturation, value = hsv.split()
    target_hsv = Image.new("RGB", (1, 1), target_rgb).convert("HSV").getpixel((0, 0))
    histogram = value.histogram(mask=mask)
    median_value = _mask_histogram_median(histogram)
    target_value = target_hsv[2]
    target_saturation = target_hsv[1] / 255
    if target_saturation >= 0.12 and 0.08 <= target_hsv[2] <= 235:
        corrected_bands = []
        for source_band, target_channel in zip(source.split(), target_rgb):
            source_median = _mask_histogram_median(source_band.histogram(mask=mask))
            scale = target_channel / max(1, source_median)
            corrected_bands.append(
                source_band.point(
                    lambda channel, factor=scale: max(
                        0, min(255, round(channel * factor))
                    )
                )
            )
        corrected = Image.merge("RGB", corrected_bands)
    else:
        shift = target_value - median_value
        shifted = value.point(
            lambda channel: max(0, min(255, channel + shift))
        )
        shifted = Image.blend(
            shifted,
            Image.new("L", shifted.size, target_value),
            0.18,
        )
        adjusted_hsv = Image.merge(
            "HSV",
            (
                Image.new("L", source.size, target_hsv[0]),
                Image.new("L", source.size, target_hsv[1]),
                shifted,
            ),
        )
        corrected = adjusted_hsv.convert("RGB")
    composite_mask = mask.point(lambda channel: int(channel * 0.96))
    return Image.composite(corrected, source, composite_mask), median_value


def measure_color_delta(
    image: Image.Image,
    mask: Image.Image,
) -> tuple[int, int, int]:
    interior = mask.filter(ImageFilter.MinFilter(5))
    source = image.convert("RGB")
    value = source.convert("HSV").getchannel("V")
    histogram = value.histogram(mask=interior)
    total = sum(histogram)
    if total == 0:
        interior = mask
    midtones = []
    pixel_source = (
        source.get_flattened_data()
        if hasattr(source, "get_flattened_data")
        else source.getdata()
    )
    mask_source = (
        interior.get_flattened_data()
        if hasattr(interior, "get_flattened_data")
        else interior.getdata()
    )
    samples = list(pixel_source)
    mask_values = list(mask_source)
    step = max(1, len(samples) // 18000)
    for index in range(0, len(samples), step):
        if mask_values[index] >= 96:
            red, green, blue = samples[index]
            midtones.append((red + green + blue) / 3)
    if not midtones:
        raise ImageValidationError("商品遮罩内没有可用于质检的像素")
    low = sorted(midtones)[int(len(midtones) * 0.15)]
    high = sorted(midtones)[int(len(midtones) * 0.9)]
    selected = []
    for index in range(0, len(samples), step):
        if mask_values[index] < 96:
            continue
        red, green, blue = samples[index]
        luminance = (red + green + blue) / 3
        if low <= luminance <= high:
            selected.append((red, green, blue))
    if not selected:
        selected = samples[:1000]
    reds = sorted(pixel[0] for pixel in selected)
    greens = sorted(pixel[1] for pixel in selected)
    blues = sorted(pixel[2] for pixel in selected)
    middle = len(selected) // 2
    return (reds[middle], greens[middle], blues[middle])


def color_status(delta_e: float, pass_limit: float, review_limit: float) -> str:
    if delta_e <= pass_limit:
        return "pass"
    if delta_e <= review_limit:
        return "review"
    return "retry"


def make_contact_sheet(
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
        y = row * tile_height + 14 + (image_height - 28 - tile_image.height) // 2
        canvas.paste(tile_image, (x, y))
        label = Image.new(
            "RGB",
            (tile_width, 38),
            tuple(bytes.fromhex(output["color"][1:])),
        )
        canvas.paste(label, (column * tile_width, row * tile_height + image_height))
        draw = ImageDraw.Draw(canvas)
        text_color = (
            (20, 24, 22)
            if sum(bytes.fromhex(output["color"][1:])) > 430
            else (248, 246, 241)
        )
        draw.text(
            (
                column * tile_width + 14,
                row * tile_height + image_height + 11,
            ),
            output["color"],
            fill=text_color,
        )
    destination.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(
        destination,
        "PNG",
        optimize=True,
        icc_profile=_SRGB_PROFILE,
    )
    return destination


def normalize_product_colors(values: Any) -> list[dict[str, str]]:
    if not isinstance(values, list):
        raise ImageValidationError("colors 必须是颜色数组")
    colors: list[dict[str, str]] = []
    seen: set[str] = set()
    for item in values:
        if isinstance(item, str):
            color = normalize_color(item)
            name = ""
        elif isinstance(item, dict):
            color = normalize_color(str(item.get("hex") or item.get("color") or ""))
            name = str(item.get("name") or "").strip()
        else:
            raise ImageValidationError("颜色项必须是字符串或对象")
        if color in seen:
            continue
        seen.add(color)
        colors.append({"hex": color, "name": name})
    if not colors:
        raise ImageValidationError("至少需要一个目标颜色")
    if len(colors) > 30:
        raise ImageValidationError("单次最多支持 30 个商品颜色")
    return colors


def product_asset_record(
    path: Path,
    *,
    color: str,
    source: str,
    delta_e: float,
    qa_status: str,
    coverage: float,
) -> dict[str, Any]:
    record = asset_record(path, source=source, color=color)
    record.update(
        {
            "delta_e": round(delta_e, 2),
            "qa_status": qa_status,
            "coverage": round(coverage, 4),
        }
    )
    return record


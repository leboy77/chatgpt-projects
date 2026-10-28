from __future__ import annotations

import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


WIDTH = 1200
HEIGHT = 1600
SCALE = 2

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "图案适配背景_暖砂图腾.png"


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def mix_color(start: tuple[int, int, int], end: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(round(lerp(a, b, t)) for a, b in zip(start, end))


def vertical_gradient(
    size: tuple[int, int],
    top: tuple[int, int, int],
    middle: tuple[int, int, int],
    bottom: tuple[int, int, int],
) -> Image.Image:
    width, height = size
    image = Image.new("RGB", size)
    pixels = image.load()
    for y in range(height):
        t = y / max(height - 1, 1)
        if t < 0.58:
            color = mix_color(top, middle, t / 0.58)
        else:
            color = mix_color(middle, bottom, (t - 0.58) / 0.42)
        for x in range(width):
            pixels[x, y] = color
    return image


def add_radial_glow(
    base: Image.Image,
    center: tuple[int, int],
    radius: tuple[int, int],
    color: tuple[int, int, int],
    opacity: float,
) -> None:
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    mask = Image.new("L", base.size, 0)
    mask_pixels = mask.load()
    cx, cy = center
    rx, ry = radius
    for y in range(base.height):
        dy = (y - cy) / ry
        for x in range(base.width):
            dx = (x - cx) / rx
            distance = math.sqrt(dx * dx + dy * dy)
            if distance < 1:
                value = (1 - distance) ** 2 * 255 * opacity
                mask_pixels[x, y] = round(value)
    layer.paste(color + (255,), (0, 0, base.width, base.height))
    base.paste(layer, (0, 0), mask)


def add_spiral(
    draw: ImageDraw.ImageDraw,
    center: tuple[int, int],
    radius: float,
    color: tuple[int, int, int, int],
    width: int,
    turns: float = 2.7,
    phase: float = 0,
) -> None:
    cx, cy = center
    points: list[tuple[float, float]] = []
    steps = 180
    for index in range(steps + 1):
        t = index / steps
        angle = phase + t * turns * math.tau
        current = radius * (0.08 + 0.92 * t)
        points.append((cx + math.cos(angle) * current, cy + math.sin(angle) * current))
    draw.line(points, fill=color, width=width, joint="curve")


def add_motifs(image: Image.Image) -> None:
    motif = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(motif)

    clay = (169, 93, 58, 30)
    umber = (102, 77, 55, 24)
    olive = (111, 101, 65, 23)
    ochre = (190, 132, 58, 22)

    # Large, broken sun rings in the upper-right corner.
    for radius, line_width, color in (
        (245, 7, umber),
        (200, 10, ochre),
        (148, 6, clay),
    ):
        box = (
            1040 - radius,
            265 - radius,
            1040 + radius,
            265 + radius,
        )
        draw.arc(box, 103, 260, fill=color, width=line_width)
        draw.arc(box, 286, 430, fill=color, width=line_width)
    add_spiral(draw, (1002, 290), 102, clay, 8)

    # A low-contrast earth/sun motif near the lower-left edge.
    sun_center = (164, 1340)
    draw.ellipse(
        (
            sun_center[0] - 68,
            sun_center[1] - 68,
            sun_center[0] + 68,
            sun_center[1] + 68,
        ),
        outline=ochre,
        width=8,
    )
    draw.ellipse(
        (
            sun_center[0] - 24,
            sun_center[1] - 24,
            sun_center[0] + 24,
            sun_center[1] + 24,
        ),
        fill=(190, 132, 58, 13),
        outline=clay,
        width=5,
    )
    for ray in range(16):
        angle = ray * math.tau / 16
        r1 = 88
        r2 = 126 if ray % 2 == 0 else 108
        draw.line(
            (
                sun_center[0] + math.cos(angle) * r1,
                sun_center[1] + math.sin(angle) * r1,
                sun_center[0] + math.cos(angle) * r2,
                sun_center[1] + math.sin(angle) * r2,
            ),
            fill=ochre if ray % 2 == 0 else clay,
            width=5,
        )

    # Narrow woven-band accents along the side edges.
    left_x = 58
    for offset, color in ((0, olive), (25, umber), (50, clay)):
        points = []
        for step in range(15):
            y = 470 + step * 45
            x = left_x + offset + (18 if step % 2 == 0 else -8)
            points.append((x, y))
        draw.line(points, fill=color, width=5, joint="curve")

    right_x = 1130
    for offset, color in ((0, umber), (24, clay), (48, olive)):
        points = []
        for step in range(12):
            y = 760 + step * 44
            x = right_x - offset + (14 if step % 2 == 0 else -10)
            points.append((x, y))
        draw.line(points, fill=color, width=4, joint="curve")

    # Sparse dots and small hand-painted marks keep the textile feeling alive.
    rng = random.Random(2088)
    for _ in range(92):
        on_left = rng.random() < 0.5
        x = rng.randint(30, 205) if on_left else rng.randint(995, 1170)
        y = rng.randint(120, 1480)
        radius = rng.randint(2, 8)
        color = rng.choice((clay, olive, ochre, umber))
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=color)

    # Broad, soft petal shapes echo the shirt without competing with it.
    for cx, cy, rx, ry, rotation in (
        (86, 190, 95, 38, -24),
        (1082, 545, 115, 46, 17),
        (92, 980, 102, 42, -8),
        (1072, 1240, 120, 48, 31),
        (223, 1510, 138, 50, -16),
    ):
        petal = Image.new("RGBA", image.size, (0, 0, 0, 0))
        petal_draw = ImageDraw.Draw(petal)
        petal_draw.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=clay)
        petal = petal.rotate(rotation, center=(cx, cy), resample=Image.Resampling.BICUBIC)
        motif = Image.alpha_composite(motif, petal)

    motif = motif.filter(ImageFilter.GaussianBlur(2.1))
    image.alpha_composite(motif)


def add_texture(image: Image.Image) -> None:
    noise = Image.effect_noise(image.size, 24).convert("L")
    noise = noise.filter(ImageFilter.GaussianBlur(0.35))
    grain = Image.new("RGBA", image.size, (104, 83, 63, 0))
    grain.putalpha(noise.point(lambda value: round(value * 0.055)))
    image.alpha_composite(grain)

    # Faint horizontal threads suggest handmade cloth without becoming a texture pattern.
    threads = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(threads)
    rng = random.Random(91)
    for _ in range(560):
        y = rng.randint(0, HEIGHT - 1)
        x1 = rng.randint(-120, WIDTH)
        x2 = x1 + rng.randint(140, 560)
        alpha = rng.randint(2, 7)
        draw.line((x1, y, x2, y), fill=(255, 250, 241, alpha), width=1)
    image.alpha_composite(threads)


def add_vignette(image: Image.Image) -> None:
    width, height = image.size
    vignette = Image.new("L", image.size, 0)
    pixels = vignette.load()
    cx, cy = width / 2, height / 2
    max_distance = math.sqrt(cx * cx + cy * cy)
    for y in range(height):
        for x in range(width):
            distance = math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / max_distance
            strength = max(0, (distance - 0.42) / 0.58)
            pixels[x, y] = round((strength**2) * 60)
    shade = Image.new("RGBA", image.size, (65, 47, 38, 255))
    image.paste(shade, (0, 0), vignette)


def main() -> None:
    large_size = (WIDTH * SCALE, HEIGHT * SCALE)

    background = vertical_gradient(
        large_size,
        top=(242, 233, 216),
        middle=(236, 225, 207),
        bottom=(216, 196, 168),
    ).convert("RGBA")

    add_radial_glow(
        background,
        center=(600 * SCALE, 660 * SCALE),
        radius=(620 * SCALE, 790 * SCALE),
        color=(255, 250, 239),
        opacity=0.68,
    )
    add_radial_glow(
        background,
        center=(940 * SCALE, 1530 * SCALE),
        radius=(480 * SCALE, 390 * SCALE),
        color=(170, 109, 73),
        opacity=0.17,
    )
    add_radial_glow(
        background,
        center=(110 * SCALE, 150 * SCALE),
        radius=(420 * SCALE, 330 * SCALE),
        color=(181, 147, 92),
        opacity=0.13,
    )

    motif_layer = background.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
    add_motifs(motif_layer)
    add_texture(motif_layer)
    add_vignette(motif_layer)

    # Pull the center back toward warm ivory so the main artwork keeps full priority.
    focus_fade = Image.new("RGBA", motif_layer.size, (0, 0, 0, 0))
    focus_mask = Image.new("L", motif_layer.size, 0)
    mask_pixels = focus_mask.load()
    for y in range(HEIGHT):
        norm_y = (y - 820) / 860
        for x in range(WIDTH):
            norm_x = (x - 600) / 610
            distance = math.sqrt(norm_x * norm_x + norm_y * norm_y)
            if distance < 1:
                mask_pixels[x, y] = round((1 - distance) ** 1.7 * 34)
    focus_fade.paste((250, 243, 230, 255), (0, 0, WIDTH, HEIGHT))
    motif_layer.alpha_composite(Image.composite(focus_fade, Image.new("RGBA", motif_layer.size), focus_mask))

    motif_layer.convert("RGB").save(OUTPUT, format="PNG", optimize=True)
    print(OUTPUT)


if __name__ == "__main__":
    main()

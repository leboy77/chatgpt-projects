from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

from visualforge.imaging import (
    normalize_colors,
    prepare_logo,
    recolor_image,
)


class ImagingTests(unittest.TestCase):
    def test_normalizes_and_deduplicates_colors(self):
        self.assertEqual(
            normalize_colors("#fff, d4684f; #D4684F"),
            ["#FFFFFF", "#D4684F"],
        )

    def test_recolor_preserves_alpha(self):
        image = Image.new("RGBA", (40, 20), (0, 0, 0, 0))
        ImageDraw.Draw(image).rectangle((8, 4, 31, 16), fill=(255, 0, 0, 255))
        result = recolor_image(image, "#2A4C3F")
        self.assertEqual(result.getpixel((0, 0))[3], 0)
        self.assertEqual(result.getpixel((20, 10)), (42, 76, 63, 255))

    def test_prepare_removes_flat_background(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "logo.png"
            image = Image.new("RGB", (120, 80), "white")
            draw = ImageDraw.Draw(image)
            draw.rectangle((30, 20, 90, 60), fill=(20, 30, 25))
            draw.ellipse((48, 30, 72, 50), fill="white")
            image.save(path)

            logo = prepare_logo(path, remove_background=True, trim=True)
            self.assertLessEqual(logo.getpixel((0, 0))[3], 1)
            middle = logo.getpixel((logo.width // 2, logo.height // 2))
            self.assertEqual(middle[3], 255)


if __name__ == "__main__":
    unittest.main()


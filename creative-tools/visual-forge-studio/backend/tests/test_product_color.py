from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

from visualforge.config import Settings
from visualforge.models import Job
from visualforge.pipelines import run_job
from visualforge.product_color import (
    apply_target_color,
    create_auto_product_mask,
    create_target_color_mask,
    delta_e_2000,
    measure_color_delta,
)
from visualforge.providers import MockImageProvider


def make_product(path: Path, color: tuple[int, int, int]) -> None:
    image = Image.new("RGB", (240, 320), (231, 226, 216))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((65, 48, 175, 86), radius=8, fill=(29, 26, 25))
    draw.polygon(
        [(72, 82), (168, 82), (150, 300), (94, 300)],
        fill=color,
    )
    draw.rectangle((116, 95, 125, 290), fill=(55, 51, 46))
    draw.rectangle((84, 82, 156, 94), fill=(85, 67, 46))
    image.save(path)


class ProductColorTests(unittest.TestCase):
    def test_auto_mask_and_color_correction(self):
        with tempfile.TemporaryDirectory() as temp:
            master_path = Path(temp) / "master.png"
            variant_path = Path(temp) / "variant.png"
            make_product(master_path, (28, 38, 65))
            make_product(variant_path, (132, 34, 48))
            with Image.open(master_path) as source:
                master = source.convert("RGB")
            with Image.open(variant_path) as source:
                variant = source.convert("RGB")

            mask, coverage = create_auto_product_mask(master, variant)
            self.assertGreater(coverage, 0.05)
            self.assertLess(coverage, 0.70)
            corrected, _ = apply_target_color(
                variant, mask, "#6B6F45"
            )
            measured = measure_color_delta(corrected, mask)
            delta = delta_e_2000(measured, (107, 111, 69))
            self.assertLess(delta, 5.0)
            target_mask, target_coverage = create_target_color_mask(
                variant, "#8C1A2D", region="whole"
            )
            self.assertGreater(target_coverage, 0.05)
            self.assertIsNotNone(target_mask.getbbox())

    def test_product_color_finalize_pipeline(self):
        with tempfile.TemporaryDirectory() as temp:
            settings = Settings(
                data_dir=Path(temp) / "data",
                export_dir=Path(temp) / "desktop",
            )
            settings.ensure_directories()
            job_id = "productcolors"
            inputs_dir = settings.job_dir(job_id) / "inputs"
            inputs_dir.mkdir(parents=True)
            master = inputs_dir / "master.png"
            variant = inputs_dir / "variant-01.png"
            make_product(master, (28, 38, 65))
            make_product(variant, (132, 34, 48))
            job = Job(
                id=job_id,
                kind="product_color_finalize",
                status="running",
                options={
                    "colors": [{"hex": "#6B6F45", "name": "橄榄绿"}],
                    "pass_limit": 3,
                    "review_limit": 5,
                },
                input_assets=[str(master), str(variant)],
                attempts=1,
            )
            result = run_job(job, settings, MockImageProvider())
            self.assertGreaterEqual(len(result.assets), 2)
            self.assertEqual(result.manifest["metadata"]["qa"]["pass"], 1)
            corrected = next(
                asset
                for asset in result.assets
                if asset.get("qa_status") == "pass"
            )
            self.assertLess(corrected["delta_e"], 5.0)
            self.assertEqual(corrected["color"], "#6B6F45")
            manifest = json.loads(
                Path(result.manifest["path"]).read_text(encoding="utf-8")
            )
            self.assertEqual(manifest["metadata"]["mode"], "muse_product_color_finalize")
            output_dir = settings.job_dir(job_id) / "outputs"
            self.assertTrue((output_dir / "01-6B6F45-mask.png").exists())
            self.assertTrue((output_dir / "01-6B6F45-muse-raw.png").exists())
            with Image.open(output_dir / "01-6B6F45.png") as corrected_image:
                self.assertIn("icc_profile", corrected_image.info)


if __name__ == "__main__":
    unittest.main()


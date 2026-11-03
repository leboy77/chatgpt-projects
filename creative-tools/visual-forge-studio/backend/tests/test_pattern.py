from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

from visualforge.config import Settings
from visualforge.models import Job
from visualforge.pipelines import run_job
from visualforge.providers import MockImageProvider


def make_pattern_image(path: Path, accent: tuple[int, int, int]) -> None:
    image = Image.new("RGB", (320, 420), (240, 238, 232))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((55, 35, 265, 385), radius=40, fill=accent)
    draw.line((70, 170, 250, 170), fill=(245, 245, 240), width=6)
    image.save(path)


class PatternPipelineTests(unittest.TestCase):
    def test_pattern_batch_writes_one_output_per_reference(self):
        with tempfile.TemporaryDirectory() as temp:
            settings = Settings(
                data_dir=Path(temp) / "data",
                export_dir=Path(temp) / "desktop",
            )
            settings.ensure_directories()
            job_id = "patternbatch"
            inputs = settings.job_dir(job_id) / "inputs"
            inputs.mkdir(parents=True)
            base = inputs / "__base__-white.png"
            one = inputs / "pattern-01-camo.webp"
            two = inputs / "pattern-02-winter.webp"
            make_pattern_image(base, (248, 247, 242))
            make_pattern_image(one, (67, 83, 90))
            make_pattern_image(two, (115, 76, 63))
            job = Job(
                id=job_id,
                kind="pattern_batch_finalize",
                status="running",
                options={
                    "references": [
                        {"name": "camo.png"},
                        {"name": "winter.png"},
                    ],
                    "background_mode": "match",
                    "batch_limit_mb": 24,
                },
                input_assets=[str(base), str(one), str(two)],
                attempts=1,
            )
            result = run_job(job, settings, MockImageProvider())
            self.assertEqual(result.manifest["metadata"]["output_count"], 2)
            self.assertEqual(len(result.assets), 3)
            self.assertEqual(
                result.manifest["metadata"]["background_mode"], "match"
            )
            for asset in result.assets:
                self.assertTrue(Path(asset["path"]).exists())


if __name__ == "__main__":
    unittest.main()


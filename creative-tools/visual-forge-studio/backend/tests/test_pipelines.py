from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

from visualforge.config import Settings
from visualforge.models import Job
from visualforge.pipelines import (
    build_prompt_variants,
    run_job,
)
from visualforge.providers import MockImageProvider


def make_logo(path: Path, color: tuple[int, int, int] = (10, 20, 30)) -> None:
    image = Image.new("RGBA", (120, 80), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.ellipse((18, 10, 102, 70), fill=(*color, 255))
    image.save(path)


class PipelineTests(unittest.TestCase):
    def settings(self, temp: str) -> Settings:
        settings = Settings(
            data_dir=Path(temp) / "data",
            export_dir=Path(temp) / "desktop",
        )
        settings.ensure_directories()
        return settings

    def test_one_logo_many_colors_writes_manifest(self):
        with tempfile.TemporaryDirectory() as temp:
            settings = self.settings(temp)
            job_dir = settings.job_dir("testone")
            inputs = job_dir / "inputs"
            inputs.mkdir(parents=True)
            source = inputs / "mark.png"
            make_logo(source)
            job = Job(
                id="testone",
                kind="logo_recolor",
                status="running",
                options={
                    "colors": ["#112233", "#ABCDEF"],
                    "remove_background": False,
                    "trim": True,
                },
                input_assets=[str(source)],
                attempts=1,
            )
            result = run_job(job, settings, MockImageProvider())
            self.assertEqual(len(result.assets), 2)
            self.assertTrue(Path(result.manifest["path"]).exists())
            manifest = json.loads(Path(result.manifest["path"]).read_text("utf-8"))
            self.assertEqual(manifest["metadata"]["mode"], "one_logo_many_colors")

    def test_many_logos_one_color(self):
        with tempfile.TemporaryDirectory() as temp:
            settings = self.settings(temp)
            job_dir = settings.job_dir("testmany")
            inputs = job_dir / "inputs"
            inputs.mkdir(parents=True)
            sources = [inputs / "mark-a.png", inputs / "mark-b.png"]
            for source in sources:
                make_logo(source)
            job = Job(
                id="testmany",
                kind="logo_color_batch",
                status="running",
                options={"color": "#D4684F", "remove_background": False},
                input_assets=[str(item) for item in sources],
                attempts=1,
            )
            result = run_job(job, settings, MockImageProvider())
            self.assertEqual(len(result.assets), 2)
            self.assertEqual(result.manifest["metadata"]["color"], "#D4684F")

    def test_product_fission_uses_distinct_directions(self):
        variants = build_prompt_variants("A minimal ceramic cup", 4)
        self.assertEqual(len(variants), 4)
        self.assertEqual(len({item["direction"] for item in variants}), 4)
        self.assertTrue(all("ceramic cup" in item["prompt"] for item in variants))

    def test_product_generation_creates_assets(self):
        with tempfile.TemporaryDirectory() as temp:
            settings = self.settings(temp)
            job = Job(
                id="testproduct",
                kind="product_generate",
                status="running",
                options={
                    "prompt": "A minimal ceramic cup",
                    "count": 2,
                    "size": "512x512",
                    "quality": "high",
                },
                input_assets=[],
                attempts=1,
            )
            result = run_job(job, settings, MockImageProvider())
            self.assertEqual(len(result.assets), 2)
            self.assertTrue(all(asset["width"] == 512 for asset in result.assets))


if __name__ == "__main__":
    unittest.main()


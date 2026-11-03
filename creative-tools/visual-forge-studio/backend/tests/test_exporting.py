from __future__ import annotations

import re
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from visualforge.config import Settings
from visualforge.exporting import create_export_group, export_job_to_desktop
from visualforge.models import Job


class ExportTests(unittest.TestCase):
    def test_export_uses_module_sku_date_and_duplicate_suffix(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            settings = Settings(data_dir=root / "data", export_dir=root / "desktop")
            settings.ensure_directories()
            job = Job(
                id="abcdef123456",
                kind="product_color_finalize",
                status="running",
                options={"sku": "SKU-001", "colors": [{"hex": "#8C1A2D"}]},
                input_assets=[],
                attempts=1,
            )
            output_dir = settings.job_dir(job.id) / "outputs"
            output_dir.mkdir(parents=True)
            Image.new("RGB", (24, 24), (140, 26, 45)).save(
                output_dir / "01-8C1A2D.png"
            )
            manifest = output_dir / "manifest.json"
            manifest.write_text("{}", encoding="utf-8")
            manifest.with_suffix(".csv").write_text("name\n", encoding="utf-8")

            first = export_job_to_desktop(settings, job, str(manifest))
            second = export_job_to_desktop(settings, job, str(manifest))

            self.assertRegex(
                first.name,
                r"^商品配色_SKU-001_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$",
            )
            self.assertTrue(second.name.endswith("_2"))
            images = list(first.glob("*.png"))
            self.assertEqual(len(images), 1)
            self.assertTrue(images[0].name.startswith(first.name + "_01_"))

    def test_pattern_export_separates_generated_images_and_summary(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            settings = Settings(data_dir=root / "data", export_dir=root / "desktop")
            settings.ensure_directories()
            job = Job(
                id="pattern123",
                kind="pattern_batch_finalize",
                status="running",
                options={
                    "sku": "W1001",
                    "references": [{"name": "camo.png"}],
                },
                input_assets=[],
                attempts=1,
            )
            output_dir = settings.job_dir(job.id) / "outputs"
            output_dir.mkdir(parents=True)
            Image.new("RGB", (24, 24), (80, 90, 70)).save(
                output_dir / "01-01-camo.png"
            )
            Image.new("RGB", (48, 24), (220, 215, 205)).save(
                output_dir / "pattern-contact-sheet.png"
            )
            manifest = output_dir / "manifest.json"
            manifest.write_text("{}", encoding="utf-8")
            manifest.with_suffix(".csv").write_text("name\n", encoding="utf-8")

            exported = export_job_to_desktop(settings, job, str(manifest))
            generated = exported / "生成图"
            summary = exported / "拼图与清单"

            self.assertEqual(len(list(generated.iterdir())), 1)
            self.assertTrue(any(path.name.endswith("pattern-contact-sheet.png") for path in summary.iterdir()))
            self.assertTrue((summary / "manifest.json").exists())
            self.assertTrue((summary / "manifest.csv").exists())
            self.assertTrue((summary / "README.txt").exists())

    def test_multiple_batches_share_one_export_group(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            settings = Settings(data_dir=root / "data", export_dir=root / "desktop")
            settings.ensure_directories()
            group = create_export_group(
                settings,
                "pattern_batch_finalize",
                "W1001",
                "2026-11-02T16:05:54+08:00",
            )
            for batch_index in (1, 2):
                job = Job(
                    id=f"patternbatch{batch_index}",
                    kind="pattern_batch_finalize",
                    status="running",
                    options={
                        "sku": "W1001",
                        "references": [{"name": f"ref-{batch_index}.png"}],
                        "batch_index": batch_index,
                        "export_group_path": str(group),
                    },
                    input_assets=[],
                    attempts=1,
                )
                output_dir = settings.job_dir(job.id) / "outputs"
                output_dir.mkdir(parents=True)
                Image.new("RGB", (24, 24), (70, 80, 60)).save(
                    output_dir / f"0{batch_index}-result.png"
                )
                Image.new("RGB", (48, 24), (225, 220, 210)).save(
                    output_dir / "pattern-contact-sheet.png"
                )
                manifest = output_dir / "manifest.json"
                manifest.write_text("{}", encoding="utf-8")
                manifest.with_suffix(".csv").write_text("name\n", encoding="utf-8")
                exported = export_job_to_desktop(settings, job, str(manifest))
                self.assertEqual(exported, group)

            generated = list((group / "生成图").iterdir())
            summary = list((group / "拼图与清单").iterdir())
            self.assertEqual(len(generated), 2)
            self.assertTrue(any(name.name.startswith("批次01_") for name in generated))
            self.assertTrue(any(name.name.startswith("批次02_") for name in generated))
            self.assertTrue(any("批次01_manifest.json" == name.name for name in summary))
            self.assertTrue(any("批次02_manifest.json" == name.name for name in summary))
            self.assertEqual(len([p for p in group.iterdir() if p.is_dir()]), 2)

    def test_export_group_accepts_browser_utc_timestamp(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            settings = Settings(data_dir=root / "data", export_dir=root / "desktop")
            settings.ensure_directories()
            group = create_export_group(
                settings,
                "pattern_batch_finalize",
                "",
                "2026-11-02T08:05:54.123Z",
            )
            self.assertRegex(
                group.name,
                r"^印花套图_2026-11-02_16-05-54$",
            )
            self.assertTrue((group / "生成图").is_dir())
            self.assertTrue((group / "拼图与清单").is_dir())


if __name__ == "__main__":
    unittest.main()


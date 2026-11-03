from __future__ import annotations

import io
import json
import tempfile
import time
import unittest
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw

from visualforge.config import Settings
from visualforge.server import run_in_thread


def logo_bytes() -> bytes:
    image = Image.new("RGBA", (96, 64), (0, 0, 0, 0))
    ImageDraw.Draw(image).rounded_rectangle(
        (10, 8, 86, 56), radius=8, fill=(20, 30, 25, 255)
    )
    output = io.BytesIO()
    image.save(output, "PNG")
    return output.getvalue()


def product_bytes(color: tuple[int, int, int]) -> bytes:
    image = Image.new("RGB", (240, 320), (231, 226, 216))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((65, 48, 175, 86), radius=8, fill=(29, 26, 25))
    draw.polygon(
        [(72, 82), (168, 82), (150, 300), (94, 300)],
        fill=color,
    )
    draw.rectangle((116, 95, 125, 290), fill=(55, 51, 46))
    output = io.BytesIO()
    image.save(output, "PNG")
    return output.getvalue()


def multipart(
    fields: dict[str, str], files: list[tuple[str, bytes]] | None = None
):
    boundary = "----VisualForgeTestBoundary"
    chunks: list[bytes] = []
    for name, value in fields.items():
        chunks.append(
            (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'
                f"{value}\r\n"
            ).encode("utf-8")
        )
    for filename, content in files or []:
        chunks.append(
            (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="files"; '
                f'filename="{filename}"\r\n'
                "Content-Type: image/png\r\n\r\n"
            ).encode("utf-8")
            + content
            + b"\r\n"
        )
    chunks.append(f"--{boundary}--\r\n".encode("ascii"))
    return (
        b"".join(chunks),
        f"multipart/form-data; boundary={boundary}",
    )


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        settings = Settings(
            data_dir=Path(self.temp.name) / "data",
            worker_count=1,
            export_dir=Path(self.temp.name) / "desktop",
        )
        self.server, self.thread = run_in_thread(settings)
        host, port = self.server.server_address[:2]
        self.base = f"http://{host}:{port}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=3)
        self.temp.cleanup()

    def request_json(self, path: str, payload=None) -> dict:
        request = urllib.request.Request(
            self.base + path,
            data=payload[0] if payload else None,
            headers={"Content-Type": payload[1]} if payload else {},
            method="POST" if payload else "GET",
        )
        with urllib.request.urlopen(request, timeout=5) as response:
            return json.loads(response.read())

    def wait_for(self, job_id: str, timeout: float = 8):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            payload = self.request_json(f"/api/jobs/{job_id}")
            if payload["status"] in {"succeeded", "failed"}:
                return payload
            time.sleep(0.1)
        self.fail(f"job {job_id} did not finish")

    def test_logo_job_and_archive_download(self):
        payload = multipart(
            {
                "kind": "logo_recolor",
                "options": '{"colors":["#111111","#D4684F"],"trim":true}',
            },
            [("logo.png", logo_bytes())],
        )
        created = self.request_json("/api/jobs", payload)
        job = self.wait_for(created["id"])
        self.assertEqual(job["status"], "succeeded", job)
        self.assertEqual(len(job["outputs"]), 2)
        self.assertTrue(job["export_path"], job)
        self.assertTrue(Path(job["export_path"]).is_dir())
        with urllib.request.urlopen(self.base + job["outputs"][0]["url"]) as response:
            self.assertEqual(response.status, 200)
        with urllib.request.urlopen(self.base + job["download_url"]) as response:
            self.assertEqual(response.status, 200)
            self.assertGreater(len(response.read()), 100)

    def test_mock_product_generation(self):
        payload = multipart(
            {
                "kind": "product_generate",
                "options": (
                    '{"prompt":"minimal ceramic cup","count":2,'
                    '"size":"512x512","quality":"high"}'
                ),
            }
        )
        created = self.request_json("/api/jobs", payload)
        job = self.wait_for(created["id"])
        self.assertEqual(job["status"], "succeeded", job)
        self.assertEqual(len(job["outputs"]), 2)

    def test_extension_preflight_is_allowed(self):
        request = urllib.request.Request(
            self.base + "/api/jobs",
            method="OPTIONS",
            headers={
                "Origin": "chrome-extension://test-extension",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
                "Access-Control-Request-Private-Network": "true",
            },
        )
        with urllib.request.urlopen(request, timeout=5) as response:
            self.assertEqual(response.status, 204)
            self.assertEqual(
                response.headers["Access-Control-Allow-Origin"],
                "chrome-extension://test-extension",
            )
            self.assertEqual(
                response.headers["Access-Control-Allow-Private-Network"], "true"
            )

    def test_muse_product_color_finalize_job(self):
        payload = multipart(
            {
                "kind": "product_color_finalize",
                "options": (
                    '{"colors":[{"hex":"#6B6F45","name":"橄榄绿"}],'
                    '"pass_limit":3,"review_limit":5}'
                ),
            },
            [
                ("master.png", product_bytes((28, 38, 65))),
                ("variant-01-6B6F45.png", product_bytes((132, 34, 48))),
            ],
        )
        created = self.request_json("/api/jobs", payload)
        job = self.wait_for(created["id"])
        self.assertEqual(job["status"], "succeeded", job)
        self.assertGreaterEqual(len(job["outputs"]), 3)
        self.assertIn("通过", job["message"])
        variant_types = {item.get("variant_type") for item in job["outputs"]}
        self.assertEqual(
            variant_types, {"muse_raw", "corrected", "contact_sheet"}
        )


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import base64
import hashlib
import io
import json
import textwrap
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Protocol

from PIL import Image, ImageDraw, ImageFont

from .config import Settings
from .imaging import ImageValidationError


class ProviderError(RuntimeError):
    pass


class ImageProvider(Protocol):
    name: str

    def generate(self, prompt: str, size: str, quality: str) -> bytes:
        ...


def parse_size(size: str) -> tuple[int, int]:
    parts = str(size).lower().split("x")
    if len(parts) != 2:
        raise ImageValidationError("图片尺寸格式应为 1024x1024")
    try:
        width, height = (int(part) for part in parts)
    except ValueError as exc:
        raise ImageValidationError("图片尺寸格式应为 1024x1024") from exc
    if not 256 <= width <= 4096 or not 256 <= height <= 4096:
        raise ImageValidationError("图片宽高需在 256 到 4096 之间")
    return width, height


@dataclass
class MockImageProvider:
    """Local development provider that produces deterministic visual placeholders."""

    name: str = "mock"

    def generate(self, prompt: str, size: str, quality: str) -> bytes:
        width, height = parse_size(size)
        seed = int(hashlib.sha256(prompt.encode("utf-8")).hexdigest()[:8], 16)
        palette = [
            ((242, 238, 229), (43, 54, 50), (218, 112, 84)),
            ((229, 238, 242), (31, 57, 72), (222, 178, 87)),
            ((244, 232, 228), (77, 45, 54), (119, 156, 137)),
            ((232, 239, 226), (49, 66, 43), (194, 158, 106)),
        ][seed % 4]
        image = Image.new("RGB", (width, height), palette[0])
        draw = ImageDraw.Draw(image)
        for index in range(9):
            x = (seed >> (index * 3)) % width
            y = (seed >> (index * 2 + 4)) % height
            radius = width // (14 + index % 5)
            color = palette[1] if index % 2 else palette[2]
            draw.ellipse(
                (x - radius, y - radius, x + radius, y + radius),
                outline=color,
                width=max(2, width // 220),
            )
        pad = width // 14
        draw.rounded_rectangle(
            (pad, pad, width - pad, height - pad),
            radius=width // 30,
            outline=palette[1],
            width=max(2, width // 350),
        )
        draw.rectangle(
            (
                width * 0.23,
                height * 0.27,
                width * 0.77,
                height * 0.73,
            ),
            fill=palette[1],
        )
        draw.ellipse(
            (
                width * 0.40,
                height * 0.25,
                width * 0.60,
                height * 0.43,
            ),
            fill=palette[2],
        )
        font = ImageFont.load_default(size=max(12, width // 55))
        title = "VISUAL FORGE / DEMO"
        snippet = "\n".join(textwrap.wrap(prompt, width=54)[:3])
        draw.text(
            (pad * 1.5, height - pad * 2.6),
            title,
            fill=palette[0],
            font=font,
        )
        draw.text(
            (pad * 1.5, height - pad * 1.65),
            snippet,
            fill=palette[0],
            font=font,
            spacing=5,
        )
        output = io.BytesIO()
        image.save(output, "PNG", optimize=True)
        return output.getvalue()


@dataclass
class OpenAICompatibleProvider:
    settings: Settings
    name: str = "openai"

    def generate(self, prompt: str, size: str, quality: str) -> bytes:
        parse_size(size)
        if not self.settings.api_key:
            raise ProviderError("IMAGE_API_KEY 未配置")
        endpoint = f"{self.settings.api_base_url}/images/generations"
        payload = {
            "model": self.settings.image_model,
            "prompt": prompt,
            "n": 1,
            "size": size,
            "quality": quality,
        }
        request = urllib.request.Request(
            endpoint,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.settings.api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(
                request, timeout=self.settings.request_timeout
            ) as response:
                body = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:800]
            raise ProviderError(f"图片接口返回 HTTP {exc.code}：{detail}") from exc
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise ProviderError(f"图片接口请求失败：{exc}") from exc

        try:
            item = body["data"][0]
        except (KeyError, IndexError, TypeError) as exc:
            raise ProviderError(f"图片接口响应格式异常：{str(body)[:500]}") from exc
        if item.get("b64_json"):
            try:
                return base64.b64decode(item["b64_json"])
            except ValueError as exc:
                raise ProviderError("图片接口返回了无效的 base64 数据") from exc
        if item.get("url"):
            return self._download(item["url"])
        raise ProviderError("图片接口响应中没有 b64_json 或 url")

    @staticmethod
    def _download(url: str) -> bytes:
        try:
            with urllib.request.urlopen(url, timeout=180) as response:
                return response.read()
        except urllib.error.URLError as exc:
            raise ProviderError(f"生成图片下载失败：{exc}") from exc


def build_provider(settings: Settings) -> ImageProvider:
    if settings.provider == "mock":
        return MockImageProvider()
    if settings.provider in {"openai", "compatible", "openai-compatible"}:
        return OpenAICompatibleProvider(settings)
    raise ProviderError(
        f"不支持的 IMAGE_PROVIDER={settings.provider!r}，可选 mock/openai"
    )


from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .config import Settings
from .imaging import normalize_color, normalize_colors
from .pipelines import (
    generate_product_variants,
    recolor_many_logos_to_one,
    recolor_one_logo_to_many,
)
from .providers import build_provider


def _print_progress(value: int, message: str) -> None:
    print(f"[{value:3d}%] {message}", flush=True)


def _manifest(output_dir: Path, kind: str, metadata, outputs) -> None:
    payload = {
        "kind": kind,
        "metadata": metadata,
        "outputs": outputs,
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "manifest.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def command_serve(args: argparse.Namespace) -> int:
    import os

    from .server import serve_forever

    os.environ["VISUALFORGE_HOST"] = args.host
    os.environ["VISUALFORGE_PORT"] = str(args.port)
    serve_forever(Settings.from_env())
    return 0


def command_logo_colors(args: argparse.Namespace) -> int:
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    colors = normalize_colors(args.colors)
    outputs, metadata = recolor_one_logo_to_many(
        Path(args.input).resolve(),
        output,
        colors,
        {
            "remove_background": args.background,
            "trim": not args.no_trim,
        },
        _print_progress,
    )
    _manifest(output, "logo_recolor", metadata, outputs)
    print(f"完成：{len(outputs)} 张，输出目录 {output}")
    return 0


def command_logo_color(args: argparse.Namespace) -> int:
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    color = normalize_color(args.color)
    inputs = [Path(item).resolve() for item in args.inputs]
    outputs, metadata = recolor_many_logos_to_one(
        inputs,
        output,
        color,
        {
            "remove_background": args.background,
            "trim": not args.no_trim,
        },
        _print_progress,
    )
    _manifest(output, "logo_color_batch", metadata, outputs)
    print(f"完成：{len(outputs)} 张，输出目录 {output}")
    return 0


def command_generate(args: argparse.Namespace) -> int:
    settings = Settings.from_env()
    provider = build_provider(settings)
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    outputs, metadata = generate_product_variants(
        output,
        {
            "prompt": args.prompt,
            "count": args.count,
            "size": args.size,
            "quality": args.quality,
        },
        provider,
        _print_progress,
    )
    _manifest(output, "product_generate", metadata, outputs)
    print(f"完成：{len(outputs)} 张，输出目录 {output}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    settings = Settings.from_env()
    parser = argparse.ArgumentParser(
        prog="visualforge", description="视觉批量生产自动化工具"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    serve = subparsers.add_parser("serve", help="启动网页和 API 服务")
    serve.add_argument("--host", default=settings.host)
    serve.add_argument("--port", type=int, default=settings.port)
    serve.set_defaults(handler=command_serve)

    colors = subparsers.add_parser("logo-colors", help="单 Logo 生成多色版本")
    colors.add_argument("--input", required=True)
    colors.add_argument("--colors", required=True, help="如 #111111,#FFFFFF")
    colors.add_argument("--output", default="./output/logo-colors")
    colors.add_argument(
        "--background",
        choices=["auto", "true", "false"],
        default="auto",
        help="auto 自动识别；true 强制抠边；false 不处理背景",
    )
    colors.add_argument("--no-trim", action="store_true")
    colors.set_defaults(handler=command_logo_colors)

    batch = subparsers.add_parser("logo-color", help="多 Logo 生成同一颜色")
    batch.add_argument("inputs", nargs="+")
    batch.add_argument("--color", required=True)
    batch.add_argument("--output", default="./output/logo-batch")
    batch.add_argument(
        "--background",
        choices=["auto", "true", "false"],
        default="auto",
    )
    batch.add_argument("--no-trim", action="store_true")
    batch.set_defaults(handler=command_logo_color)

    generate = subparsers.add_parser("generate", help="单款文生图与场景裂变")
    generate.add_argument("--prompt", required=True)
    generate.add_argument("--count", type=int, default=4)
    generate.add_argument(
        "--size", choices=["1024x1024", "1536x1024", "1024x1536"], default="1024x1024"
    )
    generate.add_argument("--quality", choices=["low", "medium", "high"], default="high")
    generate.add_argument("--output", default="./output/product-variants")
    generate.set_defaults(handler=command_generate)
    return parser


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return int(args.handler(args))
    except KeyboardInterrupt:
        return 130
    except Exception as exc:
        print(f"错误：{exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())


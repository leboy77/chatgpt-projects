# ChatGPT Projects

A collection of practical projects for cross-border e-commerce, browser
automation, visual production, and AI workflow tooling.

English | [中文](README.md)

## Overview

This repository contains eight runnable projects and one chat-history migration
utility. Together they cover Temu operations, page analysis, browser extensions,
POD visual production, local scripting, and Codex session export.

The collection follows three principles:

- **Runnable**: source, templates, tests, and operating instructions are included.
- **Portable**: dependencies, environment variables, startup steps, exclusions,
  and migration risks are documented.
- **Human-reviewed**: platform actions, pricing, compliance, image rights, and
  model output must be checked by an operator.

Companion Temu SOP and market-research repository:
[temu-sop-agent-toolkit](https://github.com/leboy77/temu-sop-agent-toolkit)

Last updated: 2026-11-18

## Quick Links

- [Usage and launch guide](USAGE.md)
- [Project migration checklist](项目迁移包清单.md)
- [Codex history export](chat-tools/codex-history-export/)

The detailed operation guides are currently written in Chinese. Project source,
manifests, and most technical documentation are available directly in each
project directory.

## Projects

### Temu Operations

| Project | Description |
| --- | --- |
| [Global Price Declaration Checker](temu-operations/price-checker/) | Imports SKCs and country prices, compares platform and declared prices, and supports preview, batching, pause, and retry. |
| [Downlist Assistant Suite](temu-operations/downlist-assistant/) | Delisting, image archiving, ad-spend monitoring, spreadsheet helpers, and a legacy native assistant. |
| [Auto Recolor Assistant](temu-operations/auto-recolor/) | Adds color variants for SKC/SPU items, fills images and attributes, submits changes, and includes a task queue and diagnostics. |

### Analysis and Browser Tools

| Project | Description |
| --- | --- |
| [Temu Product Image Collector](reverse-engineering/temu-image-collector/) | Collects product and carousel images, exports titles, filters recommendation and ad cards, and builds ZIP archives. |
| [Batch Traffic Accelerator Demo](browser-tools/batch-traffic-accelerator/) | Filters products by traffic, conversion, price, and margin, previews price reductions, and simulates batch execution. |
| [Chrome CDP Probe](browser-tools/chrome-cdp-probe/) | A minimal Chrome DevTools Protocol client using only the Python standard library. |

### Creative and Visual Production

| Project | Description |
| --- | --- |
| [Visual Forge Studio](creative-tools/visual-forge-studio/) | POD visual-production backend and Muse extension for logo recoloring, product colors, generation, quality checks, and archiving. |
| [Warm Sand Background Generator](creative-tools/background-generator/) | Generates reproducible product backgrounds with Python and Pillow. |

### AI Workflows and Migration

| Project | Description |
| --- | --- |
| [Codex History Export](chat-tools/codex-history-export/) | Exports local Codex sessions as readable Markdown, raw JSONL, attachments, an index, and SHA-256 manifests. |

## Recommended Workflow

1. Read the project README and known limitations.
2. Validate with demo, preview, or observation mode.
3. Test a small sample against the real page and data.
4. Run production batches only after review, preserving failure records and
   manual verification results.

## Safety and Scope

- Real account cookies, API keys, browser profiles, and runtime databases are
  not stored in this repository.
- Original internal documents, customer data, and unredacted chat logs are not
  included.
- Temu-related tools must follow platform rules and must not bypass CAPTCHAs,
  risk controls, or access restrictions.
- Recoloring, delisting, traffic, and advertising actions should be tested on a
  small sample before scaling.
- Users are responsible for image, trademark, and design licensing.

## Repository Layout

```text
temu-operations/       Temu pricing, delisting, ad monitoring, and recoloring
reverse-engineering/   Temu page and image collection research
browser-tools/         Browser extensions and DevTools Protocol tools
creative-tools/        Visual Forge, Muse extension, and image scripts
chat-tools/            Codex chat-history migration
archive/               Empty-directory and archive notes
USAGE.md               Launch instructions for all projects
项目迁移包清单.md        Cross-machine migration checklist
```

The repository is intended for internal business tooling, workflow validation,
and engineering reference. Confirm account permissions, platform rules, data
boundaries, and content licensing before use.

# ChatGPT Projects · Cross-Border Automation Lab

**Turn repetitive Temu operations, browser research, and product visual
production into inspectable, reusable, and portable tools.**

English · [快速开始](#three-minute-tour) · [Projects](#projects) · [Migration guide](项目迁移包清单.md)

This is not a prompt collection.

It is a set of practical projects with source code, browser extensions, tests,
launch instructions, and migration notes. You can load the extensions directly,
run the local web apps, process product data, or borrow the architecture for
your own operations platform.

Last updated: 2026-11-19

<p align="center">
  <img src="browser-tools/batch-traffic-accelerator/demo-check.png" alt="Specified specification traffic accelerator preflight" width="360">
  <img src="browser-tools/batch-traffic-accelerator/demo-queue.png" alt="Persistent task queue" width="360">
</p>

<p align="center">
  <sub>Specified-Spec Traffic Accelerator v0.6.17: product checks, station-price validation, and a persistent task queue.</sub>
</p>

## Three-Minute Tour

### 1. Load a current browser extension

Open `chrome://extensions`, enable Developer Mode, and choose “Load unpacked”:

```text
browser-tools\batch-traffic-accelerator
```

Open the Temu product list and use the side panel to scan products, configure
station prices, validate a batch, and run the persistent task queue.

### 2. Start the Visual Forge local studio

```powershell
cd creative-tools\visual-forge-studio\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m visualforge serve
```

Then open:

```text
http://127.0.0.1:8765/
```

The default mode uses a local mock provider and consumes no external image-model
credits.

### 3. Find the right entry point

- [Chinese usage guide](USAGE.md)
- [Project migration checklist](项目迁移包清单.md)
- [Codex history export](chat-tools/codex-history-export/)

## Who It Is For

- Teams operating Temu stores in the United States or Europe.
- Operators turning pricing, delisting, recoloring, and image workflows into tools.
- Developers researching browser automation, DOM behavior, CDP, and e-commerce systems.
- Builders interested in how AI conversations become runnable software.

## Projects

### Temu Operations

| Project | What it solves |
| --- | --- |
| [Global Price Declaration Checker](temu-operations/price-checker/) | Imports SKCs and country prices with RMB/USD exchange rates, query validation, preview, batching, and retry. |
| [Downlist Assistant Suite](temu-operations/downlist-assistant/) | Delisting, image archiving, ad-spend monitoring, spreadsheet workflows, and a legacy native assistant. |
| [Auto Recolor Assistant](temu-operations/auto-recolor/) | Adds color variants, fills product and back images, sets SKU attributes, submits jobs, and tracks state in `0.10.15`. |

### Collection, Analysis, and Browser Tools

| Project | What it solves |
| --- | --- |
| [Temu Product Image Collector](reverse-engineering/temu-image-collector/) | Four collection modes with auto-paging, preview filtering, duplicate detection, and image-link export. |
| [Specified-Spec Traffic Accelerator](browser-tools/batch-traffic-accelerator/) | Caches SPU/SKC records, imports station prices, validates eligibility, and submits real jobs through a persistent queue. |
| [Chrome CDP Probe](browser-tools/chrome-cdp-probe/) | Connects to the Chrome DevTools Protocol using only the Python standard library. |

### Visual and Creative Production

| Project | What it solves |
| --- | --- |
| [Visual Forge Studio](creative-tools/visual-forge-studio/) | POD backend, Muse `0.13.1` extension, and team dashboard for image/video jobs, recoloring, quality checks, and archiving. |
| [Warm Sand Background Generator](creative-tools/background-generator/) | Generates reproducible product backgrounds with Python and Pillow. |

### AI Workflows

| Project | What it solves |
| --- | --- |
| [Codex History Export](chat-tools/codex-history-export/) | Exports local Codex sessions as Markdown, JSONL, attachments, and SHA-256 manifests. |
| [Temu SOP and Market Research](https://github.com/leboy77/temu-sop-agent-toolkit) | Companion repository covering EU Y2 and US Y1 POD market research and SOPs. |

## Design Principles

> **Deterministic code handles calculations; models explain; humans approve
> high-impact actions.**

- Pricing, sales windows, concentration, and task states must remain traceable.
- Lifetime sales are never treated as confirmed 30-day sales.
- CAPTCHAs, platform risk controls, and access restrictions are not bypassed.
- Automation starts with preview and small-batch validation.
- Cookies, API keys, customer data, runtime databases, and unredacted chat logs
  are never committed.

## Repository Layout

```text
temu-operations/       Temu pricing, delisting, advertising, and recoloring
reverse-engineering/   Temu page and image collection research
browser-tools/         Browser extensions and DevTools Protocol tools
creative-tools/        Visual Forge, Muse extension, and image generation
chat-tools/            Codex chat-history migration
archive/               Empty-directory and archive notes
USAGE.md               Launch instructions for all projects
项目迁移包清单.md        Cross-machine migration checklist
```

## Scope

The repository is intended for internal business tooling, workflow validation,
and engineering reference. Confirm account permissions, platform rules, data
boundaries, and image or design licensing before production use.

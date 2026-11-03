(function attachLocalArchive(root) {
  "use strict";

  const DIRECTORY_KEY = "archiveDirectory";
  const MODULE_NAMES = {
    logo_recolor: "单Logo多色",
    logo_color_batch: "单色多Logo",
    product_generate: "产品裂变",
    product_color_finalize: "商品配色",
    pattern_batch_finalize: "印花套图",
  };

  function safeLabel(value, fallback = "visual") {
    const label = String(value || "")
      .replace(/[^\p{L}\p{N}#_-]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
    return label || fallback;
  }

  function safeFileName(value, fallback = "file") {
    const text = String(value || "");
    const dot = text.lastIndexOf(".");
    const hasSuffix = dot > 0 && text.length - dot <= 10;
    const stem = safeLabel(hasSuffix ? text.slice(0, dot) : text, fallback);
    return `${stem}${hasSuffix ? text.slice(dot).toLowerCase() : ""}`;
  }

  function timestampName(value) {
    const date = value ? new Date(value) : new Date();
    const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
    const pad = (number) => String(number).padStart(2, "0");
    return (
      `${safeDate.getFullYear()}-${pad(safeDate.getMonth() + 1)}-${pad(safeDate.getDate())}_` +
      `${pad(safeDate.getHours())}-${pad(safeDate.getMinutes())}-${pad(safeDate.getSeconds())}`
    );
  }

  function buildStem(kind, options = {}, createdAt = null) {
    const parts = [MODULE_NAMES[kind] || "视觉生成"];
    if (options.sku) parts.push(safeLabel(options.sku, ""));
    parts.push(timestampName(createdAt));
    return parts.filter(Boolean).join("_");
  }

  async function getHandle() {
    return root.VisualForgeStore.getSetting(DIRECTORY_KEY, null);
  }

  async function directoryPermission(handle) {
    if (!handle) return "missing";
    return handle.queryPermission({ mode: "readwrite" });
  }

  async function status() {
    const handle = await getHandle();
    return {
      available: Boolean(root.showDirectoryPicker),
      name: handle?.name || "",
      permission: await directoryPermission(handle),
    };
  }

  async function chooseDirectory() {
    if (!root.showDirectoryPicker) {
      throw new Error("当前浏览器不支持目录授权，请使用新版 Chromium/Chrome/Edge");
    }
    const handle = await root.showDirectoryPicker({
      id: "visualforge-export",
      mode: "readwrite",
      startIn: "desktop",
    });
    await root.VisualForgeStore.setSetting(DIRECTORY_KEY, handle);
    const permission = await handle.requestPermission({ mode: "readwrite" });
    if (permission !== "granted") {
      throw new Error("未获得归档目录写入权限");
    }
    return handle;
  }

  async function ensurePermission(interactive = false) {
    const handle = await getHandle();
    if (!handle) throw new Error("请先选择一个归档目录");
    const current = await directoryPermission(handle);
    if (current === "granted") return handle;
    if (!interactive) {
      throw new Error("归档目录权限已失效，请重新选择或授权目录");
    }
    const permission = await handle.requestPermission({ mode: "readwrite" });
    if (permission !== "granted") {
      throw new Error("未获得归档目录写入权限");
    }
    return handle;
  }

  async function directoryExists(parent, name) {
    try {
      await parent.getDirectoryHandle(name);
      return true;
    } catch (error) {
      if (error.name === "NotFoundError") return false;
      throw error;
    }
  }

  async function uniqueDirectory(parent, stem) {
    let name = stem;
    let duplicate = 2;
    while (await directoryExists(parent, name)) {
      name = `${stem}_${duplicate++}`;
    }
    return parent.getDirectoryHandle(name, { create: true });
  }

  async function reserveGroup(stem) {
    const rootHandle = await ensurePermission(false);
    const folder = await uniqueDirectory(rootHandle, stem);
    return folder.name;
  }

  async function writeFile(directory, name, blob) {
    const handle = await directory.getFileHandle(name, { create: true });
    const stream = await handle.createWritable();
    await stream.write(blob);
    await stream.close();
  }

  async function appendText(directory, name, text) {
    const handle = await directory.getFileHandle(name, { create: true });
    let existing = "";
    try {
      existing = await (await handle.getFile()).text();
    } catch {
      existing = "";
    }
    const stream = await handle.createWritable();
    await stream.write(existing ? `${existing}\n\n${text}` : text);
    await stream.close();
  }

  function extensionFor(asset, blob) {
    const match = String(asset.name || "").match(/\.[a-z0-9]{1,10}$/i);
    if (match) return match[0].toLowerCase();
    const type = blob.type || "";
    if (type.includes("webp")) return ".webp";
    if (type.includes("jpeg")) return ".jpg";
    if (type.includes("json")) return ".json";
    if (type.includes("csv")) return ".csv";
    return ".png";
  }

  async function archiveJob(job, assets, extras = {}) {
    const rootHandle = await ensurePermission(false);
    const groupName =
      job.options?.archive_group_name ||
      buildStem(job.kind, job.options || {}, job.created_at);
    let folder;
    if (job.options?.archive_group_name) {
      folder = await rootHandle.getDirectoryHandle(groupName, { create: true });
    } else {
      folder = await uniqueDirectory(rootHandle, groupName);
    }
    let generatedDirectory = folder;
    let summaryDirectory = folder;
    if (job.kind === "pattern_batch_finalize") {
      generatedDirectory = await folder.getDirectoryHandle("生成图", { create: true });
      summaryDirectory = await folder.getDirectoryHandle("拼图与清单", { create: true });
    }
    const batchIndex = Math.max(1, Number(job.options?.batch_index || 1));
    const groupedPattern = Boolean(job.options?.archive_group_name);
    let imageIndex = 1;
    for (const asset of assets) {
      const blob = asset.blob;
      if (!blob) continue;
      const isPatternSummary =
        job.kind === "pattern_batch_finalize" &&
        ["contact_sheet", "manifest", "manifest_csv"].includes(asset.variant_type);
      const targetDirectory = isPatternSummary ? summaryDirectory : generatedDirectory;
      let filename = asset.name || `output-${imageIndex}${extensionFor(asset, blob)}`;
      if (groupedPattern && blob.type.startsWith("image/")) {
        filename = `批次${String(batchIndex).padStart(2, "0")}_${filename}`;
      } else if (blob.type.startsWith("image/") && asset.variant_type !== "source") {
        filename = `${folder.name}_${String(imageIndex++).padStart(2, "0")}_${filename}`;
      }
      if (asset.variant_type === "source" && job.kind === "pattern_batch_finalize") {
        filename = `商品主图${extensionFor(asset, blob)}`;
      } else if (asset.variant_type === "source") {
        filename = `${folder.name}_00_source${extensionFor(asset, blob)}`;
      } else if (["manifest", "manifest_csv"].includes(asset.variant_type)) {
        filename = groupedPattern
          ? `批次${String(batchIndex).padStart(2, "0")}_manifest${extensionFor(asset, blob)}`
          : `manifest${extensionFor(asset, blob)}`;
      } else if (asset.variant_type === "contact_sheet" && job.kind !== "pattern_batch_finalize") {
        filename = "contact-sheet.png";
      }
      await writeFile(targetDirectory, safeFileName(filename, `file-${imageIndex}`), blob);
    }
    const readme = [
      `Job: ${job.id}`,
      `Type: ${job.kind}`,
      `Created: ${job.created_at}`,
      `SKU: ${job.options?.sku || "-"}`,
      `Outputs: ${assets.filter((asset) => asset.variant_type !== "manifest" && asset.variant_type !== "manifest_csv").length}`,
      "Archived by the Visual Forge browser extension.",
    ].join("\n");
    await appendText(summaryDirectory, "README.txt", readme);
    return {
      path: `${rootHandle.name}\\${folder.name}`,
      groupName: folder.name,
    };
  }

  root.VisualForgeArchive = {
    MODULE_NAMES,
    archiveJob,
    buildStem,
    chooseDirectory,
    ensurePermission,
    reserveGroup,
    safeFileName,
    safeLabel,
    status,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);


"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

class FakeDirectory {
  constructor(name, permission = "granted") {
    this.name = name;
    this.permission = permission;
    this.directories = new Map();
    this.files = new Map();
  }

  async queryPermission() {
    return this.permission;
  }

  async requestPermission() {
    return this.permission;
  }

  async getDirectoryHandle(name, options = {}) {
    if (!this.directories.has(name)) {
      if (!options.create) {
        const error = new Error(`Missing directory: ${name}`);
        error.name = "NotFoundError";
        throw error;
      }
      this.directories.set(name, new FakeDirectory(name, this.permission));
    }
    return this.directories.get(name);
  }

  async getFileHandle(name, options = {}) {
    if (!this.files.has(name) && !options.create) {
      const error = new Error(`Missing file: ${name}`);
      error.name = "NotFoundError";
      throw error;
    }
    if (!this.files.has(name)) {
      let content = "";
      this.files.set(name, {
        getFile: async () => ({
          text: async () =>
            typeof content === "string"
              ? content
              : await content.text(),
        }),
        createWritable: async () => ({
          write: async (value) => {
            content = value;
          },
          close: async () => {},
        }),
      });
    }
    return this.files.get(name);
  }
}

async function loadArchive(rootHandle) {
  globalThis.VisualForgeStore = {
    async getSetting() {
      return rootHandle;
    },
  };
  globalThis.showDirectoryPicker = async () => rootHandle;
  delete require.cache[require.resolve(path.resolve(__dirname, "..", "local-archive.js"))];
  require("../local-archive.js");
  return globalThis.VisualForgeArchive;
}

test("archives ordinary tasks with image, manifest and README", async () => {
  const root = new FakeDirectory("VisualForge商品图");
  const archive = await loadArchive(root);
  const job = {
    id: "abc123",
    kind: "logo_recolor",
    created_at: "2026-11-02T08:00:00.000Z",
    options: { sku: "W1001" },
  };
  const result = await archive.archiveJob(job, [
    {
      name: "logo.png",
      type: "image/png",
      variant_type: "logo",
      blob: new Blob(["image"], { type: "image/png" }),
    },
    {
      name: "manifest.json",
      type: "application/json",
      variant_type: "manifest",
      blob: new Blob(["{}"], { type: "application/json" }),
    },
  ]);
  assert.match(result.groupName, /^单Logo多色_W1001_/);
  const folder = root.directories.get(result.groupName);
  assert.ok(folder);
  assert.ok([...folder.files.keys()].some((name) => /_01_logo\.png$/.test(name)));
  assert.ok(folder.files.has("manifest.json"));
  assert.ok(folder.files.has("README.txt"));
});

test("shares one pattern task root and separates outputs from summaries", async () => {
  const root = new FakeDirectory("VisualForge商品图");
  const archive = await loadArchive(root);
  const groupName = "印花套图_W2002_2026-11-02_16-00-00";
  const job = {
    id: "def456",
    kind: "pattern_batch_finalize",
    created_at: "2026-11-02T08:00:00.000Z",
    options: {
      sku: "W2002",
      archive_group_name: groupName,
      batch_index: 2,
    },
  };
  await archive.archiveJob(job, [
    {
      name: "01-pattern.png",
      type: "image/png",
      variant_type: "pattern_transfer",
      blob: new Blob(["image"], { type: "image/png" }),
    },
    {
      name: "pattern-contact-sheet.png",
      type: "image/png",
      variant_type: "contact_sheet",
      blob: new Blob(["sheet"], { type: "image/png" }),
    },
    {
      name: "manifest.json",
      type: "application/json",
      variant_type: "manifest",
      blob: new Blob(["{}"], { type: "application/json" }),
    },
  ]);
  const folder = root.directories.get(groupName);
  const generated = folder.directories.get("生成图");
  const summary = folder.directories.get("拼图与清单");
  assert.ok(generated.files.has("批次02_01-pattern.png"));
  assert.ok(summary.files.has("批次02_pattern-contact-sheet.png"));
  assert.ok(summary.files.has("批次02_manifest.json"));
  assert.ok(summary.files.has("README.txt"));
});

test("requires a fresh directory authorization when permission is lost", async () => {
  const root = new FakeDirectory("VisualForge商品图", "prompt");
  const archive = await loadArchive(root);
  await assert.rejects(
    archive.archiveJob(
      {
        id: "lost",
        kind: "logo_recolor",
        created_at: new Date().toISOString(),
        options: {},
      },
      [],
    ),
    /权限已失效/,
  );
});

test("reserves unique top-level pattern groups for repeated starts", async () => {
  const root = new FakeDirectory("VisualForge商品图");
  const archive = await loadArchive(root);
  const stem = "印花套图_W3003_2026-11-02_16-30-00";
  assert.equal(await archive.reserveGroup(stem), stem);
  assert.equal(await archive.reserveGroup(stem), `${stem}_2`);
  assert.ok(root.directories.has(stem));
  assert.ok(root.directories.has(`${stem}_2`));
});

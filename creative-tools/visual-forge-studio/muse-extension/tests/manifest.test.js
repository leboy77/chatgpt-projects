"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "manifest.json"), "utf8"),
);

test("uses standalone extension version and permissions", () => {
  assert.equal(manifest.version, "0.13.1");
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.permissions.includes("unlimitedStorage"));
  assert.ok(manifest.permissions.includes("downloads"));
  assert.ok(
    manifest.optional_host_permissions.includes("https://*/*"),
  );
  assert.equal(
    manifest.host_permissions.some((value) =>
      /127\.0\.0\.1|localhost/.test(value),
    ),
    false,
  );
});

test("does not reference the legacy local API in production files", () => {
  const files = fs
    .readdirSync(root)
    .filter((name) => /\.(?:js|html|json)$/.test(name));
  for (const name of files) {
    const source = fs.readFileSync(path.join(root, name), "utf8");
    assert.equal(
      /127\.0\.0\.1:8765|localhost:8765/.test(source),
      false,
      `${name} still references the legacy local API`,
    );
  }
});

test("declares every runtime module as a web-accessible resource", () => {
  const resources =
    manifest.web_accessible_resources?.[0]?.resources || [];
  for (const name of [
    "local-core.js",
    "local-store.js",
    "local-model.js",
    "local-archive.js",
    "local-jobs.js",
    "muse-response.js",
    "zip-builder.js",
  ]) {
    assert.ok(resources.includes(name), `${name} is not web accessible`);
  }
});

test("directory page exposes separate reauthorization and new-directory actions", () => {
  const html = fs.readFileSync(path.join(root, "directory.html"), "utf8");
  assert.match(html, /id="reauthorizeDirectory"[^>]*>重新授权当前目录/);
  assert.match(html, /id="chooseDirectory"[^>]*>选择新目录/);
});

test("product variation UI uses one simple optional-description template", () => {
  const html = fs.readFileSync(path.join(root, "sidepanel.html"), "utf8");
  assert.doesNotMatch(html, /id="vfCopyTemplatePreset"/);
  assert.match(html, /本次裂变描述（可选）/);
  assert.match(html, /只执行默认换印花、随机底布和风格背景/);
  assert.match(html, /value="original" selected>每一版都使用原主图/);
  assert.match(html, /value="match" selected>随印花改变背景/);
  assert.match(html, /id="vfImmediateDownload"[^>]*checked/);
  assert.match(
    html,
    /value="all" selected>全部风格混合（推荐 · 每次随机顺序）/,
  );
});

test("capacity recovery opens Muse's dedicated blank-thread route", () => {
  const sidepanel = fs.readFileSync(
    path.join(root, "sidepanel.js"),
    "utf8",
  );
  assert.match(sidepanel, /url:\s*museResponse\.MUSE_FRESH_THREAD_URL/);
  assert.equal(
    require("../muse-response.js").MUSE_FRESH_THREAD_URL,
    "https://muse.ai/thread/new",
  );
});

test("product video UI exposes no-face presentation and queue controls", () => {
  const html = fs.readFileSync(path.join(root, "sidepanel.html"), "utf8");
  const sidepanel = fs.readFileSync(
    path.join(root, "sidepanel.js"),
    "utf8",
  );
  const content = fs.readFileSync(path.join(root, "content.js"), "utf8");
  assert.match(html, /data-tab="video"[^>]*>产品视频/);
  assert.match(html, /id="vfVideoPresentation"/);
  assert.match(html, /value="worn_no_face"/);
  assert.match(html, /id="vfSaveVideoTask"/);
  assert.match(html, /id="vfCopyCategory"/);
  assert.match(html, /id="vfPatternCategory"/);
  assert.match(html, /id="vfVideoCategory"/);
  assert.match(sidepanel, /VF_MUSE_GENERATE_VIDEO/);
  assert.match(sidepanel, /productCategoryOptions/);
  assert.match(sidepanel, /product_video_generate/);
  assert.match(content, /VF_MUSE_GENERATE_VIDEO/);
  assert.match(content, /waitForMuseVideo/);
});

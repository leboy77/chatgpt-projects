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
  assert.equal(manifest.version, "0.4.1");
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.permissions.includes("unlimitedStorage"));
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
    "zip-builder.js",
  ]) {
    assert.ok(resources.includes(name), `${name} is not web accessible`);
  }
});

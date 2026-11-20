import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "manifest.json"), "utf8"),
);

test("manifest references extension files that exist", () => {
  assert.equal(manifest.manifest_version, 3);
  for (const script of manifest.content_scripts.flatMap((entry) => entry.js)) {
    assert.ok(fs.existsSync(path.join(root, script)), `${script} should exist`);
  }
  for (const resource of manifest.web_accessible_resources.flatMap(
    (entry) => entry.resources,
  )) {
    const candidate = resource.includes("*")
      ? path.join(root, resource.split("*")[0])
      : path.join(root, resource);
    assert.ok(fs.existsSync(candidate), `${resource} should exist`);
  }
});

test("bundle does not depend on remote runtime scripts", () => {
  const panelHtml = fs.readFileSync(path.join(root, "panel/panel.html"), "utf8");
  assert.equal(/<script[^>]+src=["']https?:/i.test(panelHtml), false);
  assert.equal(/<link[^>]+href=["']https?:/i.test(panelHtml), false);
});

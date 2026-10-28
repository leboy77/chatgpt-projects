import fs from "node:fs/promises";
import path from "node:path";

const workspace = process.cwd();
const sourceDir = path.resolve(workspace, "extension-src");
const outputDir = path.resolve(workspace, "dist", "extension");
const allowedOutputRoot = path.resolve(workspace, "dist");

if (!outputDir.startsWith(`${allowedOutputRoot}${path.sep}`)) {
  throw new Error("扩展输出目录超出 dist 根目录");
}

await fs.access(path.join(sourceDir, "manifest.json"));
await fs.access(
  path.join(sourceDir, "assets", "import-template-v2.xlsx"),
);

await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });
await fs.cp(sourceDir, outputDir, { recursive: true });
await fs.mkdir(path.join(outputDir, "shared"), { recursive: true });

const sharedFiles = [
  ["src/core/skc.mjs", "shared/skc.mjs"],
  ["src/core/pricing.mjs", "shared/pricing.mjs"],
  ["src/core/countries.mjs", "shared/countries.mjs"],
  ["src/shared/xlsx-reader.mjs", "shared/xlsx-reader.mjs"],
];

for (const [source, destination] of sharedFiles) {
  await fs.copyFile(
    path.resolve(workspace, source),
    path.join(outputDir, destination),
  );
}

const manifest = JSON.parse(
  await fs.readFile(path.join(outputDir, "manifest.json"), "utf8"),
);
if (manifest.manifest_version !== 3) {
  throw new Error("manifest_version 必须为 3");
}

const requiredFiles = [
  manifest.background?.service_worker,
  manifest.side_panel?.default_path,
  ...(manifest.content_scripts ?? []).flatMap((entry) => entry.js ?? []),
  "shared/skc.mjs",
  "shared/pricing.mjs",
  "shared/countries.mjs",
  "shared/xlsx-reader.mjs",
  "assets/import-template-v2.xlsx",
].filter(Boolean);

for (const relativePath of requiredFiles) {
  await fs.access(path.join(outputDir, relativePath));
}

console.log(
  JSON.stringify({
    outputDir,
    name: manifest.name,
    version: manifest.version,
    requiredFiles: requiredFiles.length,
  }),
);

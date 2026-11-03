"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createZip, crc32 } = require("../zip-builder.js");

test("computes standard CRC32", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("creates a ZIP archive signature", async () => {
  const blob = await createZip([
    new File(["alpha"], "alpha.txt", { type: "text/plain" }),
    new File(["beta"], "beta.txt", { type: "text/plain" }),
  ]);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
});


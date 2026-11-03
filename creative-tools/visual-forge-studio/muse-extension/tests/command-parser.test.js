"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const parser = require("../command-parser.js");

test("ignores ordinary Muse messages", () => {
  assert.equal(parser.parse("帮我订一杯咖啡"), null);
  assert.equal(parser.parse("vf colors #111111"), null);
});

test("parses one logo with multiple colors", () => {
  const result = parser.parse("/vf colors #111111,#FFFFFF #D4684F");
  assert.equal(result.kind, "logo_recolor");
  assert.deepEqual(result.options.colors, [
    "#111111",
    "#FFFFFF",
    "#D4684F",
  ]);
});

test("parses unified logo color", () => {
  const result = parser.parse("/vf color D4684F");
  assert.equal(result.kind, "logo_color_batch");
  assert.equal(result.options.color, "#D4684F");
});

test("parses product generation flags", () => {
  const result = parser.parse(
    "/vf generate 极简白色陶瓷杯 --count 6 --size 1536x1024 --quality medium",
  );
  assert.equal(result.kind, "product_generate");
  assert.equal(result.options.prompt, "极简白色陶瓷杯");
  assert.equal(result.options.count, 6);
  assert.equal(result.options.size, "1536x1024");
  assert.equal(result.options.quality, "medium");
});

test("rejects invalid count", () => {
  const result = parser.parse("/vf generate 杯子 --count 20");
  assert.match(result.error, /1 到 12/);
});

test("supports Chinese command aliases", () => {
  assert.equal(parser.parse("/vf 换色 #111111").kind, "logo_recolor");
  assert.equal(parser.parse("/vf 统一色 #111111").kind, "logo_color_batch");
  assert.equal(parser.parse("/vf 生图 咖啡杯").kind, "product_generate");
});

test("parses product colors and optional names", () => {
  const result = parser.parse(
    "/vf product-colors #1D2A44,#8C1A2D --names 藏青,酒红",
  );
  assert.equal(result.kind, "product_color_muse");
  assert.deepEqual(result.options.colors, [
    { hex: "#1D2A44", name: "藏青" },
    { hex: "#8C1A2D", name: "酒红" },
  ]);
  assert.equal(result.options.region, "whole");
});

test("parses product color region", () => {
  const result = parser.parse(
    "/vf product-colors #1D2A44 --region lower",
  );
  assert.equal(result.options.region, "lower");
});

test("parses optional SKU for every mode", () => {
  assert.equal(
    parser.parse("/vf colors #111111 --sku SKU-001").options.sku,
    "SKU-001",
  );
  assert.equal(
    parser.parse("/vf color #111111 --sku SKU-002").options.sku,
    "SKU-002",
  );
  assert.equal(
    parser.parse("/vf generate 杯子 --sku SKU-003").options.sku,
    "SKU-003",
  );
  assert.equal(
    parser.parse("/vf product-colors #8C1A2D --sku SKU-004").options.sku,
    "SKU-004",
  );
});


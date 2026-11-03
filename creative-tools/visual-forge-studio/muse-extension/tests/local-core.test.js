"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../local-core.js");

test("normalizes colors and removes duplicates", () => {
  assert.equal(core.normalizeColor("#abc"), "#AABBCC");
  assert.equal(core.normalizeColor("d4684f"), "#D4684F");
  assert.deepEqual(
    core.normalizeColors("#111111, #111111,#fff"),
    ["#111111", "#FFFFFF"],
  );
});

test("normalizes product colors with names", () => {
  assert.deepEqual(
    core.normalizeProductColors([
      { hex: "#1d2a44", name: "藏青" },
      "#1D2A44",
      { color: "8c1a2d" },
    ]),
    [
      { hex: "#1D2A44", name: "藏青" },
      { hex: "#8C1A2D", name: "" },
    ],
  );
});

test("builds deterministic product variation prompts", () => {
  const variants = core.buildPromptVariants("极简陶瓷杯", 9);
  assert.equal(variants.length, 9);
  assert.equal(variants[0].direction, "studio");
  assert.equal(variants[8].direction, "studio");
  assert.match(variants[0].prompt, /极简陶瓷杯/);
  assert.match(variants[0].prompt, /Keep the product identity/);
});

test("uses custom prompts without adding scene templates", () => {
  const variants = core.buildPromptVariants("杯子", 2, ["custom a", "custom b"]);
  assert.deepEqual(variants, [
    { direction: "custom_1", prompt: "custom a" },
    { direction: "custom_2", prompt: "custom b" },
  ]);
});

test("calculates CIE Lab and CIEDE2000 baselines", () => {
  const whiteLab = core.srgbToLab(255, 255, 255);
  assert.ok(Math.abs(whiteLab[0] - 100) < 0.01);
  assert.ok(Math.abs(whiteLab[1]) < 0.01);
  assert.ok(Math.abs(whiteLab[2]) < 0.01);
  assert.equal(core.deltaE2000([255, 255, 255], [255, 255, 255]), 0);
  assert.ok(core.deltaE2000([0, 0, 0], [255, 255, 255]) > 90);
});

test("maps delta E to review states", () => {
  assert.equal(core.colorStatus(2.9), "pass");
  assert.equal(core.colorStatus(4.5), "review");
  assert.equal(core.colorStatus(7), "retry");
});

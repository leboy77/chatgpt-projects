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
  assert.equal(variants[0].direction, "custom_1");
  assert.equal(variants[1].direction, "custom_2");
  assert.match(variants[0].prompt, /^custom a\n【工厂平面印花约束】/);
  assert.match(variants[1].prompt, /^custom b\n【工厂平面印花约束】/);
});

test("builds explicit image-to-image copy transformation prompts", () => {
  const variants = core.buildCopyVariationPrompts(
    "请将商品变为橙灰迷彩绒毛裤",
    2,
  );
  assert.equal(variants.length, 2);
  assert.match(variants[0].prompt, /第一张附件是当前商品主图/);
  assert.match(variants[0].prompt, /严格保持原主图的构图/);
  assert.match(variants[0].prompt, /商品类目是下装/);
  assert.match(
    variants[0].prompt,
    /只改变下装的正面、背面和侧缝印花区域中的印花/,
  );
  assert.match(variants[0].prompt, /背景必须真正改变为与当前印花风格一致的新场景/);
  assert.match(
    variants[0].prompt,
    /参考图只用于提取印花图案、线稿、配色和平面明暗/,
  );
  assert.match(variants[0].prompt, /用户补充描述（可为空）：橙灰迷彩绒毛裤/);
  assert.match(
    variants[0].prompt,
    /【底布处理】把下装底布改为 #[0-9A-F]{6}/,
  );
  assert.match(
    variants[0].prompt,
    /本批必须输出 1 张相互独立的商品图/,
  );
});

test("renders editable prompt templates and rejects unknown variables", () => {
  const variants = core.buildCopyVariationPrompts(
    "变为橙灰迷彩绒毛裤",
    2,
    "主图变为 {{instruction}}。第 {{index}}/{{total}} 张，{{direction}}。",
  );
  assert.match(
    variants[0].prompt,
    /^主图变为 橙灰迷彩绒毛裤。第 1\/2 张，[a-z0-9_]+。\n【底布处理】把下装底布改为 #[0-9A-F]{6}[\s\S]*\n【工厂平面印花约束】/,
  );
  assert.match(
    variants[1].prompt,
    /^主图变为 橙灰迷彩绒毛裤。第 2\/2 张，[a-z0-9_]+。\n【底布处理】把下装底布改为 #[0-9A-F]{6}[\s\S]*\n【工厂平面印花约束】/,
  );
  assert.throws(
    () =>
      core.buildCopyVariationPrompts(
        "杯子",
        1,
        "{{instruction}} {{unsupported}}",
      ),
    /未知变量.*\{\{unsupported\}\}/,
  );
  const fixed = core.buildCopyVariationPrompts(
    "",
    1,
    "直接使用固定完整的 Muse 提示词。",
  );
  assert.match(
    fixed[0].prompt,
    /^直接使用固定完整的 Muse 提示词。\n【底布处理】把商品表面底色区域改为 #[0-9A-F]{6}[\s\S]*\n【工厂平面印花约束】/,
  );
});

test("passes direct product prompts without template wrapping", () => {
  const direct = core.buildDirectCopyPrompts(
    "保留商品全部细节，只更换胸前 Logo。",
    2,
  );
  assert.equal(direct.length, 2);
  assert.equal(direct[0].prompt, "保留商品全部细节，只更换胸前 Logo。");
  assert.equal(direct[1].prompt, direct[0].prompt);
  assert.equal(direct[1].direction, "direct_2");
});

test("builds repeated request rounds for one product task", () => {
  const variants = core.buildCopyVariationPrompts("改为联名图案", 40);
  assert.equal(variants.length, 40);
  assert.equal(variants[0].task_index, 1);
  assert.equal(variants[39].task_index, 40);
  assert.equal(core.buildCopyVariationPrompts("改为联名图案", 121).length, 121);
});

test("allows an empty description and assigns category-aware base colors", () => {
  const variants = core.buildCopyVariationPrompts("", 1);
  assert.equal(variants.length, 1);
  assert.match(variants[0].prompt, /严格保持原主图的构图/);
  assert.match(variants[0].prompt, /商品类目是当前商品/);
  assert.match(variants[0].prompt, /【底布处理】/);
  assert.doesNotMatch(variants[0].prompt, /只改变裤子的印花/);
  assert.doesNotMatch(variants[0].prompt, /#FFFFFF|#FFF\b|白色空白背景被允许/);

  const batches = core.buildCopyBatchPrompts("", 4, 1);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].variants.length, 4);
  for (const variant of batches[0].variants) {
    assert.match(
      variant.visual_instruction,
      /【底布处理】把商品表面底色区域改为 #[0-9A-F]{6}/,
    );
    assert.doesNotMatch(variant.visual_instruction, /#FFFFFF|#FFF\b/);
  }
  const keepBackground = core.buildCopyBatchPrompts(
    "",
    1,
    1,
    core.DEFAULT_COPY_PROMPT_TEMPLATE,
    "auto",
    "keep",
  );
  assert.match(
    keepBackground[0].prompt,
    /严格保持原主图的背景、墙面、地面、空间结构/,
  );
  const baseColors = core.pickPantsBaseColors(4, () => 0.25);
  assert.equal(new Set(baseColors.map((item) => item[0])).size, 4);
});

test("selects upper garments without pant-specific prompt language", () => {
  const variants = core.buildCopyVariationPrompts(
    "",
    1,
    core.DEFAULT_COPY_PROMPT_TEMPLATE,
    "auto",
    "match",
    "upper",
  );
  assert.match(variants[0].prompt, /商品类目是上装/);
  assert.match(variants[0].prompt, /上装的正面、背面和袖子印花区域/);
  assert.match(variants[0].prompt, /不得把目标商品改成或描述成裤子/);
  assert.doesNotMatch(variants[0].prompt, /只改变裤子的印花/);
  assert.equal(variants[0].category, "upper");
});

test("uses explicit alternative-fashion style packs", () => {
  const variants = core.buildCopyVariationPrompts(
    "随机",
    32,
    core.DEFAULT_COPY_PROMPT_TEMPLATE,
    "yabi_moto",
  );
  assert.equal(variants[0].direction, "y2k_flat");
  assert.match(variants[0].prompt, /Y2K 视觉/);
  assert.match(variants[0].prompt, /作为矢量印花/);
  assert.doesNotMatch(
    core.COPY_STYLE_PACKS.yabi_moto[0][1],
    /金属|反光|铬|镭射|全息|亮片|镜面|珠光|箔|皮革/,
  );
  assert.match(variants[0].prompt, /工厂平面印花约束/);
  assert.match(variants[1].prompt, /机车越野视觉/);
  assert.equal(new Set(variants.map((item) => item.direction)).size, 32);
  const all = core.buildCopyVariationPrompts(
    "随机",
    72,
    core.DEFAULT_COPY_PROMPT_TEMPLATE,
    "all",
  );
  assert.equal(new Set(all.map((item) => item.direction)).size, 72);
  assert.equal(
    all.every((item) => item.prompt.includes("【工厂平面印花约束】")),
    true,
  );
  const shuffled = core.shuffleDirections(core.COPY_STYLE_PACKS.all, () => 0);
  assert.notDeepEqual(
    shuffled.map((item) => item[0]),
    core.COPY_STYLE_PACKS.all.map((item) => item[0]),
  );
  assert.equal(
    new Set(shuffled.map((item) => item[0])).size,
    core.COPY_STYLE_PACKS.all.length,
  );
});

test("lets auto style follow the user description", () => {
  const yabi = core.buildCopyVariationPrompts(
    "亚比机车风格的金属印花",
    1,
    core.DEFAULT_COPY_PROMPT_TEMPLATE,
    "auto",
  );
  assert.equal(yabi[0].direction, "y2k_flat");
  const open = core.buildCopyVariationPrompts(
    "现代先锋服装大片",
    1,
    core.DEFAULT_COPY_PROMPT_TEMPLATE,
    "auto",
  );
  assert.equal(open[0].direction, "closeup_flash");
});

test("marks only pixels matching the source logo color", () => {
  const data = new Uint8ClampedArray([
    255, 255, 255, 255,
    255, 0, 0, 255,
    248, 2, 2, 255,
    25, 35, 45, 255,
  ]);
  const mask = core.logoColorMask(data, "#FF0000", 12);
  assert.equal(mask[0], 0);
  assert.equal(mask[1], 255);
  assert.ok(mask[2] > 0);
  assert.equal(mask[3], 0);
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

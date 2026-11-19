"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const templates = require("../prompt-templates.js");

test("exposes a complete default prompt for every Muse feature", () => {
  assert.deepEqual(Object.keys(templates.DEFAULTS).sort(), [
    "copy",
    "copy_character",
    "copy_cinematic",
    "copy_editorial",
    "copy_fidelity",
    "copy_free",
    "copy_gallery",
    "copy_surreal",
    "logo_design",
    "logo_design_batch",
    "pattern_batch",
    "pattern_single",
    "product_color",
    "product_color_batch",
    "video_showcase",
  ]);
  for (const value of Object.values(templates.DEFAULTS)) {
    assert.ok(value.length > 80);
  }
});

test("batch prompts expose strict one-to-one output instructions", () => {
  assert.deepEqual(
    [...new Set(templates.variables(templates.DEFAULTS.product_color_batch))].sort(),
    ["color_count", "color_list", "region_name", "total"],
  );
  assert.deepEqual(
    [...new Set(templates.variables(templates.DEFAULTS.logo_design_batch))].sort(),
    ["instruction", "output_count", "request_index"],
  );
  assert.match(templates.DEFAULTS.product_color_batch, /一张色卡对应一张输出/);
  assert.match(templates.DEFAULTS.logo_design_batch, /禁止拼图/);
});

test("product variation templates enforce factory print-only production", () => {
  assert.ok(
    templates.variables(templates.DEFAULTS.copy).includes(
      "background_instruction",
    ),
  );
  for (const [key, value] of Object.entries(templates.DEFAULTS)) {
    if (!key.startsWith("copy")) continue;
    assert.match(value, /【工厂平面印花约束】/, key);
    assert.match(value, /严禁新增或改变任何物理结构、配件/, key);
    assert.match(value, /哑光平涂、清晰套色、无光泽、无浮凸/, key);
    assert.doesNotMatch(
      value,
      /金属|反光|铬|镭射|全息|亮片|镜面|珠光|箔|皮革/,
      key,
    );
  }
});

test("renders prompt placeholders without requiring instruction", () => {
  assert.equal(
    templates.render("固定完整提示词 {{index}}/{{total}}", {
      index: 1,
      total: 4,
    }),
    "固定完整提示词 1/4",
  );
  assert.deepEqual(templates.variables("{{index}} {{unknown}}"), [
    "index",
    "unknown",
  ]);
});

test("product video prompt always enforces a hidden face", () => {
  const rendered = templates.render(templates.DEFAULTS.video_showcase, {
    instruction: "",
    duration_seconds: 8,
    aspect_ratio: "9:16",
    presentation_instruction: "模特上身展示",
    request_index: 1,
    request_count: 2,
  });
  const enforced = templates.ensureVideoNoFaceConstraint(rendered);
  assert.match(enforced, /脸部.{0,20}(?:不得|不能|禁止)/);
  assert.match(enforced, /颈部以下/);
  assert.match(enforced, /正脸|侧脸|完整头部/);
  assert.equal(
    templates.ensureVideoNoFaceConstraint(enforced),
    enforced,
  );
  assert.doesNotMatch(
    templates.ensureVideoNoFaceConstraint("自定义视频模板，不限制人物"),
    /不限制人物$/,
  );
});

test("product category enum adapts upper and lower garment language", () => {
  const values = templates.productCategoryOptions();
  assert.ok(values.some((item) => item.value === "upper"));
  assert.ok(values.some((item) => item.value === "lower"));
  assert.ok(values.some((item) => item.value === "dress"));
  assert.equal(
    templates.resolveProductCategory("auto", "给一件卫衣换印花"),
    "upper",
  );
  assert.equal(
    templates.resolveProductCategory("auto", "给长裤换印花"),
    "lower",
  );
  const upper = templates.productCategoryValues("upper");
  assert.equal(upper.category_name, "上装");
  assert.match(upper.category_print_area, /袖子/);
  const prompt = templates.ensureProductCategoryConstraint(
    "只改变裤子的印花",
    "upper",
  );
  assert.match(prompt, /本次商品类目是上装/);
  assert.match(prompt, /不得把目标商品改成或描述成裤子/);
});

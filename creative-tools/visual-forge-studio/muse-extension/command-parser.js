(function attachCommandParser(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.MuseBridgeCommands = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createParser() {
  "use strict";

  const HELP =
    "用法：/vf product-colors #1D2A44,#8C1A2D｜" +
    "/vf colors #111111,#FFFFFF｜/vf color #D4684F｜" +
    "/vf generate 产品描述 --count 4";

  function splitColors(raw) {
    return raw
      .split(/[\s,，;；]+/)
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => (value.startsWith("#") ? value : `#${value}`));
  }

  function extractFlag(text, name) {
    const expression = new RegExp(
      `(?:^|\\s)--${name}(?:\\s+|=)([^\\s]+)`,
      "i",
    );
    const match = text.match(expression);
    return match
      ? {
          value: match[1].replace(/^["']|["']$/g, ""),
          text: text.replace(match[0], " ").trim(),
        }
      : { value: null, text };
  }

  function parse(text) {
    const trimmed = String(text || "").trim();
    if (!/^\/vf(?:\s|$)/i.test(trimmed)) {
      return null;
    }
    const body = trimmed.replace(/^\/vf\s*/i, "").trim();
    if (!body) {
      return { error: HELP };
    }
    const separator = body.search(/\s/);
    const mode = (separator < 0 ? body : body.slice(0, separator)).toLowerCase();
    let rest = separator < 0 ? "" : body.slice(separator).trim();

    if (["colors", "recolor", "换色", "多色"].includes(mode)) {
      const skuFlag = extractFlag(rest, "sku");
      rest = skuFlag.text;
      const colors = splitColors(rest);
      if (!colors.length) {
        return { error: "请在 /vf colors 后输入颜色，例如 #111111,#FFFFFF" };
      }
      const invalid = colors.find(
        (color) => !/^#(?:[0-9a-f]{6}|[0-9a-f]{3})$/i.test(color),
      );
      if (invalid) {
        return { error: `颜色格式无效：${invalid}` };
      }
      return {
        kind: "logo_recolor",
        options: {
          colors,
          remove_background: "auto",
          trim: true,
          sku: skuFlag.value || "",
        },
      };
    }

    if (["color", "batch", "统一色", "一色"].includes(mode)) {
      const skuFlag = extractFlag(rest, "sku");
      rest = skuFlag.text;
      const colors = splitColors(rest);
      if (colors.length !== 1) {
        return { error: "请在 /vf color 后输入一个颜色，例如 #D4684F" };
      }
      if (!/^#(?:[0-9a-f]{6}|[0-9a-f]{3})$/i.test(colors[0])) {
        return { error: `颜色格式无效：${colors[0]}` };
      }
      return {
        kind: "logo_color_batch",
        options: {
          color: colors[0],
          remove_background: "auto",
          trim: true,
          sku: skuFlag.value || "",
        },
      };
    }

    if (["generate", "gen", "生图", "裂变"].includes(mode)) {
      const countFlag = extractFlag(rest, "count");
      const sizeFlag = extractFlag(countFlag.text, "size");
      const qualityFlag = extractFlag(sizeFlag.text, "quality");
      const skuFlag = extractFlag(qualityFlag.text, "sku");
      const prompt = skuFlag.text.trim();
      if (!prompt) {
        return { error: "请在 /vf generate 后输入产品描述" };
      }
      const count = countFlag.value ? Number(countFlag.value) : 4;
      if (!Number.isInteger(count) || count < 1 || count > 12) {
        return { error: "--count 必须是 1 到 12 的整数" };
      }
      const size = sizeFlag.value || "1024x1024";
      if (!/^(?:1024x1024|1536x1024|1024x1536)$/.test(size)) {
        return {
          error: "--size 只支持 1024x1024、1536x1024、1024x1536",
        };
      }
      const quality = qualityFlag.value || "high";
      if (!["low", "medium", "high"].includes(quality)) {
        return { error: "--quality 只支持 low、medium、high" };
      }
      return {
        kind: "product_generate",
        options: { prompt, count, size, quality, sku: skuFlag.value || "" },
      };
    }

    if (
      ["product-colors", "product_colors", "商品多色", "商品配色"].includes(
        mode,
      )
    ) {
      const namesFlag = extractFlag(rest, "names");
      const regionFlag = extractFlag(namesFlag.text, "region");
      const skuFlag = extractFlag(regionFlag.text, "sku");
      rest = skuFlag.text;
      const colors = splitColors(rest);
      if (!colors.length) {
        return {
          error:
            "请在 /vf product-colors 后输入色号，例如 #1D2A44,#8C1A2D",
        };
      }
      const invalid = colors.find(
        (color) => !/^#(?:[0-9a-f]{6}|[0-9a-f]{3})$/i.test(color),
      );
      if (invalid) {
        return { error: `颜色格式无效：${invalid}` };
      }
      const names = namesFlag.value
        ? namesFlag.value.split(/[,，;；]+/).map((item) => item.trim())
        : [];
      const region = (regionFlag.value || "whole").toLowerCase();
      if (!["whole", "upper", "lower"].includes(region)) {
        return { error: "--region 只支持 whole、upper、lower" };
      }
      return {
        kind: "product_color_muse",
        options: {
          colors: colors.map((color, index) => ({
            hex: color,
            name: names[index] || "",
          })),
          pass_limit: 3,
          review_limit: 5,
          region,
          sku: skuFlag.value || "",
        },
      };
    }

    return { error: `未知指令 ${mode}。${HELP}` };
  }

  return { parse, splitColors, HELP };
});


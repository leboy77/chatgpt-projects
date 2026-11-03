(function attachLocalCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.VisualForgeCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCore() {
  "use strict";

  const VARIATION_DIRECTIONS = [
    [
      "studio",
      "Premium studio hero shot, clean seamless backdrop, controlled softbox lighting, centered product composition, high-end commercial photography.",
    ],
    [
      "lifestyle",
      "Natural lifestyle scene that communicates real use, believable props, warm editorial lighting, shallow but controlled depth of field.",
    ],
    [
      "detail",
      "Macro material and craftsmanship detail, tactile texture, precise highlights, premium catalog photography.",
    ],
    [
      "seasonal",
      "Seasonal retail campaign scene with restrained decorative props, bold color blocking, aspirational art direction and generous negative space.",
    ],
    [
      "editorial",
      "Magazine editorial still life, sculptural shadows, sophisticated palette, dynamic but product-led composition.",
    ],
    [
      "flat_lay",
      "Top-down flat lay on a refined surface, carefully arranged companion objects, crisp commercial lighting and balanced negative space.",
    ],
    [
      "outdoor",
      "Premium outdoor context with authentic ambient light, shallow depth of field, natural materials and a strong sense of place.",
    ],
    [
      "gift",
      "Premium gifting concept, elegant packaging accents, celebratory but restrained styling, commercial campaign quality.",
    ],
  ];

  const FIDELITY =
    "Keep the product identity, silhouette, material, proportions, color and " +
    "construction exactly consistent. Product is the hero. No invented text, " +
    "no watermark, no unrelated logo, no duplicate product.";

  function normalizeColor(value) {
    let text = String(value || "").trim().toUpperCase();
    if (!text.startsWith("#")) text = `#${text}`;
    if (/^#[0-9A-F]{3}$/.test(text)) {
      text = `#${text
        .slice(1)
        .split("")
        .map((character) => character + character)
        .join("")}`;
    }
    if (!/^#[0-9A-F]{6}$/.test(text)) {
      throw new Error(`无效颜色值：${value}，请使用 #RRGGBB`);
    }
    return text;
  }

  function normalizeColors(values, maximum = 30) {
    const source = Array.isArray(values)
      ? values
      : String(values || "").split(/[\s,，;；]+/);
    const colors = [];
    for (const value of source) {
      if (!String(value || "").trim()) continue;
      const color = normalizeColor(value);
      if (!colors.includes(color)) colors.push(color);
    }
    if (!colors.length) throw new Error("至少需要一个目标颜色");
    if (colors.length > maximum) {
      throw new Error(`单次任务最多支持 ${maximum} 个颜色`);
    }
    return colors;
  }

  function normalizeProductColors(values, maximum = 30) {
    if (!Array.isArray(values)) throw new Error("colors 必须是颜色数组");
    const seen = new Set();
    const colors = [];
    for (const item of values) {
      const raw = typeof item === "string" ? item : item?.hex || item?.color;
      const color = normalizeColor(raw);
      if (seen.has(color)) continue;
      seen.add(color);
      colors.push({
        hex: color,
        name:
          typeof item === "object" && item
            ? String(item.name || "").trim()
            : "",
      });
    }
    if (!colors.length) throw new Error("至少需要一个目标颜色");
    if (colors.length > maximum) {
      throw new Error(`单次最多支持 ${maximum} 个商品颜色`);
    }
    return colors;
  }

  function safeFilename(name, fallback = "file") {
    const text = String(name || "");
    const dot = text.lastIndexOf(".");
    const hasSuffix = dot > 0 && text.length - dot <= 10;
    const rawStem = hasSuffix ? text.slice(0, dot) : text;
    const suffix = hasSuffix ? text.slice(dot).toLowerCase() : "";
    let stem = rawStem
      .replace(/[^\p{L}\p{N}._-]+/gu, "-")
      .replace(/^[ ._-]+|[ ._-]+$/g, "")
      .slice(0, 80);
    if (!stem) stem = fallback;
    return `${stem}${suffix.replace(/[^.\w]/g, "").slice(0, 10)}`;
  }

  function parseSize(value) {
    const [width, height] = String(value || "")
      .toLowerCase()
      .split("x")
      .map(Number);
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width < 256 ||
      height < 256 ||
      width > 4096 ||
      height > 4096
    ) {
      throw new Error("图片尺寸格式应为 256 到 4096 之间的 WxH");
    }
    return { width, height };
  }

  function buildPromptVariants(basePrompt, count, preselected = null) {
    const normalized = String(basePrompt || "").replace(/\s+/g, " ").trim();
    if (!normalized) throw new Error("请输入产品描述");
    const amount = Number(count);
    if (!Number.isInteger(amount) || amount < 1 || amount > 12) {
      throw new Error("裂变数量需在 1 到 12 之间");
    }
    if (Array.isArray(preselected) && preselected.length) {
      const prompts = preselected
        .map((item) => String(item || "").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, Math.min(amount, 12));
      if (!prompts.length) throw new Error("没有可用的自定义裂变描述");
      return prompts.map((prompt, index) => ({
        direction: `custom_${index + 1}`,
        prompt,
      }));
    }
    return Array.from({ length: amount }, (_, index) => {
      const [direction, description] =
        VARIATION_DIRECTIONS[index % VARIATION_DIRECTIONS.length];
      return {
        direction,
        prompt: `${normalized}. ${description} ${FIDELITY}`,
      };
    });
  }

  function hexToRgb(hex) {
    const color = normalizeColor(hex);
    return [
      parseInt(color.slice(1, 3), 16),
      parseInt(color.slice(3, 5), 16),
      parseInt(color.slice(5, 7), 16),
    ];
  }

  function rgbToHex(red, green, blue) {
    return `#${[red, green, blue]
      .map((value) =>
        Math.max(0, Math.min(255, Math.round(value)))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
      .toUpperCase()}`;
  }

  function rgbToHsv(red, green, blue) {
    const r = red / 255;
    const g = green / 255;
    const b = blue / 255;
    const maximum = Math.max(r, g, b);
    const minimum = Math.min(r, g, b);
    const delta = maximum - minimum;
    let hue = 0;
    if (delta) {
      if (maximum === r) hue = ((g - b) / delta) % 6;
      else if (maximum === g) hue = (b - r) / delta + 2;
      else hue = (r - g) / delta + 4;
      hue = (hue * 60 + 360) % 360;
    }
    return [hue, maximum === 0 ? 0 : delta / maximum, maximum];
  }

  function hsvToRgb(hue, saturation, value) {
    const h = ((hue % 360) + 360) % 360;
    const s = Math.max(0, Math.min(1, saturation));
    const v = Math.max(0, Math.min(1, value));
    const chroma = v * s;
    const section = h / 60;
    const x = chroma * (1 - Math.abs((section % 2) - 1));
    let rgb;
    if (section < 1) rgb = [chroma, x, 0];
    else if (section < 2) rgb = [x, chroma, 0];
    else if (section < 3) rgb = [0, chroma, x];
    else if (section < 4) rgb = [0, x, chroma];
    else if (section < 5) rgb = [x, 0, chroma];
    else rgb = [chroma, 0, x];
    const match = v - chroma;
    return rgb.map((channel) => Math.round((channel + match) * 255));
  }

  function srgbToLab(red, green, blue) {
    function linear(channel) {
      const value = channel / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    }
    const r = linear(red);
    const g = linear(green);
    const b = linear(blue);
    const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
    const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
    const z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883;
    const epsilon = 216 / 24389;
    const kappa = 24389 / 27;
    function pivot(value) {
      return value > epsilon
        ? Math.cbrt(value)
        : (kappa * value + 16) / 116;
    }
    const fx = pivot(x);
    const fy = pivot(y);
    const fz = pivot(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }

  function deltaE2000(rgbA, rgbB) {
    const [l1, a1, b1] = srgbToLab(...rgbA);
    const [l2, a2, b2] = srgbToLab(...rgbB);
    const c1 = Math.hypot(a1, b1);
    const c2 = Math.hypot(a2, b2);
    const cMean = (c1 + c2) / 2;
    const c7 = cMean ** 7;
    const g = 0.5 * (1 - Math.sqrt(c7 / (c7 + 25 ** 7)));
    const a1Prime = (1 + g) * a1;
    const a2Prime = (1 + g) * a2;
    const c1Prime = Math.hypot(a1Prime, b1);
    const c2Prime = Math.hypot(a2Prime, b2);
    function hue(a, b) {
      if (Math.abs(a) < 1e-12 && Math.abs(b) < 1e-12) return 0;
      const angle = (Math.atan2(b, a) * 180) / Math.PI;
      return angle < 0 ? angle + 360 : angle;
    }
    const h1Prime = hue(a1Prime, b1);
    const h2Prime = hue(a2Prime, b2);
    const deltaL = l2 - l1;
    const deltaC = c2Prime - c1Prime;
    let deltaHueAngle = h2Prime - h1Prime;
    if (c1Prime * c2Prime === 0) deltaHueAngle = 0;
    else if (deltaHueAngle > 180) deltaHueAngle -= 360;
    else if (deltaHueAngle < -180) deltaHueAngle += 360;
    const deltaH = 2 * Math.sqrt(c1Prime * c2Prime) *
      Math.sin((deltaHueAngle * Math.PI) / 360);
    const lMean = (l1 + l2) / 2;
    const cPrimeMean = (c1Prime + c2Prime) / 2;
    let hPrimeMean = h1Prime + h2Prime;
    if (c1Prime * c2Prime === 0) hPrimeMean = h1Prime + h2Prime;
    else if (Math.abs(h1Prime - h2Prime) <= 180) hPrimeMean /= 2;
    else if (hPrimeMean < 360) hPrimeMean = (hPrimeMean + 360) / 2;
    else hPrimeMean = (hPrimeMean - 360) / 2;
    const t =
      1 -
      0.17 * Math.cos(((hPrimeMean - 30) * Math.PI) / 180) +
      0.24 * Math.cos((2 * hPrimeMean * Math.PI) / 180) +
      0.32 * Math.cos(((3 * hPrimeMean + 6) * Math.PI) / 180) -
      0.2 * Math.cos(((4 * hPrimeMean - 63) * Math.PI) / 180);
    const sl = 1 + (0.015 * (lMean - 50) ** 2) / Math.sqrt(20 + (lMean - 50) ** 2);
    const sc = 1 + 0.045 * cPrimeMean;
    const sh = 1 + 0.015 * cPrimeMean * t;
    const rt =
      -2 *
      Math.sqrt(cPrimeMean ** 7 / (cPrimeMean ** 7 + 25 ** 7)) *
      Math.sin(
        (60 *
          Math.exp(-(((hPrimeMean - 275) / 25) ** 2)) *
          Math.PI) /
          180,
      );
    return Math.sqrt(
      (deltaL / sl) ** 2 +
        (deltaC / sc) ** 2 +
        (deltaH / sh) ** 2 +
        rt * (deltaC / sc) * (deltaH / sh),
    );
  }

  function colorStatus(deltaE, passLimit = 3, reviewLimit = 5) {
    if (deltaE <= passLimit) return "pass";
    if (deltaE <= reviewLimit) return "review";
    return "retry";
  }

  function canvas(width, height) {
    const output = document.createElement("canvas");
    output.width = Math.max(1, Math.round(width));
    output.height = Math.max(1, Math.round(height));
    return output;
  }

  async function decode(blob) {
    try {
      const bitmap = await createImageBitmap(blob);
      const target = canvas(bitmap.width, bitmap.height);
      target.getContext("2d", { willReadFrequently: true }).drawImage(bitmap, 0, 0);
      bitmap.close();
      return target;
    } catch {
      const url = URL.createObjectURL(blob);
      try {
        const image = new Image();
        image.decoding = "async";
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = () => reject(new Error("浏览器无法解码图片"));
          image.src = url;
        });
        const target = canvas(image.naturalWidth, image.naturalHeight);
        target
          .getContext("2d", { willReadFrequently: true })
          .drawImage(image, 0, 0);
        return target;
      } finally {
        URL.revokeObjectURL(url);
      }
    }
  }

  function toBlob(target, type = "image/png", quality = 0.95) {
    return new Promise((resolve, reject) => {
      target.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("图片编码失败"))),
        type,
        quality,
      );
    });
  }

  function cloneCanvas(source) {
    const target = canvas(source.width, source.height);
    target.getContext("2d").drawImage(source, 0, 0);
    return target;
  }

  function scaledCanvas(source, maximum = 480) {
    const scale = Math.min(1, maximum / Math.max(source.width, source.height));
    if (scale === 1) return cloneCanvas(source);
    const target = canvas(source.width * scale, source.height * scale);
    const context = target.getContext("2d", { willReadFrequently: true });
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(source, 0, 0, target.width, target.height);
    return target;
  }

  function fitCanvas(source, width, height) {
    const target = canvas(width, height);
    const context = target.getContext("2d", { willReadFrequently: true });
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    const scale = Math.max(width / source.width, height / source.height);
    const drawWidth = source.width * scale;
    const drawHeight = source.height * scale;
    context.drawImage(
      source,
      (width - drawWidth) / 2,
      (height - drawHeight) / 2,
      drawWidth,
      drawHeight,
    );
    return target;
  }

  function contains(source, width, height) {
    const target = canvas(width, height);
    const context = target.getContext("2d", { willReadFrequently: true });
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    const scale = Math.min(width / source.width, height / source.height);
    const drawWidth = source.width * scale;
    const drawHeight = source.height * scale;
    context.drawImage(
      source,
      (width - drawWidth) / 2,
      (height - drawHeight) / 2,
      drawWidth,
      drawHeight,
    );
    return target;
  }

  function removeFlatBackground(target, tolerance = 18) {
    const context = target.getContext("2d", { willReadFrequently: true });
    const image = context.getImageData(0, 0, target.width, target.height);
    const data = image.data;
    const width = target.width;
    const height = target.height;
    let hasAlpha = false;
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] < 250) {
        hasAlpha = true;
        break;
      }
    }
    if (hasAlpha || width < 3 || height < 3) return target;
    const points = [
      [0, 0],
      [width - 1, 0],
      [0, height - 1],
      [width - 1, height - 1],
    ];
    const background = [0, 1, 2].map((channel) => {
      const values = points.map(([x, y]) => data[(y * width + x) * 4 + channel]);
      return [...values].sort((left, right) => left - right)[1];
    });
    const visited = new Uint8Array(width * height);
    const queue = new Int32Array(width * height);
    let head = 0;
    let tail = 0;
    const seed = (x, y) => {
      if (x < 0 || x >= width || y < 0 || y >= height) return;
      const position = y * width + x;
      if (visited[position]) return;
      const offset = position * 4;
      const distance = Math.max(
        Math.abs(data[offset] - background[0]),
        Math.abs(data[offset + 1] - background[1]),
        Math.abs(data[offset + 2] - background[2]),
      );
      if (distance > tolerance) return;
      visited[position] = 1;
      queue[tail++] = position;
    };
    for (let x = 0; x < width; x += 1) {
      seed(x, 0);
      seed(x, height - 1);
    }
    for (let y = 0; y < height; y += 1) {
      seed(0, y);
      seed(width - 1, y);
    }
    while (head < tail) {
      const position = queue[head++];
      const x = position % width;
      const y = Math.floor(position / width);
      data[position * 4 + 3] = 0;
      if (x) seed(x - 1, y);
      if (x + 1 < width) seed(x + 1, y);
      if (y) seed(x, y - 1);
      if (y + 1 < height) seed(x, y + 1);
    }
    context.putImageData(image, 0, 0);
    return target;
  }

  function trimTransparent(target, padding = 12) {
    const image = target
      .getContext("2d", { willReadFrequently: true })
      .getImageData(0, 0, target.width, target.height);
    const data = image.data;
    let left = target.width;
    let top = target.height;
    let right = -1;
    let bottom = -1;
    for (let y = 0; y < target.height; y += 1) {
      for (let x = 0; x < target.width; x += 1) {
        if (data[(y * target.width + x) * 4 + 3] === 0) continue;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
    if (right < left || bottom < top) throw new Error("图片中没有可见内容");
    left = Math.max(0, left - padding);
    top = Math.max(0, top - padding);
    right = Math.min(target.width - 1, right + padding);
    bottom = Math.min(target.height - 1, bottom + padding);
    const output = canvas(right - left + 1, bottom - top + 1);
    output
      .getContext("2d")
      .drawImage(target, left, top, output.width, output.height, 0, 0, output.width, output.height);
    return output;
  }

  async function prepareLogo(blob, options = {}) {
    let target = await decode(blob);
    const mode = String(options.remove_background ?? "auto").toLowerCase();
    if (mode === "true" || mode === "auto") {
      target = removeFlatBackground(
        target,
        Math.max(0, Math.min(80, Number(options.background_tolerance || 18))),
      );
    }
    if (options.trim !== false) target = trimTransparent(target, 12);
    return target;
  }

  async function recolorLogo(source, colors, options = {}, onProgress = null) {
    const prepared = await prepareLogo(source, options);
    const original = prepared
      .getContext("2d", { willReadFrequently: true })
      .getImageData(0, 0, prepared.width, prepared.height);
    const outputs = [];
    for (let index = 0; index < colors.length; index += 1) {
      const color = colors[index];
      const [red, green, blue] = hexToRgb(color);
      const target = canvas(prepared.width, prepared.height);
      const context = target.getContext("2d");
      const image = new ImageData(
        new Uint8ClampedArray(original.data),
        original.width,
        original.height,
      );
      for (let offset = 0; offset < image.data.length; offset += 4) {
        image.data[offset] = red;
        image.data[offset + 1] = green;
        image.data[offset + 2] = blue;
      }
      context.putImageData(image, 0, 0);
      const sourceStem = safeFilename(source.name || "logo")
        .replace(/\.[^.]+$/, "")
        .slice(0, 70);
      outputs.push({
        blob: await toBlob(target),
        name: `${sourceStem}-${color.slice(1)}.png`,
        width: target.width,
        height: target.height,
        color,
        variant_type: "logo",
      });
      onProgress?.(Math.round(((index + 1) / colors.length) * 95), `已生成颜色 ${index + 1}/${colors.length}`);
    }
    return outputs;
  }

  function regionBox(size, region) {
    const boxes = {
      lower: [0.1, 0.34, 0.9, 0.96],
      upper: [0.08, 0.05, 0.92, 0.68],
      whole: [0.08, 0.06, 0.92, 0.94],
    };
    const [left, top, right, bottom] = boxes[region] || boxes.whole;
    return [
      Math.floor(size.width * left),
      Math.floor(size.height * top),
      Math.ceil(size.width * right),
      Math.ceil(size.height * bottom),
    ];
  }

  function maskCoverage(mask, width, height) {
    let count = 0;
    for (const value of mask) if (value >= 64) count += 1;
    return count / (width * height);
  }

  function filterMaskComponents(mask, width, height, minimumCoverage = 0.0008) {
    const visited = new Uint8Array(width * height);
    const queue = new Int32Array(width * height);
    const components = [];
    for (let position = 0; position < mask.length; position += 1) {
      if (visited[position] || mask[position] < 128) continue;
      let head = 0;
      let tail = 0;
      const points = [];
      queue[tail++] = position;
      visited[position] = 1;
      while (head < tail) {
        const current = queue[head++];
        points.push(current);
        const x = current % width;
        const y = Math.floor(current / width);
        const neighbours = [
          x ? current - 1 : -1,
          x + 1 < width ? current + 1 : -1,
          y ? current - width : -1,
          y + 1 < height ? current + width : -1,
        ];
        for (const next of neighbours) {
          if (
            next >= 0 &&
            !visited[next] &&
            mask[next] >= 128
          ) {
            visited[next] = 1;
            queue[tail++] = next;
          }
        }
      }
      components.push(points);
    }
    if (!components.length) return mask;
    components.sort((left, right) => right.length - left.length);
    const largest = components[0].length;
    const minimum = Math.max(20, Math.floor(width * height * minimumCoverage));
    const output = new Uint8ClampedArray(mask.length);
    for (const points of components) {
      if (points.length < minimum || points.length < largest * 0.22) continue;
      for (const position of points) output[position] = 255;
    }
    return output;
  }

  function canvasFromMask(mask, width, height) {
    const image = new ImageData(width, height);
    for (let index = 0; index < mask.length; index += 1) {
      image.data[index * 4] = mask[index];
      image.data[index * 4 + 1] = mask[index];
      image.data[index * 4 + 2] = mask[index];
      image.data[index * 4 + 3] = 255;
    }
    const output = canvas(width, height);
    output.getContext("2d").putImageData(image, 0, 0);
    return output;
  }

  function resizeMask(mask, width, height, targetWidth, targetHeight) {
    const source = canvasFromMask(mask, width, height);
    const target = canvas(targetWidth, targetHeight);
    const context = target.getContext("2d", { willReadFrequently: true });
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(source, 0, 0, targetWidth, targetHeight);
    const image = context.getImageData(0, 0, targetWidth, targetHeight);
    const output = new Uint8ClampedArray(targetWidth * targetHeight);
    for (let index = 0; index < output.length; index += 1) {
      output[index] = image.data[index * 4];
    }
    return output;
  }

  function targetColorMask(source, targetHex, region = "whole") {
    const small = scaledCanvas(source, 480);
    const image = small
      .getContext("2d", { willReadFrequently: true })
      .getImageData(0, 0, small.width, small.height);
    const [targetR, targetG, targetB] = hexToRgb(targetHex);
    const [targetH, targetS, targetV] = rgbToHsv(targetR, targetG, targetB).map(
      (value, index) => (index === 0 ? value : value),
    );
    const [left, top, right, bottom] = regionBox(
      { width: small.width, height: small.height },
      region,
    );
    const mask = new Uint8ClampedArray(small.width * small.height);
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const offset = (y * small.width + x) * 4;
        const [hue, saturation, value] = rgbToHsv(
          image.data[offset],
          image.data[offset + 1],
          image.data[offset + 2],
        );
        let matches;
        if (targetS < 0.16) {
          matches = saturation < 0.28 && Math.abs(value - targetV) < 0.36;
        } else {
          let hueDistance = Math.abs(hue - targetH) / 360;
          hueDistance = Math.min(hueDistance, 1 - hueDistance);
          matches =
            hueDistance <= 0.055 &&
            saturation >= Math.max(0.18, targetS * 0.34) &&
            Math.abs(value - targetV) <= 0.52;
        }
        if (matches) mask[y * small.width + x] = 255;
      }
    }
    const filtered = filterMaskComponents(mask, small.width, small.height);
    const coverage = maskCoverage(filtered, small.width, small.height);
    if (coverage < 0.004 || coverage > 0.72) {
      return { mask: null, coverage: 0 };
    }
    return {
      mask: resizeMask(
        filtered,
        small.width,
        small.height,
        source.width,
        source.height,
      ),
      coverage,
    };
  }

  function differenceMask(master, variant, region = "whole") {
    const masterSmall = scaledCanvas(master, 480);
    const variantSmall = scaledCanvas(fitCanvas(variant, masterSmall.width, masterSmall.height), 480);
    const width = masterSmall.width;
    const height = masterSmall.height;
    const first = masterSmall
      .getContext("2d", { willReadFrequently: true })
      .getImageData(0, 0, width, height).data;
    const second = variantSmall
      .getContext("2d", { willReadFrequently: true })
      .getImageData(0, 0, width, height).data;
    const [left, top, right, bottom] = regionBox({ width, height }, region);
    const mask = new Uint8ClampedArray(width * height);
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const offset = (y * width + x) * 4;
        const distance = Math.max(
          Math.abs(first[offset] - second[offset]),
          Math.abs(first[offset + 1] - second[offset + 1]),
          Math.abs(first[offset + 2] - second[offset + 2]),
        );
        if (distance >= 26) mask[y * width + x] = 255;
      }
    }
    const filtered = filterMaskComponents(mask, width, height);
    const coverage = maskCoverage(filtered, width, height);
    if (coverage < 0.002) return { mask: null, coverage: 0 };
    return {
      mask: resizeMask(filtered, width, height, master.width, master.height),
      coverage,
    };
  }

  function dominantRegionMask(master, region = "whole") {
    const small = scaledCanvas(master, 480);
    const width = small.width;
    const height = small.height;
    const image = small
      .getContext("2d", { willReadFrequently: true })
      .getImageData(0, 0, width, height);
    const [left, top, right, bottom] = regionBox({ width, height }, region);
    const sampleLeft = Math.floor(left + (right - left) * 0.22);
    const sampleRight = Math.floor(right - (right - left) * 0.22);
    const sampleTop = Math.floor(top + (bottom - top) * 0.12);
    const sampleBottom = Math.floor(bottom - (bottom - top) * 0.08);
    const buckets = new Map();
    for (let y = sampleTop; y < sampleBottom; y += 2) {
      for (let x = sampleLeft; x < sampleRight; x += 2) {
        const offset = (y * width + x) * 4;
        const key = `${Math.floor(image.data[offset] / 28)},${Math.floor(image.data[offset + 1] / 28)},${Math.floor(image.data[offset + 2] / 28)}`;
        const record = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
        record.count += 1;
        record.r += image.data[offset];
        record.g += image.data[offset + 1];
        record.b += image.data[offset + 2];
        buckets.set(key, record);
      }
    }
    const candidates = [...buckets.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 18)
      .map((record) => ({
        count: record.count,
        color: [
          Math.round(record.r / record.count),
          Math.round(record.g / record.count),
          Math.round(record.b / record.count),
        ],
      }));
    let best = null;
    for (const candidate of candidates) {
      const mask = new Uint8ClampedArray(width * height);
      for (let y = top; y < bottom; y += 2) {
        for (let x = left; x < right; x += 2) {
          const offset = (y * width + x) * 4;
          const distance = Math.hypot(
            image.data[offset] - candidate.color[0],
            image.data[offset + 1] - candidate.color[1],
            image.data[offset + 2] - candidate.color[2],
          );
          if (distance <= 48) {
            mask[y * width + x] = 255;
            if (x + 1 < width) mask[y * width + x + 1] = 255;
            if (y + 1 < height) mask[(y + 1) * width + x] = 255;
          }
        }
      }
      const filtered = filterMaskComponents(mask, width, height, 0.012);
      const coverage = maskCoverage(filtered, width, height);
      if (coverage < 0.012 || coverage > 0.72) continue;
      let sumX = 0;
      let sumY = 0;
      let count = 0;
      let border = 0;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (filtered[y * width + x] < 96) continue;
          count += 1;
          sumX += x;
          sumY += y;
          if (x <= 2 || y <= 2 || x >= width - 3 || y >= height - 3) border += 1;
        }
      }
      if (!count) continue;
      const expectedY = { upper: 0.35, lower: 0.6, whole: 0.48 }[region] || 0.48;
      const score =
        coverage ** 0.7 *
        Math.max(0.08, 1 - (border / count) * 2) *
        Math.max(0.2, 1 - Math.abs(sumX / count / width - 0.5)) *
        Math.max(0.2, 1 - Math.abs(sumY / count / height - expectedY) * 2) *
        (1 + Math.min(2.5, (candidate.count / 500) ** 0.8));
      if (!best || score > best.score) best = { score, mask: filtered, coverage };
    }
    if (!best) return { mask: null, coverage: 0 };
    return {
      mask: resizeMask(best.mask, width, height, master.width, master.height),
      coverage: best.coverage,
    };
  }

  async function loadProvidedMask(blob, width, height) {
    const source = await decode(blob);
    const target = canvas(width, height);
    const context = target.getContext("2d", { willReadFrequently: true });
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(source, 0, 0, width, height);
    const image = context.getImageData(0, 0, width, height);
    const hasAlpha = source
      .getContext("2d", { willReadFrequently: true })
      .getImageData(0, 0, source.width, source.height)
      .data.some((value, index) => index % 4 === 3 && value < 250);
    const mask = new Uint8ClampedArray(width * height);
    for (let index = 0; index < mask.length; index += 1) {
      const value = hasAlpha ? image.data[index * 4 + 3] : image.data[index * 4];
      mask[index] = value < 20 ? 0 : value;
    }
    return { mask, coverage: maskCoverage(mask, width, height) };
  }

  function channelMedian(source, indices, channel) {
    if (!indices.length) return 0;
    const values = indices.map((index) => source[index * 4 + channel]).sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  }

  function applyTargetColor(variant, mask, targetHex) {
    const context = variant.getContext("2d", { willReadFrequently: true });
    const image = context.getImageData(0, 0, variant.width, variant.height);
    const source = new Uint8ClampedArray(image.data);
    const indices = [];
    for (let index = 0; index < mask.length; index += 1) {
      if (mask[index] >= 96) indices.push(index);
    }
    if (!indices.length) throw new Error("商品遮罩内没有可用于校色的像素");
    const target = hexToRgb(targetHex);
    const targetHsv = rgbToHsv(...target);
    const saturatedTarget = targetHsv[1] >= 0.12 && targetHsv[2] >= 0.08 && targetHsv[2] <= 235 / 255;
    const medians = [0, 1, 2].map((channel) => channelMedian(source, indices, channel));
    let luminanceMedian = 0;
    if (!saturatedTarget) {
      const values = indices
        .map((index) => Math.max(source[index * 4], source[index * 4 + 1], source[index * 4 + 2]))
        .sort((a, b) => a - b);
      luminanceMedian = values[Math.floor(values.length / 2)] / 255;
    }
    for (let index = 0; index < mask.length; index += 1) {
      const strength = (mask[index] / 255) * 0.96;
      if (strength <= 0) continue;
      const offset = index * 4;
      let corrected;
      if (saturatedTarget) {
        corrected = [0, 1, 2].map((channel) =>
          Math.max(0, Math.min(255, source[offset + channel] * (target[channel] / Math.max(1, medians[channel])))),
        );
      } else {
        const [hue, saturation, value] = rgbToHsv(
          source[offset],
          source[offset + 1],
          source[offset + 2],
        );
        const shiftedValue = Math.max(
          0,
          Math.min(1, value + (targetHsv[2] - luminanceMedian)),
        );
        const mixedValue = shiftedValue * 0.82 + targetHsv[2] * 0.18;
        corrected = hsvToRgb(targetHsv[0], targetHsv[1], mixedValue);
        void hue;
        void saturation;
      }
      image.data[offset] = source[offset] * (1 - strength) + corrected[0] * strength;
      image.data[offset + 1] = source[offset + 1] * (1 - strength) + corrected[1] * strength;
      image.data[offset + 2] = source[offset + 2] * (1 - strength) + corrected[2] * strength;
    }
    context.putImageData(image, 0, 0);
    return variant;
  }

  function measureColor(variant, mask) {
    const image = variant
      .getContext("2d", { willReadFrequently: true })
      .getImageData(0, 0, variant.width, variant.height);
    const candidates = [];
    for (let index = 0; index < mask.length; index += 1) {
      if (mask[index] < 96) continue;
      const offset = index * 4;
      const luminance =
        (image.data[offset] + image.data[offset + 1] + image.data[offset + 2]) / 3;
      candidates.push({
        luminance,
        rgb: [
          image.data[offset],
          image.data[offset + 1],
          image.data[offset + 2],
        ],
      });
    }
    if (!candidates.length) throw new Error("商品遮罩内没有可用于质检的像素");
    const sorted = candidates.map((item) => item.luminance).sort((a, b) => a - b);
    const low = sorted[Math.floor(sorted.length * 0.15)];
    const high = sorted[Math.floor(sorted.length * 0.9)];
    const selected = candidates
      .filter((item) => item.luminance >= low && item.luminance <= high)
      .map((item) => item.rgb);
    const source = selected.length ? selected : candidates.map((item) => item.rgb);
    return [0, 1, 2].map((channel) => {
      const values = source.map((rgb) => rgb[channel]).sort((a, b) => a - b);
      return values[Math.floor(values.length / 2)];
    });
  }

  async function makeThumbnail(blob, maximum = 320) {
    const source = await decode(blob);
    const target = contains(source, maximum, maximum);
    const compact = canvas(target.width, target.height);
    compact.getContext("2d").drawImage(target, 0, 0);
    return compact.toDataURL("image/webp", 0.82);
  }

  async function createContactSheet(items, options = {}) {
    if (!items.length) return null;
    const columns = Math.max(1, Math.min(Number(options.columns || 4), items.length));
    const tileWidth = 360;
    const tileHeight = options.labels ? 480 : 450;
    const imageHeight = options.labels ? 390 : 390;
    const rows = Math.ceil(items.length / columns);
    const target = canvas(columns * tileWidth, rows * tileHeight);
    const context = target.getContext("2d", { willReadFrequently: true });
    context.fillStyle = "#f8f6f1";
    context.fillRect(0, 0, target.width, target.height);
    for (let index = 0; index < items.length; index += 1) {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const image = await decode(items[index].blob);
      const contained = contains(image, tileWidth - 24, imageHeight - 28);
      const x = column * tileWidth + Math.floor((tileWidth - contained.width) / 2);
      const y = row * tileHeight + 14 + Math.floor((imageHeight - 28 - contained.height) / 2);
      context.drawImage(contained, x, y);
      const label = items[index].color || items[index].name || `image-${index + 1}`;
      if (options.labels && items[index].color) {
        context.fillStyle = items[index].color;
        context.fillRect(column * tileWidth, row * tileHeight + imageHeight, tileWidth, 40);
        context.fillStyle =
          items[index].color
            .slice(1)
            .match(/.{2}/g)
            .reduce((sum, value) => sum + parseInt(value, 16), 0) > 430
            ? "#141816"
            : "#f8f6f1";
      } else {
        context.fillStyle = "#2d3430";
      }
      context.font = '14px "Segoe UI", sans-serif';
      context.fillText(
        label.slice(0, 42),
        column * tileWidth + 14,
        row * tileHeight + imageHeight + 25,
      );
    }
    return toBlob(target, "image/png");
  }

  async function finalizeProductColors(masterBlob, variantBlobs, maskBlob, colors, options = {}, onProgress = null) {
    if (!variantBlobs.length) throw new Error("至少需要一张 Muse 生成结果");
    if (variantBlobs.length !== colors.length) {
      throw new Error(`生成图数量 ${variantBlobs.length} 与色号数量 ${colors.length} 不一致`);
    }
    const passLimit = Number(options.pass_limit ?? 3);
    const reviewLimit = Number(options.review_limit ?? 5);
    if (!Number.isFinite(passLimit) || !Number.isFinite(reviewLimit) || reviewLimit < passLimit) {
      throw new Error("色彩质检阈值无效");
    }
    const region = String(options.region || "whole").toLowerCase();
    if (!["whole", "upper", "lower"].includes(region)) {
      throw new Error("region 只支持 whole、upper、lower");
    }
    const master = await decode(masterBlob);
    const providedMask = maskBlob
      ? await loadProvidedMask(maskBlob, master.width, master.height)
      : null;
    const outputs = [];
    const failures = [];
    for (let index = 0; index < variantBlobs.length; index += 1) {
      const color = colors[index];
      try {
        const variant = fitCanvas(await decode(variantBlobs[index]), master.width, master.height);
        let maskResult;
        let maskSource;
        if (providedMask && providedMask.coverage >= 0.002) {
          maskResult = providedMask;
          maskSource = "provided";
        } else {
          maskResult = targetColorMask(variant, color.hex, region);
          maskSource = "target_color";
          if (!maskResult.mask || maskResult.coverage < 0.002) {
            maskResult = differenceMask(master, variant, region);
            maskSource = "difference";
          }
          if (!maskResult.mask || maskResult.coverage < 0.002) {
            maskResult = dominantRegionMask(master, region);
            maskSource = "dominant_color";
          }
        }
        if (!maskResult.mask || maskResult.coverage < 0.002) {
          throw new Error("自动识别到的商品区域不足 0.2%，请提供商品遮罩");
        }
        const rawMeasurement = measureColor(variant, maskResult.mask);
        const targetRgb = hexToRgb(color.hex);
        const museDelta = deltaE2000(rawMeasurement, targetRgb);
        const corrected = applyTargetColor(variant, maskResult.mask, color.hex);
        const measurement = measureColor(corrected, maskResult.mask);
        const deltaE = deltaE2000(measurement, targetRgb);
        const qaStatus = colorStatus(deltaE, passLimit, reviewLimit);
        const prefix = `${String(index + 1).padStart(2, "0")}-${color.hex.slice(1)}`;
        const rawBlob = await toBlob(variant, "image/png");
        const correctedBlob = await toBlob(corrected, "image/png");
        const maskBlobOut = await toBlob(canvasFromMask(maskResult.mask, master.width, master.height), "image/png");
        outputs.push(
          {
            blob: rawBlob,
            name: `${prefix}-muse-raw.png`,
            width: master.width,
            height: master.height,
            color: color.hex,
            color_name: color.name,
            variant_type: "muse_raw",
            muse_delta_e: Number(museDelta.toFixed(2)),
            coverage: Number(maskResult.coverage.toFixed(4)),
            mask_source: maskSource,
          },
          {
            blob: correctedBlob,
            name: `${prefix}.png`,
            width: master.width,
            height: master.height,
            color: color.hex,
            color_name: color.name,
            variant_type: "corrected",
            delta_e: Number(deltaE.toFixed(2)),
            muse_delta_e: Number(museDelta.toFixed(2)),
            qa_status: qaStatus,
            coverage: Number(maskResult.coverage.toFixed(4)),
            mask_source: maskSource,
          },
          {
            blob: maskBlobOut,
            name: `${prefix}-mask.png`,
            width: master.width,
            height: master.height,
            color: color.hex,
            variant_type: "mask",
          },
        );
      } catch (error) {
        failures.push({ color: color.hex, error: error.message });
      }
      onProgress?.(8 + Math.round(((index + 1) / variantBlobs.length) * 82), `已校色并质检 ${index + 1}/${variantBlobs.length}`);
    }
    const corrected = outputs.filter((item) => item.variant_type === "corrected");
    if (!corrected.length) {
      const detail = failures
        .slice(0, 2)
        .map((item) => `${item.color}: ${item.error}`)
        .join("；");
      throw new Error(
        "所有商品颜色结果均无法校色，请检查主图与遮罩" +
          (detail ? `（${detail}）` : ""),
      );
    }
    const sheet = await createContactSheet(corrected, { columns: options.sheet_columns || 4, labels: true });
    if (sheet) {
      outputs.push({
        blob: sheet,
        name: "contact-sheet.png",
        width: 360 * Math.min(Number(options.sheet_columns || 4), corrected.length),
        height: 480 * Math.ceil(corrected.length / Math.min(Number(options.sheet_columns || 4), corrected.length)),
        variant_type: "contact_sheet",
      });
    }
    const qa = {
      pass: corrected.filter((item) => item.qa_status === "pass").length,
      review: corrected.filter((item) => item.qa_status === "review").length,
      retry: corrected.filter((item) => item.qa_status === "retry").length,
    };
    return {
      outputs,
      metadata: {
        mode: "muse_product_color_finalize",
        pass_limit: passLimit,
        review_limit: reviewLimit,
        qa,
        failures,
      },
    };
  }

  async function finalizePatternBatch(baseBlob, generatedBlobs, references, options = {}, onProgress = null) {
    if (!generatedBlobs.length) throw new Error("没有可归档的印花生成图");
    if (generatedBlobs.length !== references.length) {
      throw new Error("印花生成图数量与参考图数量不一致");
    }
    const base = await decode(baseBlob);
    const outputs = [];
    for (let index = 0; index < generatedBlobs.length; index += 1) {
      const fitted = fitCanvas(await decode(generatedBlobs[index]), base.width, base.height);
      const sourceName = String(references[index]?.name || `reference-${index + 1}`);
      const safeStem = safeFilename(sourceName, `reference-${index + 1}`).replace(/\.[^.]+$/, "").slice(0, 70);
      outputs.push({
        blob: await toBlob(fitted, "image/png"),
        name: `${String(index + 1).padStart(2, "0")}-${safeStem}.png`,
        width: base.width,
        height: base.height,
        source: sourceName,
        reference_index: index + 1,
        background_mode: options.background_mode || "keep",
        variant_type: "pattern_transfer",
      });
      onProgress?.(10 + Math.round(((index + 1) / generatedBlobs.length) * 82), `已归档印花结果 ${index + 1}/${generatedBlobs.length}`);
    }
    const sheet = await createContactSheet(outputs, {
      columns: 4,
      labels: true,
    });
    if (sheet) {
      outputs.push({
        blob: sheet,
        name: "pattern-contact-sheet.png",
        width: 0,
        height: 0,
        source: "all-pattern-results",
        variant_type: "contact_sheet",
      });
    }
    return {
      outputs,
      metadata: {
        mode: "pattern_transfer_batch",
        background_mode: options.background_mode || "keep",
        reference_count: references.length,
        output_count: generatedBlobs.length,
        batch_limit_mb: options.batch_limit_mb || 24,
      },
    };
  }

  function hashText(text) {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  async function mockImage(prompt, size) {
    const { width, height } = parseSize(size);
    const seed = hashText(String(prompt || ""));
    const palettes = [
      ["#f2eee5", "#2b3632", "#da7054"],
      ["#e5eef2", "#1f3948", "#deb257"],
      ["#f4e8e4", "#4d2d36", "#779c89"],
      ["#e8efe2", "#31422b", "#c29e6a"],
    ];
    const palette = palettes[seed % palettes.length];
    const target = canvas(width, height);
    const context = target.getContext("2d");
    context.fillStyle = palette[0];
    context.fillRect(0, 0, width, height);
    for (let index = 0; index < 9; index += 1) {
      const x = ((seed >>> ((index * 3) % 24)) % width);
      const y = ((seed >>> ((index * 2 + 4) % 24)) % height);
      const radius = width / (14 + (index % 5));
      context.strokeStyle = index % 2 ? palette[1] : palette[2];
      context.lineWidth = Math.max(2, width / 220);
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.stroke();
    }
    const pad = width / 14;
    context.strokeStyle = palette[1];
    context.lineWidth = Math.max(2, width / 350);
    context.strokeRect(pad, pad, width - pad * 2, height - pad * 2);
    context.fillStyle = palette[1];
    context.fillRect(width * 0.23, height * 0.27, width * 0.54, height * 0.46);
    context.fillStyle = palette[2];
    context.beginPath();
    context.ellipse(width * 0.5, height * 0.36, width * 0.1, height * 0.09, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = palette[0];
    context.font = `600 ${Math.max(12, Math.floor(width / 55))}px sans-serif`;
    context.fillText("VISUAL FORGE / EXTENSION DEMO", pad * 1.5, height - pad * 2.4);
    const snippet = String(prompt || "").slice(0, 80);
    context.fillText(snippet, pad * 1.5, height - pad * 1.7);
    return toBlob(target, "image/png");
  }

  async function buildProductVariants(options, provider, onProgress = null, waitIfPaused = null) {
    const variants = buildPromptVariants(
      options.prompt,
      options.count,
      options.prompts,
    );
    const size = options.size || "1024x1024";
    const quality = options.quality || "high";
    parseSize(size);
    const outputs = [];
    for (let index = 0; index < variants.length; index += 1) {
      await waitIfPaused?.();
      const variant = variants[index];
      const blob = await provider.generate(variant.prompt, size, quality);
      const source = await decode(blob);
      outputs.push({
        blob: await toBlob(source, "image/png"),
        name: `${String(index + 1).padStart(2, "0")}-${variant.direction}.png`,
        width: source.width,
        height: source.height,
        direction: variant.direction,
        prompt: variant.prompt,
        variant_type: "product_variant",
      });
      onProgress?.(Math.round(((index + 1) / variants.length) * 95), `已生成图片 ${index + 1}/${variants.length}`);
    }
    return {
      outputs,
      metadata: {
        mode: "product_text_to_image_variations",
        provider: provider.name,
        model: provider.model || null,
        base_prompt: options.prompt || "",
        count: outputs.length,
        size,
        quality,
        directions: variants.map((item) => item.direction),
      },
    };
  }

  return {
    VARIATION_DIRECTIONS,
    buildPromptVariants,
    buildProductVariants,
    colorStatus,
    createContactSheet,
    decode,
    deltaE2000,
    finalizePatternBatch,
    finalizeProductColors,
    hexToRgb,
    makeThumbnail,
    mockImage,
    normalizeColor,
    normalizeColors,
    normalizeProductColors,
    parseSize,
    recolorLogo,
    rgbToHex,
    rgbToHsv,
    safeFilename,
    srgbToLab,
    toBlob,
  };
});

(function attachLocalCore(root, factory) {
  const promptTemplates =
    typeof module === "object" && module.exports
      ? require("./prompt-templates.js")
      : root?.VisualForgePromptTemplates;
  const api = factory(promptTemplates);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.VisualForgeCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCore(promptTemplates) {
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

  const COPY_DIRECTIONS = [
    [
      "copy_1",
      "本张使用大尺度抽象块面印花，背景采用与印花主色一致的干净商业棚拍空间。",
    ],
    [
      "copy_2",
      "本张使用细密水彩晕染印花，背景使用同色系织物、柔和渐变和自然氛围光。",
    ],
    [
      "copy_3",
      "本张使用对称几何图腾印花，背景使用与印花线条一致的现代室内陈列。",
    ],
    [
      "copy_4",
      "本张使用复古插画式印花，背景使用带有年代感的家具、纹理和暖色灯光。",
    ],
    [
      "copy_5",
      "本张使用手绘涂鸦拼贴印花，背景使用与图案颜色呼应的街头或工作室场景。",
    ],
    [
      "copy_6",
      "本张使用条纹与波浪组合印花，背景使用同色块面、弧形道具和有节奏的构图。",
    ],
    [
      "copy_7",
      "本张使用星空渐变与颗粒纹理印花，背景使用同色夜空、柔和色块和哑光布景。",
    ],
    [
      "copy_8",
      "本张使用节日雪花和礼物图形印花，背景使用同风格的克制节日装饰与暖光。",
    ],
  ];

  const YABI_MOTO_DIRECTIONS = [
    [
      "y2k_flat",
      "本张采用亚比 Y2K 视觉：冷银灰、纯黑与酸性绿哑光平涂，机械粗体字、机车贴纸和细密箭头全部作为矢量印花；背景使用冷色工业车库、灯管和轻微烟尘，保持哑光、无高光。",
    ],
    [
      "moto_cross",
      "本张采用机车越野视觉：赛车编号、黑白棋盘格、火焰、闪电、赞助商式贴章和速度线作为哑光平面印花，搭配橙红、安全黄和深黑；背景使用越野赛道、护栏和轮胎痕迹。",
    ],
    [
      "punk_patchwork",
      "本张采用朋克亚比视觉：拼贴错位印花、别针线稿、环扣线稿、格纹、手写涂鸦和套版偏移效果，颜色使用黑红、脏粉和灰白；背景使用地下俱乐部、铁丝网和闪光灯。",
    ],
    [
      "cyber_industrial",
      "本张采用赛博机能视觉：电路、危险警示条、工业编号、锁扣轮廓和模块化分区线稿全部作为哑光平面印花，颜色使用冰蓝、荧光绿和石墨黑；背景使用冷光机房通道。",
    ],
    [
      "grunge_street",
      "本张采用街头颓废视觉：撕裂海报、报纸网点和喷漆叠印、手绘骷髅或蝴蝶元素，颜色使用煤黑、漂白灰、酒红和脏黄色；背景使用潮湿街巷、涂鸦墙和硬闪光。",
    ],
    [
      "gothic_racing",
      "本张采用暗黑赛车视觉：哥特字体、翼形徽章、十字星、红色速度线、棋盘旗和徽章图案全部作为哑光平面印花，颜色使用黑、血红、枪灰；背景使用夜间赛道、红色尾灯和低机位大片构图。",
    ],
    [
      "acid_rave",
      "本张采用酸性锐舞视觉：荧光绿、电光紫、液态网格、扭曲棋盘格、CD 光盘纹理和超现实符号；背景使用霓虹夜店、激光烟雾和极限广角。",
    ],
    [
      "glam_wild",
      "本张采用张扬亚文化视觉：蛇纹、豹纹、羽毛、蕾丝、机车元素和高饱和徽章全部转译为哑光平涂印花；背景使用后台化妆间、简洁衣架和直闪摄影。",
    ],
    [
      "butterfly_motif",
      "本张采用蝴蝶与赛车火焰组合：灰白蝴蝶剪影、火焰描边、星形色块和锐利粗体字作为哑光平面印花，颜色使用冷灰、电紫和黑色；背景使用夜店色块墙和紫色激光。",
    ],
    [
      "tartan_punk",
      "本张采用苏格兰格纹朋克视觉：红黑格纹、别针线稿、皮扣轮廓、破洞边缘印花、骷髅贴片图案和粗粝网版效果；背景使用地下演出现场、音箱和硬闪光。",
    ],
    [
      "gothic_coquette",
      "本张采用暗黑甜酷视觉：黑色蕾丝、十字架、玫瑰、蝴蝶结、细小哥特字和灰白饰件线稿全部作为哑光平面印花，颜色使用黑、酒红和脏粉；背景使用复古哥特房间与冷色闪光。",
    ],
    [
      "acid_graffiti",
      "本张采用酸性涂鸦视觉：荧光绿和紫色喷漆、扭曲字体、笑脸符号、网格与故障条纹，背景使用高饱和街头涂鸦和夜店烟雾。",
    ],
    [
      "snake_scale",
      "本张采用蛇鳞图形视觉：银灰与黑色蛇鳞、荧光描边、粗体字和锐利弧形图形作为哑光平面印花，背景使用冷色布景与蛇形道具。",
    ],
    [
      "mecha_anime",
      "本张采用机甲动画视觉：机械编号、护甲分区线稿、日系漫画速度线、机器人眼睛和警告标签作为哑光平面印花，颜色使用蓝白、荧光黄和枪灰；背景使用虚构维修机库。",
    ],
    [
      "rave_cd",
      "本张采用 Y2K 锐舞视觉：光盘同心圆、星形色块、耳机、像素图案、泡泡字和颗粒网点作为哑光平面印花，背景使用蓝紫激光、纯色地板和烟雾。",
    ],
    [
      "utility_tactical",
      "本张采用战术机能视觉：口袋轮廓、织带、插扣、警示条、工业编号和模块化挂件线稿全部作为哑光平面印花，背景使用封闭车库、工业卷帘门和冷硬侧光。",
    ],
    [
      "cyber_cowboy",
      "本张采用赛博牛仔视觉：徽章图案、西部刺绣纹样、机车皮带图案、数字像素和做旧丹宁印花，背景使用霓虹沙地与西部围栏。",
    ],
    [
      "racing_flame",
      "本张采用火焰赛车视觉：大面积火焰、轮胎烟、速度线和赛车编号，颜色使用黑、红、橙和冷灰；背景使用夜间赛道与动态追拍。",
    ],
    [
      "distressed_denim",
      "本张采用破坏丹宁风视觉：漂白褪色、磨损痕迹、毛边、拼接丹宁和圆点排列全部作为哑光平面印花图形，背景使用混凝土墙面和冷硬直闪。",
    ],
    [
      "hardware_line",
      "本张采用工业配件线稿视觉：孔眼、拉链、D 形扣和环扣全部作为单色矢量印花图形，背景使用工业格栅与低角度硬光。",
    ],
    [
      "futuristic_sport",
      "本张采用未来运动视觉：流线护甲轮廓、功能分区、发光线条和极简编号作为平面印花，背景使用冷白运动实验室与蓝色扫描光。",
    ],
    [
      "alt_preppy",
      "本张采用叛逆学院视觉：格纹、领带、徽章图案和破损针织纹理作为哑光平面印花，搭配黑红撞色；背景使用夜间校园与闪光灯。",
    ],
    [
      "gothic_patch",
      "本张采用哥特补丁视觉：黑色徽章、十字架、玫瑰、灰白线条和错位缝线作为平面印花，背景使用深色石墙与冷雾。",
    ],
    [
      "neon_cyber",
      "本张采用高饱和霓虹赛博视觉：青蓝和洋红高饱和线条、电路纹样、叠色和扫描故障作为哑光平面印花，背景使用未来街机空间。",
    ],
    [
      "biker_graphic",
      "本张采用机车图形视觉：深色块面、环扣线稿、束带、拉链和硬朗肩线全部作为哑光平面印花图形，背景使用地下车库与冷暖混合光。",
    ],
    [
      "spray_stencil",
      "本张采用喷漆模板视觉：工业喷字、漏印边缘、编号、飞漆和城市标记，背景使用粗粝墙面与直闪。",
    ],
    [
      "skull_wing",
      "本张采用骷髅翼图形视觉：机车骷髅、羽翼、火焰徽章和粗线描边作为哑光平面印花，背景使用夜间公路与红色尾灯。",
    ],
    [
      "color_gradient",
      "本张采用柔和渐变印花视觉：低饱和色带、叠色与未来运动图形全部作为哑光平面印花，背景使用纯色棚和彩色补光。",
    ],
    [
      "wasteland",
      "本张采用废土亚比视觉：做旧布面、拼接痕迹、防毒面罩和沙尘全部转译为哑光平面印花图形与警示图案，背景使用荒废工业区。",
    ],
    [
      "street_football",
      "本张采用街头球衣视觉：超大号码、队徽式图形、网眼半调纹理和广告赞助贴章作为平面印花，背景使用夜间球场与硬闪光。",
    ],
    [
      "laser_grid",
      "本张采用激光网格视觉：透视网格、扫描线、粗体字和荧光轮廓作为哑光平面印花，背景使用蓝紫激光空间与烟雾。",
    ],
    [
      "biomech",
      "本张采用生物机械视觉：骨骼、机械关节、异形肌理和徽章全部作为哑光平面插画印花，背景使用冷白实验空间与绿色背光。",
    ],
  ];

  const STREET_DIRECTIONS = [
    ["graffiti", "本张采用大体量涂鸦喷漆、气泡字、街头签名和喷涂飞溅，背景使用城市墙面与硬闪光。"],
    ["skate", "本张采用滑板贴纸、棋盘格、磨损印花和卡通恶搞图形，背景使用滑板场地与广角低机位。"],
    ["racing", "本张采用赛车服式大色块、编号、速度线和赞助商贴章平面印花，背景使用工业车库和轮胎道具。"],
    ["archive", "本张采用档案式网版印刷、旧报纸纹理、褪色照片和手写编号，背景使用工业仓库冷光。"],
    ["techno", "本张采用科技网格、警示符号、粗体编号和荧光色块平面印花，背景使用赛博夜店和激光。"],
    ["hiphop", "本张采用夸张粗体字、徽章、刺绣贴布图案和高对比色块平面印花，背景使用城市夜景和直接闪光。"],
    ["punk", "本张采用拼贴、撕裂痕迹、别针线稿、环扣线稿和格纹平面印花，背景使用地下演出现场。"],
    ["future", "本张采用叠色和未来运动图形平面印花，背景使用冷白实验室与蓝紫光。"],
  ];

  const DARK_TECH_DIRECTIONS = [
    ["blackout", "本张采用全黑机能视觉、警示织带图案、隐藏编号和护甲线稿平面印花。"],
    ["hazard", "本张采用黑黄警示条、危险标识、工业模块和硬朗机械结构。"],
    ["stealth", "本张采用深灰隐身技术风、低对比电路线和细线平面印花。"],
    ["reactor", "本张采用反应堆能量纹、冰蓝发光线和机械舱室背景。"],
    ["carbon", "本张采用斜纹网线、拉链轨道、战术口袋轮廓和冷灰色块平面印花。"],
    ["signal", "本张采用故障信号、扫描线、数据碎片和紫蓝电子噪点。"],
    ["armor", "本张采用模块化护甲分区、锁扣和圆点排列的平面线稿图案，搭配工业编号。"],
    ["night", "本张采用夜间机能广告大片、雨雾氛围和强轮廓光。"],
  ];

  const PROMPT_LED_DIRECTIONS = [
    ["closeup_flash", "本张使用紧贴商品的广角裁切和硬闪光，放大印花尺度与平面色块层次。"],
    ["low_angle", "本张使用低机位仰拍和夸张透视，让服装形成强轮廓与速度感。"],
    ["macro_material", "本张使用微距局部构图，把平面印花、原有绒毛、原有缝线和原有五金细节作为视觉主角。"],
    ["graphic_shadow", "本张使用硬光投影和几何色块，让背景与人造阴影共同构成平面图形。"],
    ["environment", "本张把商品放入有明确故事的环境，但保留商品为第一视觉焦点。"],
    ["color_gel", "本张使用双色补光和彩色阴影，形成高对比、非日常的摄影氛围。"],
    ["motion", "本张加入适度运动模糊、飘动面料或动态配件，强调穿着瞬间的速度感。"],
    ["surreal_prop", "本张使用尺度夸张、结构超现实的普通哑光道具，建立仍能读懂的商品场景。"],
    ["collage_space", "本张使用拼贴式前后景和层叠空间，避免单层棚拍背景。"],
    ["editorial_close", "本张使用时装杂志式半身构图，强调造型、裁切和姿态的画面张力。"],
    ["color_block_set", "本张使用纯色块、哑光几何道具和柔和投影，延展商品配色和印花图形。"],
    ["night_street", "本张使用夜间街景、混合光源和真实城市质感。"],
    ["clean_modern", "本张保持干净背景，但通过当代雕塑道具、偏轴构图和精确光比避免普通商拍感。"],
    ["wide_stage", "本张使用超宽空间和大面积负形，让商品在安静画面中形成强视觉锚点。"],
    ["texture_layering", "本张重复使用一种核心印花纹样和平面色块，从商品图案延伸到背景与前景。"],
    ["campaign_poster", "本张使用强焦点、清晰层级和大胆留白，形成当代广告海报般的视觉记忆点。"],
  ];

  const COPY_STYLE_PACKS = {
    auto: PROMPT_LED_DIRECTIONS,
    balanced: COPY_DIRECTIONS,
    yabi_moto: YABI_MOTO_DIRECTIONS,
    street: STREET_DIRECTIONS,
    dark_tech: DARK_TECH_DIRECTIONS,
    all: [
      ...YABI_MOTO_DIRECTIONS,
      ...STREET_DIRECTIONS,
      ...DARK_TECH_DIRECTIONS,
      ...PROMPT_LED_DIRECTIONS,
      ...COPY_DIRECTIONS,
    ],
  };

  const PANTS_BASE_PALETTE = [
    ["#34383B", "深炭灰"],
    ["#24364B", "深海蓝"],
    ["#5A2A2A", "暗酒红"],
    ["#4B5320", "橄榄绿"],
    ["#6B4A2F", "焦糖棕"],
    ["#4A3B63", "雾紫"],
    ["#2D4F4A", "深青"],
    ["#8A5A44", "砖棕"],
    ["#6D4C5D", "灰梅"],
    ["#3D3F56", "午夜蓝"],
  ];
  const PRODUCT_BASE_PALETTE = PANTS_BASE_PALETTE;

  function pickProductBaseColors(count, random = Math.random) {
    const amount = Math.max(1, Number(count) || 1);
    const selected = [];
    while (selected.length < amount) {
      const cycle = shuffleDirections(PRODUCT_BASE_PALETTE, random);
      selected.push(...cycle);
    }
    return selected.slice(0, amount);
  }

  const pickPantsBaseColors = pickProductBaseColors;

  function shuffleDirections(source, random = Math.random) {
    const directions = [...source];
    for (let index = directions.length - 1; index > 0; index -= 1) {
      const target = Math.floor(random() * (index + 1));
      [directions[index], directions[target]] = [
        directions[target],
        directions[index],
      ];
    }
    return directions;
  }

  function resolveCopyStylePack(stylePack, instruction = "") {
    const requested = String(stylePack || "auto").trim();
    if (requested !== "auto") {
      const directions = COPY_STYLE_PACKS[requested];
      if (!directions) throw new Error(`未知风格包：${requested}`);
      return {
        key: requested,
        directions:
          requested === "all" ? shuffleDirections(directions) : directions,
      };
    }
    const text = normalizeCopyInstruction(instruction).toLowerCase();
    if (
      /(?:亚比|y2k|机车|赛车|朋克|赛博|机能|rave|锐舞|机甲|哥特|蛇纹|铬色)/i.test(
        text,
      )
    ) {
      return { key: "yabi_moto", directions: YABI_MOTO_DIRECTIONS };
    }
    if (/(?:街头|涂鸦|滑板|嘻哈|hip.?hop|street|graffiti)/i.test(text)) {
      return { key: "street", directions: STREET_DIRECTIONS };
    }
    if (/(?:暗黑|战术|工业|装甲|反光|blackout|tactical)/i.test(text)) {
      return { key: "dark_tech", directions: DARK_TECH_DIRECTIONS };
    }
    return { key: "auto", directions: PROMPT_LED_DIRECTIONS };
  }

  const PRINT_ONLY_CONSTRAINT =
    "【工厂平面印花约束】商品本体只允许改变表面的平面印花、图案、配色和视觉纹理，" +
    "必须沿用原商品的面料、版型、厚度、软硬、光泽、结构和全部物理细节。" +
    "严禁新增或改变任何物理结构、配件、口袋、绑带或装饰件。" +
    "印花必须像普通染料墨水一样哑光平涂、清晰套色、无光泽、无浮凸、无立体感，只呈现二维矢量或网点图形。" +
    "禁止任何依赖特殊材料、特殊油墨或后整理工艺才能实现的视觉效果。" +
    "参考图只用于提取印花图案、线稿、配色和平面明暗，不得把参考图中的立体结构、材质或工艺当作设计目标。" +
    "背景同样使用普通哑光布景，不渲染特殊表面效果，并必须让人清楚看出商品本身没有被改变结构或材质。";

  function ensurePrintOnlyConstraint(prompt) {
    const text = String(prompt || "").trim();
    if (!text) return text;
    if (text.includes("【工厂平面印花约束】")) return text;
    return `${text}\n${PRINT_ONLY_CONSTRAINT}`;
  }

  function copyBackgroundInstruction(mode) {
    if (mode === "keep") {
      return (
        "严格保持原主图的背景、墙面、地面、空间结构、色调、道具、光线和阴影，" +
        "不得改变或替换背景。"
      );
    }
    return (
      "背景必须真正改变为与当前印花风格一致的新场景、纹理、色彩、道具和光影；" +
      "不得保留原主图背景，也不得只做轻微调色或局部虚化。"
    );
  }

  const DEFAULT_COPY_PROMPT_TEMPLATE =
    promptTemplates?.DEFAULTS?.copy ||
    "第一张附件是当前商品主图。商品类目：{{category_name}}。" +
      "只改变允许平面印花区域的图案和底布颜色，保留商品结构、版型、面料和印花以外区域。" +
      "用户补充描述：{{instruction}}。印花方向：{{visual_instruction}}。" +
      "背景处理：{{background_instruction}}" +
      "本批输出 {{batch_count}} 张独立商品图。" +
      PRINT_ONLY_CONSTRAINT;

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
        prompt: ensurePrintOnlyConstraint(prompt),
      }));
    }
    return Array.from({ length: amount }, (_, index) => {
      const [direction, description] =
        VARIATION_DIRECTIONS[index % VARIATION_DIRECTIONS.length];
      return {
        direction,
        prompt: ensurePrintOnlyConstraint(
          `${normalized}. ${description} ${FIDELITY}`,
        ),
      };
    });
  }

  function normalizeCopyInstruction(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(
        /^(?:请|请把|请将|把|将)?(?:图片|主图|商品|产品)?(?:变为|改成|换成|修改为)\s*[：:]?\s*/,
        "",
      )
      .trim();
  }

  function resolveCategoryContext(value, instruction) {
    if (promptTemplates?.productCategoryValues) {
      return promptTemplates.productCategoryValues(value, instruction);
    }
    return {
      key: "auto",
      label: "自动识别 / 通用商品",
      category_name: "当前商品",
      category_print_area: "商品表面允许印花的区域",
      category_base_surface: "商品表面底色区域",
      category_protected_area: "商品的材质、结构、配件和印花以外的区域",
      category_model_region: "与商品类型对应的穿着区域",
      excluded_categories: [],
    };
  }

  function buildCopyVariationPrompts(
    instruction,
    count,
    template = DEFAULT_COPY_PROMPT_TEMPLATE,
    stylePack = "auto",
    backgroundMode = "match",
    categoryValue = "auto",
  ) {
    const target = normalizeCopyInstruction(instruction);
    const amount = Number(count);
    if (!Number.isSafeInteger(amount) || amount < 1) {
      throw new Error("单任务总请求数必须是大于 0 的整数");
    }
    const sourceTemplate = String(template || "").trim();
    if (!sourceTemplate) throw new Error("提示词模板不能为空");
    if (sourceTemplate.length > 12000) {
      throw new Error("提示词模板不能超过 12000 个字符");
    }
    const unknownVariables = [
      ...sourceTemplate.matchAll(/\{\{([a-z_]+)\}\}/g),
    ]
      .map((match) => match[1])
      .filter(
        (name) =>
          ![
            "instruction",
            "index",
            "total",
            "direction",
            "visual_instruction",
            "batch_count",
            "background_instruction",
            "category_name",
            "category_print_area",
            "category_base_surface",
            "category_protected_area",
            "category_model_region",
          ].includes(name),
      );
    if (unknownVariables.length) {
      throw new Error(
        `提示词模板包含未知变量：${[
          ...new Set(unknownVariables),
        ].map((name) => `{{${name}}}`).join("、")}`,
      );
    }
    const { directions } = resolveCopyStylePack(stylePack, target);
    const category = resolveCategoryContext(categoryValue, target);
    const baseColors = pickProductBaseColors(amount);
    return Array.from({ length: amount }, (_, index) => {
      const [direction, visualInstruction] =
        directions[index % directions.length];
      const [baseHex, baseName] = baseColors[index];
      const baseConstraint =
        `【底布处理】把${category.category_base_surface}改为 ${baseHex}（${baseName}），` +
        "印花叠加在该底色上；" +
        "背景不得使用纯色，应根据印花风格生成协调的场景、纹理、色彩和光影；保持原图构图和商品位置。";
      let prompt = sourceTemplate.replace(
        /\{\{(instruction|index|total|direction|visual_instruction|batch_count|background_instruction|category_name|category_print_area|category_base_surface|category_protected_area|category_model_region)\}\}/g,
        (_, name) => {
          const values = {
            instruction: target,
            index: String(index + 1),
            total: String(amount),
            direction,
            visual_instruction:
              `${visualInstruction} ${baseConstraint}`,
            batch_count: "1",
            background_instruction:
              copyBackgroundInstruction(backgroundMode),
            category_name: category.category_name,
            category_print_area: category.category_print_area,
            category_base_surface: category.category_base_surface,
            category_protected_area: category.category_protected_area,
            category_model_region: category.category_model_region,
          };
          return values[name] ?? "";
        },
      );
      if (!prompt.includes("【底布处理】")) {
        prompt += `\n${baseConstraint}`;
      }
      if (!prompt.includes("背景处理：")) {
        prompt += `\n背景处理：${copyBackgroundInstruction(backgroundMode)}`;
      }
      prompt =
        promptTemplates?.ensureProductCategoryConstraint?.(
          prompt,
          category.key,
          target,
        ) || prompt;
      return {
        direction,
        category: category.key,
        task_index: index + 1,
        prompt: ensurePrintOnlyConstraint(prompt),
      };
    });
  }

  function buildDirectCopyPrompts(prompt, count) {
    const directPrompt = String(prompt || "").trim();
    if (!directPrompt) throw new Error("直接发送模式下不能为空");
    const amount = Number(count);
    if (!Number.isSafeInteger(amount) || amount < 1) {
      throw new Error("单任务总请求数必须是大于 0 的整数");
    }
    return Array.from({ length: amount }, (_, index) => ({
      direction: `direct_${index + 1}`,
      task_index: index + 1,
      prompt: directPrompt,
    }));
  }

  function buildCopyBatchPrompts(
    instruction,
    batchSize,
    requestCount,
    template = DEFAULT_COPY_PROMPT_TEMPLATE,
    stylePack = "auto",
    backgroundMode = "match",
    categoryValue = "auto",
  ) {
    const target = normalizeCopyInstruction(instruction);
    const imagesPerBatch = Number(batchSize);
    const batchesCount = Number(requestCount);
    if (
      !Number.isInteger(imagesPerBatch) ||
      imagesPerBatch < 1 ||
      imagesPerBatch > 4
    ) {
      throw new Error("单次返回张数需在 1 到 4 之间");
    }
    if (!Number.isSafeInteger(batchesCount) || batchesCount < 1) {
      throw new Error("请求次数必须是大于 0 的整数");
    }
    const sourceTemplate = String(template || "").trim();
    if (!sourceTemplate) throw new Error("提示词模板不能为空");
    if (sourceTemplate.length > 12000) {
      throw new Error("提示词模板不能超过 12000 个字符");
    }
    const { directions } = resolveCopyStylePack(stylePack, target);
    const category = resolveCategoryContext(categoryValue, target);
    return Array.from({ length: batchesCount }, (_, batchIndex) => {
      const baseColors = pickProductBaseColors(imagesPerBatch);
      const variants = Array.from({ length: imagesPerBatch }, (_, index) => {
        const globalIndex = batchIndex * imagesPerBatch + index;
        const [direction, visualInstruction] =
          directions[globalIndex % directions.length];
        return {
          direction,
          task_index: globalIndex + 1,
          visual_instruction:
            `${visualInstruction} 【底布处理】把${category.category_base_surface}改为 ` +
            `${baseColors[index][0]}（${baseColors[index][1]}），印花叠加在该底色上；` +
            "背景不得使用纯色，应根据印花风格生成协调场景；保持原图构图和商品位置。",
        };
      });
      const visualInstruction = variants
        .map(
          (variant, index) =>
            `画面 ${index + 1}（${variant.direction}）：${variant.visual_instruction}`,
        )
        .join("\n");
      const values = {
        instruction: target,
        index: String(batchIndex + 1),
        total: String(batchesCount),
        batch_count: String(imagesPerBatch),
        direction: variants.map((variant) => variant.direction).join(", "),
        visual_instruction: visualInstruction,
        background_instruction: copyBackgroundInstruction(backgroundMode),
        category_name: category.category_name,
        category_print_area: category.category_print_area,
        category_base_surface: category.category_base_surface,
        category_protected_area: category.category_protected_area,
        category_model_region: category.category_model_region,
      };
      let prompt = sourceTemplate.replace(
        /\{\{(instruction|index|total|direction|visual_instruction|batch_count|background_instruction|category_name|category_print_area|category_base_surface|category_protected_area|category_model_region)\}\}/g,
        (_, name) => String(values[name] ?? ""),
      );
      if (!sourceTemplate.includes("{{batch_count}}")) {
        prompt +=
          `\n\n本批必须输出 ${imagesPerBatch} 张相互独立的商品图，` +
          "禁止拼图、九宫格或将多张图合成一张。";
      }
      if (!prompt.includes("【底布处理】")) {
        prompt +=
          `\n【底布处理】把${category.category_base_surface}按画面分别改为：${baseColors
            .map(
              (base, index) =>
                `画面 ${index + 1} 使用 ${base[0]}（${base[1]}）`,
            )
            .join("；")}；印花叠加在底色上。背景不得使用纯色，应根据印花风格生成协调场景；保持原图构图和商品位置。`;
      }
      if (!prompt.includes("背景处理：")) {
        prompt += `\n背景处理：${copyBackgroundInstruction(backgroundMode)}`;
      }
      prompt = ensurePrintOnlyConstraint(prompt);
      prompt =
        promptTemplates?.ensureProductCategoryConstraint?.(
          prompt,
          category.key,
          target,
        ) || prompt;
      return {
        batch_index: batchIndex + 1,
        variants,
        category: category.key,
        prompt,
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

  function logoColorMask(data, sourceHex, tolerance = 18) {
    const [sourceR, sourceG, sourceB] = hexToRgb(sourceHex);
    const threshold = Math.max(2, Math.min(96, Number(tolerance) || 18));
    const mask = new Uint8ClampedArray(data.length / 4);
    const softEdge = threshold * 0.45;
    for (let offset = 0, index = 0; offset < data.length; offset += 4, index += 1) {
      if (data[offset + 3] === 0) continue;
      const red = data[offset] - sourceR;
      const green = data[offset + 1] - sourceG;
      const blue = data[offset + 2] - sourceB;
      const distance = Math.sqrt(
        red * red * 0.299 + green * green * 0.587 + blue * blue * 0.114,
      );
      if (distance > threshold) continue;
      mask[index] =
        distance <= softEdge
          ? 255
          : Math.round((1 - (distance - softEdge) / (threshold - softEdge)) * 255);
    }
    return mask;
  }

  async function recolorImageLogos(
    source,
    targetColor,
    sourceColor,
    options = {},
    onProgress = null,
    maskBlob = null,
  ) {
    const targetHex = normalizeColor(targetColor);
    const sourceColors = normalizeColors(sourceColor, 12);
    const tolerance = Math.max(
      2,
      Math.min(96, Number(options.tolerance ?? 18) || 18),
    );
    const decoded = await decode(source);
    const output = canvas(decoded.width, decoded.height);
    const context = output.getContext("2d", { willReadFrequently: true });
    context.drawImage(decoded, 0, 0);
    const image = context.getImageData(0, 0, output.width, output.height);
    const colorMask = new Uint8ClampedArray(image.data.length / 4);
    for (const sourceHex of sourceColors) {
      const matches = logoColorMask(image.data, sourceHex, tolerance);
      for (let index = 0; index < matches.length; index += 1) {
        colorMask[index] = Math.max(colorMask[index], matches[index]);
      }
    }
    const providedMask = maskBlob
      ? await loadProvidedMask(maskBlob, output.width, output.height)
      : null;
    const mask = new Uint8ClampedArray(colorMask.length);
    for (let index = 0; index < colorMask.length; index += 1) {
      mask[index] = providedMask
        ? Math.round((colorMask[index] * providedMask.mask[index]) / 255)
        : colorMask[index];
    }
    const [targetR, targetG, targetB] = hexToRgb(targetHex);
    let matchedPixels = 0;
    for (let index = 0; index < mask.length; index += 1) {
      const weight = mask[index] / 255;
      if (!weight) continue;
      matchedPixels += 1;
      const offset = index * 4;
      image.data[offset] += (targetR - image.data[offset]) * weight;
      image.data[offset + 1] += (targetG - image.data[offset + 1]) * weight;
      image.data[offset + 2] += (targetB - image.data[offset + 2]) * weight;
    }
    if (!matchedPixels || matchedPixels / mask.length < 0.00003) {
      throw new Error(
        providedMask
          ? "遮罩内没有找到与原 Logo 颜色匹配的像素，请检查遮罩、原色或容差"
          : "主图中没有找到与原 Logo 颜色匹配的像素，请重新吸色、增加原色或提高容差",
      );
    }
    context.putImageData(image, 0, 0);
    onProgress?.(75, `已识别 ${matchedPixels} 个 Logo 像素`);
    const sourceStem = safeFilename(source.name || "product")
      .replace(/\.[^.]+$/, "")
      .slice(0, 70);
    const maskCanvas = canvasFromMask(mask, output.width, output.height);
    return {
      outputs: [
        {
          blob: await toBlob(output, "image/png"),
          name: `${sourceStem}-logo-${targetHex.slice(1)}.png`,
          width: output.width,
          height: output.height,
          color: targetHex,
          variant_type: "logo_image",
        },
        {
          blob: await toBlob(maskCanvas, "image/png"),
          name: `${sourceStem}-logo-mask.png`,
          width: output.width,
          height: output.height,
          color: targetHex,
          variant_type: "logo_mask",
        },
      ],
      metadata: {
        mode: "product_image_logo_recolor",
        source_colors: sourceColors,
        target_color: targetHex,
        tolerance,
        mask_source: providedMask
          ? "provided_and_source_color"
          : "source_color",
        coverage: Number(
          (matchedPixels / Math.max(1, output.width * output.height)).toFixed(6),
        ),
      },
    };
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
        category: options.category || "auto",
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

  async function mockImageEdit(prompt, size, sourceBlob, variantIndex = null) {
    const { width, height } = parseSize(size);
    const source = await decode(sourceBlob);
    const seed = hashText(String(prompt || ""));
    const directionNames = VARIATION_DIRECTIONS.map(([name]) => name);
    const directionIndex = directionNames.findIndex((name) =>
      String(prompt).toLowerCase().includes(name),
    );
    const variation =
      Number.isInteger(variantIndex)
        ? ((variantIndex % 4) + 4) % 4
        : directionIndex >= 0
          ? directionIndex % 4
          : seed % 4;
    const palettes = [
      ["#e9edf2", "#18395b", "#d5a15f"],
      ["#efe7df", "#5b3126", "#ca765f"],
      ["#e6eee7", "#234438", "#ac8670"],
      ["#ebe7f1", "#3a3157", "#d0a0a8"],
    ];
    const [background, ink, accent] = palettes[variation];
    const target = canvas(width, height);
    const context = target.getContext("2d");
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, background);
    gradient.addColorStop(1, "#ffffff");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.globalAlpha = 0.24;
    context.fillStyle = accent;
    if (variation === 0) {
      context.beginPath();
      context.arc(width * 0.2, height * 0.22, width * 0.2, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = ink;
      context.fillRect(width * 0.06, height * 0.72, width * 0.88, height * 0.2);
    } else if (variation === 1) {
      context.fillRect(0, 0, width * 0.24, height);
      context.fillStyle = ink;
      context.beginPath();
      context.arc(width * 0.86, height * 0.82, width * 0.26, 0, Math.PI * 2);
      context.fill();
    } else if (variation === 2) {
      context.fillStyle = ink;
      context.beginPath();
      context.moveTo(0, 0);
      context.lineTo(width * 0.58, 0);
      context.lineTo(0, height * 0.68);
      context.closePath();
      context.fill();
      context.fillStyle = accent;
      context.fillRect(width * 0.78, height * 0.12, width * 0.14, height * 0.68);
    } else {
      context.fillStyle = accent;
      context.beginPath();
      context.arc(width * 0.5, height * 0.5, width * 0.42, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = ink;
      context.fillRect(0, height * 0.84, width, height * 0.16);
    }
    context.globalAlpha = 1;

    const stageWidth = width * (variation === 2 ? 0.68 : 0.74);
    const stageHeight = height * (variation === 1 ? 0.7 : 0.76);
    const stageX =
      variation === 1 ? width * 0.17 : (width - stageWidth) / 2;
    const stageY =
      variation === 3 ? height * 0.1 : (height - stageHeight) / 2;
    context.save();
    context.shadowColor = "rgba(0,0,0,.25)";
    context.shadowBlur = width * 0.035;
    context.shadowOffsetY = height * 0.025;
    context.fillStyle = "rgba(255,255,255,.92)";
    context.beginPath();
    context.roundRect(stageX, stageY, stageWidth, stageHeight, width * 0.02);
    context.fill();
    context.restore();
    const contained = contains(source, stageWidth - 24, stageHeight - 24);
    context.drawImage(
      contained,
      stageX + (stageWidth - contained.width) / 2,
      stageY + (stageHeight - contained.height) / 2,
    );
    return toBlob(target, "image/png");
  }

  async function buildProductVariants(
    options,
    provider,
    sourceBlob,
    onProgress = null,
    waitIfPaused = null,
  ) {
    if (!sourceBlob) throw new Error("文案生图需要一张商品主图");
    const variants = buildCopyVariationPrompts(
      options.prompt,
      options.count,
      options.prompt_template,
      options.style_pack,
      options.background_mode,
      options.category || "auto",
    );
    const size = options.size || "1024x1024";
    const quality = options.quality || "high";
    parseSize(size);
    const outputs = [];
    for (let index = 0; index < variants.length; index += 1) {
      await waitIfPaused?.();
      const variant = variants[index];
      const prompt = variant.prompt;
      if (typeof provider.edit !== "function") {
        throw new Error("当前图片模型未实现图生图编辑接口");
      }
      const blob = await provider.edit(
        prompt,
        size,
        quality,
        sourceBlob,
        index,
      );
      const source = await decode(blob);
      outputs.push({
        blob: await toBlob(source, "image/png"),
        name: `${String(index + 1).padStart(2, "0")}-${variant.direction}.png`,
        width: source.width,
        height: source.height,
        direction: variant.direction,
        prompt,
        variant_type: "product_variant",
      });
      onProgress?.(Math.round(((index + 1) / variants.length) * 95), `已生成图片 ${index + 1}/${variants.length}`);
    }
    return {
      outputs,
      metadata: {
        mode: "product_copy_image_variations",
        provider: provider.name,
        category: options.category || "auto",
        model: provider.model || null,
        base_prompt: options.prompt || "",
        source_mode: "image_to_image",
        count: outputs.length,
        size,
        quality,
        directions: variants.map((item) => item.direction),
      },
    };
  }

  async function finalizeCopyVariants(
    sourceBlob,
    generatedBlobs,
    prompts,
    options = {},
    onProgress = null,
  ) {
    if (!sourceBlob) throw new Error("文案生图缺少商品主图");
    if (!generatedBlobs.length) throw new Error("Muse 没有返回可归档的裂变结果");
    const source = await decode(sourceBlob);
    const outputs = [];
    for (let index = 0; index < generatedBlobs.length; index += 1) {
      const generated = fitCanvas(
        await decode(generatedBlobs[index]),
        source.width,
        source.height,
      );
      const direction =
        prompts[index]?.direction || `copy_${index + 1}`;
      outputs.push({
        blob: await toBlob(generated, "image/png"),
        name: `${String(index + 1).padStart(2, "0")}-${direction}.png`,
        width: source.width,
        height: source.height,
        direction,
        prompt: prompts[index]?.prompt || "",
        variant_type: "product_variant",
      });
      onProgress?.(
        10 + Math.round(((index + 1) / generatedBlobs.length) * 85),
        `已归档文案裂变 ${index + 1}/${generatedBlobs.length}`,
      );
    }
    return {
      outputs,
      metadata: {
        mode: "muse_copy_image_variations",
        provider: "muse",
        base_prompt: options.prompt || "",
        category: options.category || "auto",
        source_mode: "image_to_image",
        chain_mode: options.chain_mode || "original",
        prompt_version: options.prompt_version || null,
        count: outputs.length,
        size: options.size || `${source.width}x${source.height}`,
        quality: options.quality || "high",
        directions: prompts.map((item) => item.direction),
      },
    };
  }

  async function finalizeLogoDesign(
    masterBlob,
    generatedInput,
    options = {},
    onProgress = null,
  ) {
    if (!masterBlob) throw new Error("Logo 重绘缺少商品主图");
    const generatedBlobs = Array.isArray(generatedInput)
      ? generatedInput.filter(Boolean)
      : [generatedInput].filter(Boolean);
    if (!generatedBlobs.length) throw new Error("Muse 没有返回 Logo 重绘结果");
    const master = await decode(masterBlob);
    const outputs = [];
    for (let index = 0; index < generatedBlobs.length; index += 1) {
      const generated = fitCanvas(
        await decode(generatedBlobs[index]),
        master.width,
        master.height,
      );
      outputs.push({
        blob: await toBlob(generated, "image/png"),
        name:
          generatedBlobs.length === 1
            ? "logo-redesign.png"
            : `logo-redesign-${String(index + 1).padStart(2, "0")}.png`,
        width: master.width,
        height: master.height,
        prompt: options.prompt || "",
        variant_type: "logo_design",
      });
      onProgress?.(
        10 + Math.round(((index + 1) / generatedBlobs.length) * 80),
        `Logo 重绘结果 ${index + 1}/${generatedBlobs.length} 已完成尺寸归一`,
      );
    }
    return {
      outputs,
      metadata: {
        mode: "muse_logo_redesign",
        provider: "muse",
        prompt: options.prompt || "",
        source_mode: "image_to_image",
        request_mode: options.request_mode || "stable",
        request_count: options.request_count || 1,
        output_count: options.output_count || outputs.length,
        failed_outputs: options.failed_outputs || 0,
        count: outputs.length,
        size: `${master.width}x${master.height}`,
      },
    };
  }

  return {
    VARIATION_DIRECTIONS,
    COPY_STYLE_PACKS,
    PANTS_BASE_PALETTE,
    PRODUCT_BASE_PALETTE,
    DEFAULT_COPY_PROMPT_TEMPLATE,
    PRINT_ONLY_CONSTRAINT,
    pickPantsBaseColors,
    pickProductBaseColors,
    shuffleDirections,
    buildPromptVariants,
    buildCopyVariationPrompts,
    buildCopyBatchPrompts,
    buildDirectCopyPrompts,
    buildProductVariants,
    colorStatus,
    createContactSheet,
    decode,
    deltaE2000,
    finalizePatternBatch,
    finalizeProductColors,
    finalizeCopyVariants,
    finalizeLogoDesign,
    hexToRgb,
    makeThumbnail,
    mockImage,
    mockImageEdit,
    normalizeColor,
    normalizeColors,
    normalizeProductColors,
    parseSize,
    logoColorMask,
    recolorLogo,
    recolorImageLogos,
    rgbToHex,
    rgbToHsv,
    safeFilename,
    srgbToLab,
    toBlob,
  };
});

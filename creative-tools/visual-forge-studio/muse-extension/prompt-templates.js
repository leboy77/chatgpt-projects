(function attachPromptTemplates(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.VisualForgePromptTemplates = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPromptTemplates() {
  "use strict";

  const PRINT_ONLY_CONSTRAINT =
    "【工厂平面印花约束】商品本体只允许改变表面的平面印花、图案、配色和视觉纹理，" +
    "必须沿用原商品的面料、版型、厚度、软硬、光泽、结构和全部物理细节。" +
    "严禁新增或改变任何物理结构、配件、口袋、绑带或装饰件。" +
    "印花必须像普通染料墨水一样哑光平涂、清晰套色、无光泽、无浮凸、无立体感，只呈现二维矢量或网点图形。" +
    "禁止任何依赖特殊材料、特殊油墨或后整理工艺才能实现的视觉效果。" +
    "参考图只用于提取印花图案、线稿、配色和平面明暗，不得把参考图中的立体结构、材质或工艺当作设计目标。" +
    "背景同样使用普通哑光布景，不渲染特殊表面效果，并必须让人清楚看出商品本身没有被改变结构或材质。";

  const VIDEO_NO_FACE_CONSTRAINT =
    "【真人出镜硬约束】如果视频出现真人模特或真人上身展示，画面必须始终避开面部：" +
    "只允许颈部以下、肩部、躯干和腿部入镜，脸部必须完全位于画面外，不得出现眼睛、鼻子、嘴巴、完整头部或可辨认面部。" +
    "禁止用面具、背影、侧脸或局部遮挡来暗示露脸；不要生成头像、脸部特写、自拍镜头或正脸转场。";

  const PRODUCT_CATEGORIES = Object.freeze({
    auto: {
      label: "自动识别 / 通用商品",
      category_name: "当前商品",
      category_print_area: "商品表面允许印花的区域",
      category_base_surface: "商品表面底色区域",
      category_protected_area: "商品的材质、结构、版型、配件和印花以外的区域",
      category_model_region: "与商品类型对应的穿着区域",
      excluded_categories: [],
    },
    lower: {
      label: "下装（裤子 / 裙装）",
      category_name: "下装",
      category_print_area: "下装的正面、背面和侧缝印花区域",
      category_base_surface: "下装底布",
      category_protected_area:
        "下装的腰头、口袋、腰带、拉链、纽扣、五金、裤脚或裙摆结构",
      category_model_region: "腰部以下",
      excluded_categories: ["上装", "上衣", "外套", "连衣裙"],
    },
    upper: {
      label: "上装（T 恤 / 卫衣 / 外套）",
      category_name: "上装",
      category_print_area: "上装的正面、背面和袖子印花区域",
      category_base_surface: "上装底布",
      category_protected_area:
        "上装的领口、袖口、门襟、帽子、口袋、拉链、纽扣、五金和缝线结构",
      category_model_region: "颈部以下、腰部以上",
      excluded_categories: ["裤子", "裤装", "下装", "裙装"],
    },
    dress: {
      label: "连衣类（连衣裙 / 长款）",
      category_name: "连衣类商品",
      category_print_area: "连衣类商品的裙身、胸前和袖子印花区域",
      category_base_surface: "连衣类商品底布",
      category_protected_area:
        "连衣类商品的领口、袖口、腰线、褶皱、门襟、拉链、纽扣和五金结构",
      category_model_region: "颈部以下至腿部",
      excluded_categories: ["单独裤子", "单独上衣", "单独外套"],
    },
    set: {
      label: "套装（上衣 + 下装）",
      category_name: "服装套装",
      category_print_area: "套装中上装和下装各自对应的印花区域",
      category_base_surface: "套装各单品的底布",
      category_protected_area:
        "套装各单品的领口、袖口、腰头、口袋、门襟、拉链、纽扣、五金和缝线结构",
      category_model_region: "颈部以下至腿部",
      excluded_categories: [],
    },
    other: {
      label: "其他（配饰 / 非服装商品）",
      category_name: "当前商品",
      category_print_area: "商品表面适合印花的区域",
      category_base_surface: "商品表面底色区域",
      category_protected_area: "商品的材质、结构、配件和印花以外的区域",
      category_model_region: "商品对应的真实使用区域",
      excluded_categories: ["裤子", "上装", "外套", "连衣裙"],
    },
  });

  const DEFAULTS = {
    copy:
      "第一张附件是当前商品主图。商品类目：{{category_name}}。严格保持原主图的构图、机位、裁切、商品位置、比例、版型、面料、褶皱、绒毛、缝线、五金、光影和印花以外区域不变。\n" +
      "只改变{{category_print_area}}中的印花，并改变{{category_base_surface}}颜色，原有印花不能保留。必须把{{category_base_surface}}改为随机指定的非白色底色，印花叠加在底布上。\n" +
      "用户补充描述（可为空）：{{instruction}}。\n" +
      "本批印花方向：\n{{visual_instruction}}\n" +
      "画面构图、机位、裁切和商品位置必须与原主图一致。背景处理：{{background_instruction}}" +
      "本批必须输出 {{batch_count}} 张相互独立的商品图，每张都使用与原主图相同的构图和比例。" +
      "禁止拼图、九宫格、文字和水印。",
    copy_free:
      "根据第一张商品主图进行服装视觉再设计。本次对话输出 {{batch_count}} 张独立商品图。\n" +
      "用户想法：{{instruction}}。\n" +
      "创意方向：\n{{visual_instruction}}\n" +
      "以用户描述中的具体风格为主，不要擅自替换成常见商业服装目录或固定棚拍。" +
      "请充分发挥服装杂志、街头摄影和前卫造型的想象力，避免普通棚拍、固定假人、老式花纹和安全保守的配色。" +
      "商品轮廓、面料质感和结构必须可信，{{batch_count}} 张之间要有明显区别，不拼图，只返回独立图片。",
    copy_fidelity:
      "第一张附件是当前商品主图。请根据用户要求重新设计商品视觉：{{instruction}}。\n" +
      "本次对话输出 {{batch_count}} 张独立商品图，按以下方向排列：\n{{visual_instruction}}\n" +
      "用户指定的风格、图案和氛围必须优先保留；变化只发生在平面印花、摄影语言和背景造型，不要把风格降级为普通商拍。" +
      "严格保留商品版型、比例、印花以外的结构、褶皱、绒毛、缝线、五金、品牌 Logo 和真实光影。" +
      "背景和造型需要围绕目标风格重新设计，不要只更换背景。" +
      "所有图片必须为独立附件，禁止拼图、文字和水印。",
    copy_editorial:
      "参考第一张商品主图，创作一组先锋时装杂志专题。用户设计目标：{{instruction}}。\n" +
      "本批输出 {{batch_count}} 张独立商品图，每张采用不同的镜头语言、空间尺度和灯光方案：\n" +
      "{{visual_instruction}}\n" +
      "把用户描述中的风格当作整组大片的艺术指导，先确定印花、平面配色、背景和光线的共同视觉语言，再让每张图用不同构图展开。" +
      "允许广角贴身、低机位、硬闪光、彩色补光、非常规裁切和戏剧化道具；画面要有当代感，不能退回陈旧花纹、固定假人和模板化背景。" +
      "商品必须仍是画面主角，版型、褶皱、绒毛、缝线、五金和真实立体感清晰可信。不要改变非目标结构。" +
      "{{batch_count}} 张之间不能只是换色或平移构图。只返回独立图片，禁止拼图、文字和水印。",
    copy_character:
      "参考第一张商品主图，为商品建立一个完整的角色与世界观。用户设计目标：{{instruction}}。\n" +
      "本次对话输出 {{batch_count}} 张独立商品图，并按照以下角色化方向展开：\n" +
      "{{visual_instruction}}\n" +
      "优先放大用户指定的风格，分配不同角色身份、背景分支、印花主题和平面图形组合，让每张图像来自同一世界观下的不同镜头。" +
      "服装印花、平面配色和背景氛围要共同服务角色设定，不能只换一块印花或放一个通用摄影棚。" +
      "避免老式制服、普通模特图和缺乏情绪的平光展示。保留商品真实轮廓、版型、面料纹理、褶皱和结构。" +
      "禁止拼图、文字和水印，只返回 {{batch_count}} 张独立图片。",
    copy_cinematic:
      "参考第一张商品主图，生成电影剧照级别的商品视觉。用户设计目标：{{instruction}}。\n" +
      "本批输出 {{batch_count}} 张独立图片，按以下镜头与叙事方向排列：\n" +
      "{{visual_instruction}}\n" +
      "以用户风格为核心设计光源、色温、环境、前中后景和动作瞬间。使用有动机的电影光、空气感、背景光影层次和明确视觉焦点。" +
      "每张图应像同一部影片里的不同关键帧，而不是同一影棚里的换色图。可以大胆使用逆光、色片、烟雾、投影和非常规机位。" +
      "避免年代感堆砌、俗套节日布景和普通白棚目录照，同时保持商品版型、比例、面料、绒毛、褶皱、缝线和五金可信。" +
      "只返回独立图片，禁止拼图、字幕、文字和水印。",
    copy_surreal:
      "参考第一张商品主图，进行超现实空间和平面印花实验。用户设计目标：{{instruction}}。\n" +
      "本次对话输出 {{batch_count}} 张独立商品图，每个画面使用不同的实验方向：\n" +
      "{{visual_instruction}}\n" +
      "把用户指定的风格转译为当代视觉实验：可以改变印花尺度、空间比例、道具逻辑和光色关系，但不能破坏商品身份或材质。" +
      "每张都要有新鲜的视觉钩子，例如不可能的重力、放大微距、印花尺度变化、几何切面或环境投影；避免老式花纹、普通陈列和重复布景。" +
      "保留服装轮廓、版型、褶皱、绒毛、缝线、五金和真实穿着逻辑，不要让商品变成平面海报。" +
      "只返回 {{batch_count}} 张独立图片，禁止拼图、文字、水印和九宫格。",
    copy_gallery:
      "参考第一张商品主图，创作现代艺廊装置式商品大片。用户设计目标：{{instruction}}。\n" +
      "输出 {{batch_count}} 张独立图片，并应用以下空间与构图变化：\n" +
      "{{visual_instruction}}\n" +
      "用用户指定的风格支配平面色块、几何结构、背景色彩对照、哑光雕塑道具和精确光线；保持画面高级、当代、克制但不老气。" +
      "让每张图在空间尺度、镜头高度、背景结构和光比上明显不同，不能把同一布景换色后重复输出。" +
      "商品必须清晰可辨，版型、面料纹理、褶皱、绒毛、缝线和五金真实自然；不要加入无关文字或品牌标识。" +
      "只返回 {{batch_count}} 张独立图片，禁止拼图、九宫格、文字和水印。",
    product_color:
      "第一张附件是商品参考图，第二张附件是目标颜色色卡，色卡只用于取色，不要出现在结果里。" +
      "保持人物姿态、产品裁切、背景、服装版型、口袋、腰带、缝线、面料纹理、褶皱和光影不变。" +
      "只把{{region_name}}的颜色改为 {{color_description}} {{color_hex}}（{{color_name}}目标色号），与第二张色卡一致。" +
      "目标颜色必须清晰可见，不能保留原来的主色；衣服的印花、logo和五金细节不能变色。" +
      "这是第 {{index}}/{{total}} 个颜色，输出一张与原图相同比例和构图的单张商品图。" +
      "不要生成拼图、色卡、文字或水印，不要改变其他产品和非目标区域。",
    product_color_batch:
      "第一张附件是商品参考图，后续 {{color_count}} 张附件是按顺序排列的目标颜色色卡；色卡只用于取色，不要出现在结果里。\n" +
      "颜色与输出顺序如下：\n{{color_list}}\n" +
      "本次对话必须输出 {{color_count}} 张相互独立的商品图，严格按上述顺序做到一张色卡对应一张输出。\n" +
      "每张输出只把{{region_name}}改成对应色卡的颜色，必须保持同一商品、人物姿态、产品裁切、背景、版型、口袋、腰带、缝线、面料纹理、褶皱和光影。" +
      "衣服印花、Logo 和五金细节不能变色，也不能让不同颜色串到错误图片。\n" +
      "目标颜色必须清晰可见，不能保留原来的主色。不要拼图、九宫格、色卡、对比页、文字或水印。" +
      "只返回 {{color_count}} 张独立图片，并严格按附件色卡顺序排列。当前商品共 {{total}} 个目标色。",
    logo_design:
      "第一张附件是需要修改的完整商品主图。" +
      "请只重绘商品上已经存在的全部 Logo，把所有旧 Logo 替换为新的 Logo 设计：{{instruction}}。" +
      "新旧 Logo 的尺寸、位置、透视和贴合方式应自然继承原图；同一商品上的多个 Logo 必须使用同一套新设计。" +
      "必须彻底移除旧 Logo 的图形、文字、颜色和轮廓，不能保留旧 Logo，也不能只在旧 Logo 上变色。" +
      "除 Logo 外，商品版型、轮廓、颜色、印花、面料纹理、绒毛、褶皱、缝线、口袋、拉链、五金、背景、人物、道具、构图、裁切、光影和整体风格必须尽可能保持原样。" +
      "不要新增 Logo 位置，不要增加文字、水印、标签、边框或 UI，不要拼图，只输出一张与主图构图一致的商品图。",
    logo_design_batch:
      "第一张附件是需要修改的完整商品主图。\n" +
      "请把商品上已经存在的全部旧 Logo 替换为同一套全新的 Logo 设计：{{instruction}}。\n" +
      "本次对话必须输出 {{output_count}} 张相互独立的完整商品图，这是第 {{request_index}} 次请求；每张都完整继承原图构图和商品身份。" +
      "新旧 Logo 的尺寸、位置、透视和贴合方式应自然继承原图；同一张商品上的多个 Logo 必须使用同一套新设计。\n" +
      "每张图都必须彻底移除旧 Logo 的图形、文字、颜色和轮廓，不能只在旧 Logo 上变色。" +
      "除 Logo 外，商品版型、轮廓、颜色、印花、面料纹理、绒毛、褶皱、缝线、口袋、拉链、五金、背景、人物、道具、构图、裁切、光影和整体风格必须尽可能保持原样。" +
      "不同输出可以改变新 Logo 的具体造型方案，但不得改变商品主体和非 Logo 区域。\n" +
      "禁止拼图、九宫格、文字、水印、标签、边框或 UI，只返回 {{output_count}} 张独立图片。",
    pattern_single:
      "第一张附件是白底商品主图，第二张附件是印花风格参考图。" +
      "本次商品类目：{{category_name}}；目标印花区域：{{category_print_area}}。" +
      "只从第二张图提取印花、图案、配色和视觉风格，把印花自然套到第一张图的商品主体上。" +
      "必须保留白底商品原有的轮廓、版型、褶皱、绒毛/面料纹理、缝线、口袋、拉链、五金、高光和明暗层次，不能把商品变成平面贴图。" +
      "参考图中的人物、商品、服装款式、背景、文案、标签、边框、水印和UI元素都不要放进结果，只参考印花风格。" +
      "{{background_instruction}}" +
      "这是第 {{index}}/{{total}} 张参考图，只输出一张单张商品图。" +
      "No collage, no watermark, no reference labels, no added text, exact product identity.",
    pattern_batch:
      "本次商品类目：{{category_name}}；目标印花区域：{{category_print_area}}。\n" +
      "第一张附件是白底商品主图，第二张附件是一个 ZIP，里面有按文件名排序的多张印花参考图。\n" +
      "请解压 ZIP，按下面给出的顺序逐张处理：\n{{reference_list}}\n" +
      "这是总第 {{batch_index}} 批，本批必须输出 {{batch_count}} 张相互独立的商品图，一张参考图对应一张输出。\n" +
      "每张图只提取对应参考图中的印花、图案、配色和视觉风格，并把印花自然套到第一张白底商品的对应位置。\n" +
      "必须保留白底商品原有的轮廓、版型、褶皱、绒毛/面料纹理、缝线、口袋、拉链、五金、高光和明暗层次。\n" +
      "参考图中的人物、背景、文案、标签、边框、水印和UI元素都不要放进结果，只参考印花风格。\n" +
      "{{background_instruction}}\n" +
      "严禁拼图、九宫格、四宫格、色卡、对比页或将多个商品放进同一张图；必须返回多个独立图片附件，并按输入文件名顺序排列。\n" +
      "当前任务共 {{total}} 张参考图。No collage, no grid, exactly {{batch_count}} separate images.",
    video_showcase:
      "本次商品类目：{{category_name}}；商品对应展示区域：{{category_model_region}}。\n" +
      "第一张附件是本次商品主图。请基于该商品生成一段真实、连续、可直接用于商品展示的短视频。\n" +
      "视频时长约 {{duration_seconds}} 秒，画面比例 {{aspect_ratio}}，展示方式：{{presentation_instruction}}。\n" +
      "用户补充要求（可为空）：{{instruction}}。\n" +
      "商品必须是画面唯一主角，完整保留原商品的版型、结构、颜色、印花、面料纹理、绒毛、褶皱、缝线、口袋、拉链、五金和 Logo；不得凭空增加配件、改造结构或替换商品。\n" +
      "通过平滑运镜、自然光线、真实动态和清晰细节展示商品，可包含环绕、推近、面料细节、悬挂摆动或适度上身动态；动作与物理效果必须自然，商品不能扭曲、融化、闪烁或变形。\n" +
      "如果使用模特上身，仅展示颈部以下的身体和商品穿着效果，脸部不得入镜。\n" +
      "不要添加字幕、营销文字、价格、品牌水印、UI、拼贴或明显 AI 伪影。只返回一个可播放的视频附件。",
  };

  for (const key of Object.keys(DEFAULTS)) {
    if (key.startsWith("copy")) {
      DEFAULTS[key] = `${DEFAULTS[key]}\n${PRINT_ONLY_CONSTRAINT}`;
    }
  }

  function variables(template) {
    return [...String(template || "").matchAll(/\{\{([a-z_]+)\}\}/g)].map(
      (match) => match[1],
    );
  }

  function render(template, values = {}) {
    return String(template || "").replace(
      /\{\{([a-z_]+)\}\}/g,
      (_, name) => String(values[name] ?? ""),
    );
  }

  function ensureVideoNoFaceConstraint(prompt) {
    const text = String(prompt || "").trim();
    if (!text) return VIDEO_NO_FACE_CONSTRAINT;
    if (text.includes("【真人出镜硬约束】")) return text;
    return `${text}\n\n${VIDEO_NO_FACE_CONSTRAINT}`;
  }

  function resolveProductCategory(value, instruction = "") {
    const key = String(value || "auto").trim().toLowerCase();
    if (key !== "auto" && PRODUCT_CATEGORIES[key]) return key;
    const text = String(instruction || "");
    if (/(?:连衣|长裙|连衣裙)/i.test(text)) return "dress";
    if (/(?:套装|两件套|上下装)/i.test(text)) return "set";
    if (/(?:裤|下装|半裙|短裤|长裤|裙裤)/i.test(text)) return "lower";
    if (/(?:上衣|上装|T恤|卫衣|外套|夹克|衬衫|马甲| hoodie|shirt)/i.test(text)) {
      return "upper";
    }
    return "auto";
  }

  function productCategoryOptions() {
    return Object.entries(PRODUCT_CATEGORIES).map(([value, category]) => ({
      value,
      label: category.label,
    }));
  }

  function productCategoryValues(value, instruction = "") {
    const key = resolveProductCategory(value, instruction);
    return {
      key,
      ...PRODUCT_CATEGORIES[key],
    };
  }

  function ensureProductCategoryConstraint(
    prompt,
    value,
    instruction = "",
  ) {
    const text = String(prompt || "").trim();
    const category = productCategoryValues(value, instruction);
    if (text.includes("【商品类目约束】")) return text;
    const excluded = category.excluded_categories?.length
      ? `不得把目标商品改成或描述成${category.excluded_categories.join("、")}。`
      : "";
    return `${text}\n\n【商品类目约束】本次商品类目是${category.category_name}。` +
      `只处理${category.category_print_area}和${category.category_base_surface}；` +
      `严格保留${category.category_protected_area}。${excluded}`;
  }

  return {
    DEFAULTS,
    PRODUCT_CATEGORIES,
    PRINT_ONLY_CONSTRAINT,
    VIDEO_NO_FACE_CONSTRAINT,
    ensureProductCategoryConstraint,
    ensureVideoNoFaceConstraint,
    productCategoryOptions,
    productCategoryValues,
    render,
    resolveProductCategory,
    variables,
  };
});

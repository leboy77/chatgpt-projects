(() => {
  "use strict";

  const categories = [
    {
      id: "t_shirt",
      label: "T恤生图",
      short: "T恤",
      symbol: "T",
      color: "#a99fff",
      bg: "rgba(110,102,255,.14)",
      description: "围绕热销 T 恤快速生成印花、棚拍与生活方式视觉。",
      prompt: "一件现代 POD T恤，图案居中，面料纹理清晰，商业摄影，保持服装版型比例一致",
      status: "产品视觉流水线",
    },
    {
      id: "hoodie",
      label: "卫衣生图",
      short: "卫衣",
      symbol: "H",
      color: "#ffb76b",
      bg: "rgba(255,158,74,.13)",
      description: "生成连帽卫衣、圆领卫衣和全印卫衣商品视觉。",
      prompt: "一件高质量连帽卫衣，正面平铺展示，面料和印花细节清晰，商业电商摄影",
      status: "产品视觉流水线",
    },
    {
      id: "blanket",
      label: "毛毯生图",
      short: "毛毯",
      symbol: "M",
      color: "#ff9a6d",
      bg: "rgba(255,123,103,.13)",
      description: "创建适合节日送礼的家居毛毯商品场景。",
      prompt: "高端定制毛毯产品视觉，柔软绒面，居家生活方式场景，产品纹理清晰",
      status: "产品视觉流水线",
    },
    {
      id: "groundmat",
      label: "地垫生图",
      short: "地垫",
      symbol: "G",
      color: "#54dfb3",
      bg: "rgba(54,212,154,.12)",
      description: "低门槛家居引流款地垫，快速测款与上新。",
      prompt: "现代家居地垫产品摄影，正面图案完整，细腻材质，干净商业场景",
      status: "产品视觉流水线",
    },
    {
      id: "beach_towel",
      label: "沙滩巾生图",
      short: "沙滩巾",
      symbol: "B",
      color: "#59c9f3",
      bg: "rgba(66,181,238,.13)",
      description: "面向季节趋势的沙滩巾色彩与场景视觉。",
      prompt: "夏季沙滩巾商品图，色彩鲜明，织物质感清晰，明亮海边生活方式场景",
      status: "产品视觉流水线",
    },
    {
      id: "tin_sign",
      label: "铁皮画生图",
      short: "铁皮画",
      symbol: "S",
      color: "#ff8c91",
      bg: "rgba(255,110,116,.13)",
      description: "复古装饰铁皮画，强化材质与室内陈列效果。",
      prompt: "复古铁皮装饰画商品摄影，金属边缘和印刷细节清晰，室内陈列场景",
      status: "产品视觉流水线",
    },
    {
      id: "full_all",
      label: "全印工作台",
      short: "全印",
      symbol: "F",
      color: "#c39cff",
      bg: "rgba(162,101,255,.13)",
      description: "多类目模板、多色套图与图案分类的完整生产入口。",
      prompt: "全印服装商品套图，保持图案与版型一致，统一商业摄影风格",
      status: "模板流程原型",
    },
    {
      id: "compose",
      label: "模板套图",
      short: "套图",
      symbol: "▦",
      color: "#77b8ff",
      bg: "rgba(83,160,255,.13)",
      description: "把已有设计或生成图套用到多个商品模板。",
      prompt: "把图案自然套用到商品模板，保留面料褶皱、光影与真实立体感",
      status: "模板流程原型",
    },
    {
      id: "color",
      label: "精准配色",
      short: "精准色",
      symbol: "◐",
      color: "#ffad8a",
      bg: "rgba(255,123,103,.13)",
      description: "按指定 HEX 输出商品多色版本，并执行 ΔE2000 质检。",
      target: "color",
      status: "自研真实流水线",
    },
    {
      id: "hd_upscale",
      label: "一键高清",
      short: "高清",
      symbol: "HD",
      color: "#87a6ff",
      bg: "rgba(86,130,255,.13)",
      description: "将素材提升到适合印刷与上架的高分辨率版本。",
      prompt: "对商品图片进行高清增强，保留真实纹理，不改变产品结构",
      status: "模型接入位",
    },
    {
      id: "Cutout",
      label: "一键抠图",
      short: "抠图",
      symbol: "C",
      color: "#81ddca",
      bg: "rgba(60,190,164,.13)",
      description: "移除图片背景，输出白底图或透明商品素材。",
      prompt: "保持商品主体完全不变，移除背景，输出干净的透明素材",
      status: "模型接入位",
    },
    {
      id: "extract",
      label: "印花提取",
      short: "提取",
      symbol: "P",
      color: "#ff9fdf",
      bg: "rgba(232,87,180,.13)",
      description: "从商品图或设计稿中提取独立印花素材。",
      prompt: "精确提取商品中的印花图案，保持图案结构与边缘细节",
      status: "模型接入位",
    },
    {
      id: "cloud_filter",
      label: "AI 检测",
      short: "检测",
      symbol: "✓",
      color: "#ffbd67",
      bg: "rgba(255,176,68,.13)",
      description: "过滤风险内容并匹配 Temu 商品类目。",
      prompt: "检查商品图案的安全性与类目匹配，输出风险说明",
      status: "模型接入位",
    },
    {
      id: "cutting",
      label: "工厂切片",
      short: "切片",
      symbol: "✂",
      color: "#f595b0",
      bg: "rgba(240,95,140,.13)",
      description: "按商品类型切分印刷面片，进入工厂生产流程。",
      target: "cutting",
      status: "等待切片配置",
    },
    {
      id: "custom",
      label: "自定义创作",
      short: "自定义",
      symbol: "＋",
      color: "#cbc5ff",
      bg: "rgba(132,124,255,.12)",
      description: "不受类目限制，自由描述需要生产的商品视觉。",
      prompt: "高端商品视觉，主体清晰，商业摄影灯光，构图留白，可直接用于电商上架",
      status: "产品视觉流水线",
    },
  ];

  const kindLabels = {
    logo_recolor: "Logo 多色",
    logo_color_batch: "多 Logo 同色",
    product_generate: "商品视觉",
    product_color_finalize: "商品多色",
  };

  const statusLabels = {
    queued: "排队中",
    running: "处理中",
    succeeded: "已完成",
    failed: "失败",
  };

  const pageMeta = {
    home: ["工作台", "创作总览"],
    create: ["AI 创作", "类目生成工作台"],
    color: ["精准配色", "颜色实验室"],
    suite: ["模板套图", "多类目套图"],
    cutting: ["工厂切片", "生产文件处理"],
    history: ["素材库", "创作历史"],
    assets: ["素材库", "素材资产"],
    templates: ["配置中心", "模板配置"],
    billing: ["账户", "积分明细"],
    profile: ["账户", "个人中心"],
  };

  const suiteCategoryItems = [
    ["full_shirt", "全印衬衫", "2 点/类目"],
    ["full_t_shirt", "全印 T 恤", "2 点/类目"],
    ["full_hoodie", "全印卫衣", "2 点/类目"],
    ["full_tank", "男士背心", "2 点/类目"],
    ["full_beach_shorts", "沙滩裤", "2 点/类目"],
    ["full_blanket", "全印毛毯", "2 点/类目"],
    ["full_pillow", "全印抱枕", "2 点/类目"],
    ["full_tote", "全印帆布包", "2 点/类目"],
    ["full_custom", "自定义商品", "2 点/类目"],
  ];

  const state = {
    authMode: "login",
    captchaAnswer: 0,
    currentView: "home",
    previousView: "home",
    category: categories[0],
    generationMode: "single",
    inputMode: "upload",
    colorMode: "logo",
    jobs: [],
    pollTimer: 0,
    createFiles: [],
    logoFile: null,
    logosFiles: [],
    productFiles: [],
    suiteFiles: [],
    cuttingFile: null,
    templateFilter: "all",
    templates: [],
    cuttingRecords: [],
    suiteSelected: new Set(["full_shirt", "full_t_shirt", "full_hoodie"]),
    points: 1480,
    ledger: [],
    profile: {
      name: "Visual Creator",
      brandColor: "#D4684F",
      compactTitles: false,
    },
    auth: null,
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function readStorage(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Local persistence can be unavailable in hardened browser profiles.
    }
  }

  function formatDate(value, includeTime = true) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value || "—";
    return date.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: includeTime ? "2-digit" : undefined,
      minute: includeTime ? "2-digit" : undefined,
      hour12: false,
    });
  }

  function toast(message, error = false) {
    const element = $("#toast");
    element.textContent = message;
    element.classList.toggle("is-error", error);
    element.classList.add("is-visible");
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(() => {
      element.classList.remove("is-visible");
    }, 3600);
  }

  function authStorage() {
    return readStorage("muse-visual-forge-auth", null);
  }

  function persistState() {
    writeStorage("muse-visual-forge-points", state.points);
    writeStorage("muse-visual-forge-ledger", state.ledger);
    writeStorage("muse-visual-forge-templates", state.templates);
    writeStorage("muse-visual-forge-cutting", state.cuttingRecords);
    writeStorage("muse-visual-forge-profile", state.profile);
  }

  function setAuthMode(mode) {
    state.authMode = mode;
    $$("[data-auth-mode]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.authMode === mode);
    });
    $$(".register-only").forEach((element) => {
      element.hidden = mode !== "register";
    });
    $$(".login-only").forEach((element) => {
      element.hidden = mode === "register";
    });
    $("#authTitle").textContent = mode === "register" ? "创建您的账户" : "登录工作台";
    $("#authSubmitText").textContent = mode === "register" ? "注册并进入" : "登录";
    $("#authPassword").autocomplete = mode === "register" ? "new-password" : "current-password";
  }

  function refreshCaptcha() {
    const left = Math.floor(Math.random() * 8) + 2;
    const right = Math.floor(Math.random() * 7) + 1;
    state.captchaAnswer = left + right;
    $("#captchaText").textContent = `${left} + ${right} = ?`;
    $("#authCode").value = "";
  }

  function showApp() {
    state.auth = authStorage() || { phone: "demo", name: "演示用户" };
    $("#authScreen").hidden = true;
    $("#appShell").hidden = false;
    document.title = "MUSE Visual Forge · 创作工作台";
    showView("home");
    loadJobs();
  }

  function showAuth() {
    $("#appShell").hidden = true;
    $("#authScreen").hidden = false;
    document.title = "MUSE Visual Forge";
    setAuthMode("login");
    refreshCaptcha();
  }

  function handleAuthSubmit(event) {
    event.preventDefault();
    const phone = $("#authPhone").value.trim();
    const password = $("#authPassword").value;
    const code = Number($("#authCode").value.trim());
    if (!/^1\d{10}$/.test(phone)) {
      toast("请输入有效的 11 位手机号。", true);
      return;
    }
    if (password.length < 6) {
      toast("密码至少需要 6 位。", true);
      return;
    }
    if (state.authMode === "register" && password !== $("#authConfirm").value) {
      toast("两次输入的密码不一致。", true);
      return;
    }
    if (code !== state.captchaAnswer) {
      toast("验证码不正确，请重新输入。", true);
      refreshCaptcha();
      return;
    }
    if (!$("#authLegal").checked) {
      toast("请先确认服务条款和隐私政策。", true);
      return;
    }
    writeStorage("muse-visual-forge-auth", {
      phone,
      name: `创作者 ${phone.slice(-4)}`,
      mode: state.authMode,
    });
    toast(state.authMode === "register" ? "本地演示账户已创建。" : "欢迎回到创作工作台。");
    showApp();
  }

  function enterDemo() {
    writeStorage("muse-visual-forge-auth", {
      phone: "demo",
      name: "Visual Creator",
      mode: "demo",
    });
    showApp();
  }

  function logout() {
    localStorage.removeItem("muse-visual-forge-auth");
    state.auth = null;
    showAuth();
  }

  function showView(view) {
    if (!pageMeta[view]) return;
    if (state.currentView !== view) state.previousView = state.currentView;
    state.currentView = view;
    $$(".view").forEach((element) => {
      element.classList.toggle("is-active", element.dataset.page === view);
    });
    $$("[data-view]").forEach((element) => {
      element.classList.toggle("is-active", element.dataset.view === view);
    });
    const [breadcrumb, heading] = pageMeta[view];
    $("#breadcrumb").textContent = breadcrumb;
    $("#pageHeading").textContent = heading;
    $("#backButton").hidden = view === "home";
    closeSidebar();
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (view === "history") renderHistory();
    if (view === "assets") renderAssets();
    if (view === "billing") renderBilling();
    if (view === "templates") renderTemplates();
    if (view === "cutting") renderCuttingRecords();
  }

  function closeSidebar() {
    $("#sidebar").classList.remove("is-open");
    $("#sidebarScrim").classList.remove("is-visible");
  }

  function openCategory(id) {
    const category = categories.find((item) => item.id === id) || categories[0];
    state.category = category;
    if (category.target) {
      showView(category.target);
      return;
    }
    $("#createTitle").textContent = `AI ${category.short}创作`;
    $("#createDescription").textContent = category.description;
    $("#createStatusChip").textContent = category.status;
    $("#createStatusChip").classList.toggle("accent", category.status.includes("自研"));
    $("#createPrompt").value = category.prompt;
    const emptySymbol = $("#emptyCategorySymbol");
    const emptyTitle = $("#emptyCategoryTitle");
    const emptyText = $("#emptyCategoryText");
    if (emptySymbol) emptySymbol.textContent = category.symbol;
    if (emptyTitle) emptyTitle.textContent = `${category.label}空间`;
    if (emptyText) emptyText.textContent = "上传参考图并提交后，任务会自动进入队列并刷新结果。";
    $$(".category-pill").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.category === id);
    });
    updateEstimate();
    showView("create");
    renderCreateResults();
  }

  function renderHomeFeatures() {
    const grid = $("#homeFeatureGrid");
    grid.innerHTML = categories
      .filter((category) => !["groundmat", "beach_towel", "tin_sign", "Cutout"].includes(category.id))
      .slice(0, 8)
      .map(
        (category) => `
          <article class="feature-card" data-category="${escapeHtml(category.id)}" tabindex="0">
            <span class="corner-tag">${escapeHtml(category.status)}</span>
            <span
              class="feature-icon"
              style="--feature-color:${category.color};--feature-bg:${category.bg}"
            >${escapeHtml(category.symbol)}</span>
            <h3>${escapeHtml(category.label)}</h3>
            <p>${escapeHtml(category.description)}</p>
            <footer><span>进入工作台</span><b>↗</b></footer>
          </article>
        `,
      )
      .join("");
    $$("[data-category]", grid).forEach((card) => {
      const open = () => openCategory(card.dataset.category);
      card.addEventListener("click", open);
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      });
    });
  }

  function renderCategoryStrip() {
    $("#categoryStrip").innerHTML = categories
      .filter((category) => !category.target)
      .map(
        (category) => `
          <button
            type="button"
            class="category-pill${category.id === state.category.id ? " is-active" : ""}"
            data-category="${escapeHtml(category.id)}"
          >
            <i style="--pill-color:${category.color};--pill-bg:${category.bg}">${escapeHtml(category.short.slice(0, 2))}</i>
            <span>${escapeHtml(category.short)}</span>
          </button>
        `,
      )
      .join("");
    $$(".category-pill").forEach((button) => {
      button.addEventListener("click", () => openCategory(button.dataset.category));
    });
  }

  function wireUploadZone(zone, input, preview, callback) {
    if (!zone || !input) return;
    const acceptFiles = (files) => {
      const list = [...files];
      if (!list.length) return;
      if (preview && list[0]?.type?.startsWith("image/")) {
        const previousUrl = preview.dataset.objectUrl;
        if (previousUrl) URL.revokeObjectURL(previousUrl);
        const objectUrl = URL.createObjectURL(list[0]);
        preview.src = objectUrl;
        preview.dataset.objectUrl = objectUrl;
        preview.hidden = false;
        const empty = $(".upload-empty", zone);
        if (empty) empty.hidden = true;
      }
      callback(list);
    };
    input.addEventListener("change", () => acceptFiles(input.files));
    ["dragenter", "dragover"].forEach((eventName) => {
      zone.addEventListener(eventName, (event) => {
        event.preventDefault();
        zone.classList.add("is-dragged");
      });
    });
    ["dragleave", "drop"].forEach((eventName) => {
      zone.addEventListener(eventName, (event) => {
        event.preventDefault();
        zone.classList.remove("is-dragged");
      });
    });
    zone.addEventListener("drop", (event) => {
      acceptFiles(event.dataTransfer.files);
    });
  }

  function clearPreview(zone, preview) {
    if (preview) {
      const url = preview.dataset.objectUrl;
      if (url) URL.revokeObjectURL(url);
      preview.removeAttribute("src");
      preview.removeAttribute("data-object-url");
      preview.hidden = true;
      const empty = $(".upload-empty", zone);
      if (empty) empty.hidden = false;
    }
  }

  function parseHexColors(raw) {
    return String(raw || "")
      .split(/[\s,，;；]+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => (item.startsWith("#") ? item : `#${item}`));
  }

  function renderSwatches() {
    const colors = parseHexColors($("#logoColors").value).slice(0, 30);
    $("#logoSwatches").innerHTML = colors
      .map((color) => `<i title="${escapeHtml(color)}" style="--swatch:${escapeHtml(color)}"></i>`)
      .join("");
  }

  function estimateCreatePoints() {
    const modelBase = $("#createModel").value === "radicalization" ? 10 : 8;
    const count = Number($("#createCount").value);
    const titleCost = $("#createTitleOption").checked ? count : 0;
    const filterCost = $("#createFilterOption").checked ? Math.ceil(count / 2) : 0;
    return modelBase * count + titleCost + filterCost;
  }

  function updateEstimate() {
    $("#strengthValue").textContent = `${$("#createStrength").value}%`;
    $("#estimatePoints").textContent = `${estimateCreatePoints()} AI 点`;
  }

  function addLedger(description, points, jobId = "LOCAL") {
    state.ledger.unshift({
      time: new Date().toISOString(),
      type: points < 0 ? "任务消耗" : "演示赠送",
      description,
      jobId,
      points,
    });
    state.points += points;
    persistState();
    updatePoints();
  }

  function updatePoints() {
    const formatted = state.points.toLocaleString("zh-CN");
    $("#pointsValue").textContent = formatted;
    $("#metricPoints").textContent = formatted;
    $("#billingBalance").textContent = formatted;
  }

  function jobTitle(job) {
    const options = job.options || {};
    if (options.prompt) return String(options.prompt);
    if (Array.isArray(options.colors)) {
      return options.colors
        .map((color) => (typeof color === "string" ? color : color.hex || color.color))
        .filter(Boolean)
        .join(", ");
    }
    return options.color || `任务 ${String(job.id || "").slice(0, 8)}`;
  }

  async function requestJobs(limit = 100) {
    const response = await fetch(`/api/jobs?limit=${limit}`, { cache: "no-store" });
    if (!response.ok) throw new Error("读取任务记录失败");
    const payload = await response.json();
    return Array.isArray(payload.jobs) ? payload.jobs : [];
  }

  async function loadJobs() {
    try {
      state.jobs = await requestJobs();
      const today = new Date().toDateString();
      $("#metricJobs").textContent = state.jobs.filter((job) => {
        const created = new Date(job.created_at);
        return !Number.isNaN(created.getTime()) && created.toDateString() === today;
      }).length;
      renderJobSurfaces();
      if (state.currentView === "history") renderHistory();
      if (state.currentView === "assets") renderAssets();
    } catch (error) {
      $("#sideQueueTitle").textContent = "本地服务未连接";
      $("#sideQueueText").textContent = "请启动 visualforge serve";
      $("#metricQueue").textContent = "离线";
      toast(error.message || "本地服务未连接", true);
    }
  }

  function statusMarkup(status) {
    return `<span class="small-status ${escapeHtml(status)}">${escapeHtml(statusLabels[status] || status)}</span>`;
  }

  function renderRecentJobs() {
    const container = $("#recentJobs");
    if (!state.jobs.length) {
      container.innerHTML = `<div class="empty-canvas" style="min-height:160px"><p>暂无生产记录，从上方选择一个创作路径开始。</p></div>`;
      return;
    }
    container.innerHTML = state.jobs
      .slice(0, 4)
      .map((job) => {
        const firstImage = job.outputs?.find((asset) => asset.url && /\.(png|jpe?g|webp)$/i.test(asset.name || asset.url));
        return `
          <button class="compact-job" type="button" data-job="${escapeHtml(job.id)}" style="border-left:0;border-right:0;background:transparent;color:inherit;text-align:left;cursor:pointer">
            <span class="compact-thumb">${firstImage?.url ? `<img src="${escapeHtml(firstImage.url)}" alt="">` : "M"}</span>
            <p><b>${escapeHtml(jobTitle(job))}</b><small>${escapeHtml(kindLabels[job.kind] || job.kind)} · ${formatDate(job.created_at)}</small></p>
            ${statusMarkup(job.status)}
          </button>
        `;
      })
      .join("");
    $$("[data-job]", container).forEach((button) => {
      button.addEventListener("click", () => openJob(button.dataset.job));
    });
  }

  function renderRailJobs() {
    const rail = $("#createTaskRail");
    if (!state.jobs.length) {
      rail.innerHTML = `<div class="empty-canvas" style="min-height:230px"><p>暂无近期任务</p></div>`;
      return;
    }
    rail.innerHTML = state.jobs
      .slice(0, 6)
      .map((job) => {
        const images = (job.outputs || []).filter((asset) => asset.url).slice(0, 4);
        return `
          <button class="rail-task" type="button" data-job="${escapeHtml(job.id)}">
            <span style="display:flex;justify-content:space-between;gap:8px;align-items:center">
              <b>${escapeHtml(kindLabels[job.kind] || job.kind)}</b>
              ${statusMarkup(job.status)}
            </span>
            <p>${escapeHtml(jobTitle(job)).slice(0, 78)}</p>
            <div class="rail-thumbs">
              ${
                images.length
                  ? images.map((image) => `<img src="${escapeHtml(image.url)}" alt="">`).join("")
                  : "<i></i><i></i><i></i><i></i>"
              }
            </div>
            <small>${formatDate(job.created_at)}</small>
          </button>
        `;
      })
      .join("");
    $$("[data-job]", rail).forEach((button) => {
      button.addEventListener("click", () => openJob(button.dataset.job));
    });
  }

  function renderJobCard(job) {
    const images = (job.outputs || []).filter((asset) => asset.url);
    return `
      <article class="job-result-card">
        <div class="job-result-head">
          <div><h3>${escapeHtml(jobTitle(job))}</h3><p>${escapeHtml(kindLabels[job.kind] || job.kind)} · ${formatDate(job.created_at)}</p></div>
          ${statusMarkup(job.status)}
        </div>
        <div class="progress-line"><i style="width:${Math.max(2, Number(job.progress) || 0)}%"></i></div>
        <div class="result-image-grid">
          ${
            images.length
              ? images
                  .slice(0, 8)
                  .map(
                    (asset) => `
                      <a href="${escapeHtml(asset.url)}" target="_blank" rel="noopener" title="${escapeHtml(asset.name || "")}">
                        <img src="${escapeHtml(asset.url)}" alt="${escapeHtml(asset.name || "")}" loading="lazy">
                      </a>
                    `,
                  )
                  .join("")
              : `<div class="empty-canvas" style="grid-column:1/-1;min-height:130px"><p>${escapeHtml(job.message || statusLabels[job.status] || "任务处理中")}</p></div>`
          }
        </div>
        <div class="result-foot">
          <span>${escapeHtml(job.message || statusLabels[job.status] || "")}</span>
          <span>
            <button class="table-link" type="button" data-job="${escapeHtml(job.id)}">详情</button>
            ${job.download_url ? ` · <a href="${escapeHtml(job.download_url)}">下载 ZIP</a>` : ""}
          </span>
        </div>
      </article>
    `;
  }

  function renderCreateResults() {
    const filter = $("#resultFilter").value;
    const jobs = state.jobs.filter((job) => !filter || job.status === filter);
    const container = $("#createResults");
    if (!jobs.length) {
      container.innerHTML = `
        <div class="empty-canvas">
          <span class="empty-symbol">${escapeHtml(state.category.symbol)}</span>
          <h2>${escapeHtml(state.category.label)}空间</h2>
          <p>上传参考图并提交后，任务会自动刷新结果。</p>
        </div>`;
      return;
    }
    container.innerHTML = jobs.slice(0, 6).map(renderJobCard).join("");
    $$("[data-job]", container).forEach((button) => {
      button.addEventListener("click", () => openJob(button.dataset.job));
    });
  }

  function renderColorResults() {
    const colorJobs = state.jobs.filter((job) =>
      ["logo_recolor", "logo_color_batch", "product_color_finalize"].includes(job.kind),
    );
    const container = $("#colorResults");
    if (!colorJobs.length) {
      container.innerHTML = `
        <div class="empty-canvas">
          <span class="empty-symbol">ΔE</span>
          <h2>等待颜色任务</h2>
          <p>每条任务会保留原图、遮罩、成品、对比图和质检清单。</p>
        </div>`;
      return;
    }
    container.innerHTML = colorJobs
      .slice(0, 5)
      .map((job) => {
        const images = (job.outputs || []).filter((asset) => asset.url);
        const manifest = job.options?.qa || job.options?.manifest?.qa;
        return `
          <article class="color-result-card">
            <div class="color-main-image">${images[0] ? `<img src="${escapeHtml(images[0].url)}" alt="">` : ""}</div>
            <div>
              <div class="job-result-head">
                <div><h3>${escapeHtml(jobTitle(job))}</h3><p>${escapeHtml(kindLabels[job.kind])} · ${formatDate(job.created_at)}</p></div>
                ${statusMarkup(job.status)}
              </div>
              <div class="progress-line"><i style="width:${Math.max(2, Number(job.progress) || 0)}%"></i></div>
              <div class="quality-legend" style="margin-bottom:12px">
                <span><i class="pass"></i>通过 ${manifest?.pass ?? "—"}</span>
                <span><i class="review"></i>复核 ${manifest?.review ?? "—"}</span>
                <span><i class="retry"></i>重试 ${manifest?.retry ?? "—"}</span>
              </div>
              <div class="result-image-grid">
                ${images
                  .slice(0, 8)
                  .map(
                    (asset) =>
                      `<a href="${escapeHtml(asset.url)}" target="_blank" rel="noopener"><img src="${escapeHtml(asset.url)}" alt="${escapeHtml(asset.name || "")}" loading="lazy"></a>`,
                  )
                  .join("")}
              </div>
              <div class="result-foot">
                <button class="table-link" type="button" data-job="${escapeHtml(job.id)}">任务详情</button>
                ${job.download_url ? `<a href="${escapeHtml(job.download_url)}">下载完整交付包</a>` : `<span>${escapeHtml(job.message || "")}</span>`}
              </div>
            </div>
          </article>
        `;
      })
      .join("");
    $$("[data-job]", container).forEach((button) => {
      button.addEventListener("click", () => openJob(button.dataset.job));
    });
  }

  function renderJobSurfaces() {
    renderRecentJobs();
    renderRailJobs();
    renderCreateResults();
    renderColorResults();
  }

  function openJob(jobId) {
    const job = state.jobs.find((item) => String(item.id) === String(jobId));
    if (!job) return;
    const images = (job.outputs || []).filter((asset) => asset.url);
    $("#jobDialogBody").innerHTML = `
      <div class="job-result-head">
        <div>
          <p class="eyebrow">${escapeHtml(kindLabels[job.kind] || job.kind)}</p>
          <h2 style="margin:0;font-size:22px">${escapeHtml(jobTitle(job))}</h2>
          <p style="color:var(--muted);font-size:10px">任务 ID：${escapeHtml(job.id)}</p>
        </div>
        ${statusMarkup(job.status)}
      </div>
      <div class="progress-line"><i style="width:${Math.max(2, Number(job.progress) || 0)}%"></i></div>
      <div class="result-image-grid" style="margin-top:16px">
        ${images
          .map(
            (asset) => `
              <a href="${escapeHtml(asset.url)}" target="_blank" rel="noopener">
                <img src="${escapeHtml(asset.url)}" alt="${escapeHtml(asset.name || "")}">
              </a>
            `,
          )
          .join("") || `<div class="empty-canvas" style="grid-column:1/-1"><p>${escapeHtml(job.message || "暂无输出文件")}</p></div>`}
      </div>
      <pre style="white-space:pre-wrap;color:var(--muted);background:rgba(255,255,255,.025);padding:14px;border-radius:9px;font-size:10px;line-height:1.7">${escapeHtml(JSON.stringify(job.options || {}, null, 2))}</pre>
      <div class="dialog-body" style="padding:14px 0 0;display:flex;justify-content:space-between;gap:12px;align-items:center">
        <span style="color:var(--muted);font-size:9px">${escapeHtml(job.error || job.message || "")}</span>
        ${job.download_url ? `<a class="primary-action" style="display:inline-flex;align-items:center;text-decoration:none" href="${escapeHtml(job.download_url)}">下载交付包 ↗</a>` : ""}
      </div>
    `;
    $("#jobDialog").showModal();
  }

  async function createQueuedJob(kind, options, files = []) {
    const data = new FormData();
    data.append("kind", kind);
    data.append("options", JSON.stringify(options));
    files.forEach((file) => data.append("files", file, file.name));
    const response = await fetch("/api/jobs", { method: "POST", body: data });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.detail || "提交任务失败");
    }
    return payload;
  }

  async function submitCreate() {
    const button = $("#generateButton");
    const rawPrompt = $("#createPrompt").value.trim();
    const prompt = rawPrompt || state.category.prompt;
    if (!prompt) {
      toast("请先填写创作描述。", true);
      return;
    }
    if (state.inputMode === "url" && $("#createUrl").value.trim()) {
      toast("图片 URL 已记录为参考信息；当前生成器以描述参数提交。", false);
    }
    const options = {
      prompt,
      count: Number($("#createCount").value),
      size: $("#createRatio").value,
      quality: $("#createQuality").value,
      category: state.category.id,
      model: $("#createModel").value,
      redraw_strength: Number($("#createStrength").value) / 100,
      generate_title: $("#createTitleOption").checked,
      ai_filter: $("#createFilterOption").checked,
      source_mode: state.generationMode,
      reference_url: state.inputMode === "url" ? $("#createUrl").value.trim() : null,
    };
    const cost = estimateCreatePoints();
    button.disabled = true;
    const previous = button.innerHTML;
    button.innerHTML = `<span>正在提交任务…</span><b>···</b>`;
    try {
      const job = await createQueuedJob("product_generate", options, state.createFiles);
      addLedger(`提交${state.category.label}任务`, -cost, job.id);
      toast("任务已进入生产队列。");
      await loadJobs();
    } catch (error) {
      toast(error.message || "任务提交失败", true);
    } finally {
      button.disabled = false;
      button.innerHTML = previous;
    }
  }

  function switchColorMode(mode) {
    state.colorMode = mode;
    $$("[data-color-mode]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.colorMode === mode);
    });
    $$("[data-color-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.colorPanel !== mode;
    });
  }

  async function submitLogoColor(kind) {
    if (kind === "logo" && !state.logoFile) {
      toast("请先添加一个 Logo 文件。", true);
      return;
    }
    if (kind === "batch" && !state.logosFiles.length) {
      toast("请先添加至少一个 Logo 文件。", true);
      return;
    }
    if (kind === "product" && state.productFiles.length < 2) {
      toast("商品多色任务至少需要主图和一张生成图。", true);
      return;
    }
    const button = $(`[data-submit-color="${kind}"]`);
    button.disabled = true;
    try {
      let job;
      if (kind === "logo") {
        const colors = parseHexColors($("#logoColors").value);
        if (!colors.length) throw new Error("请输入至少一个 HEX 颜色。");
        job = await createQueuedJob(
          "logo_recolor",
          {
            colors,
            remove_background: $("#logoBackground").value,
            trim: true,
          },
          [state.logoFile],
        );
        addLedger("Logo 多色生产", -Math.max(2, colors.length), job.id);
      } else if (kind === "batch") {
        const color = $("#batchLogoColor").value.trim();
        if (!/^#?[0-9a-f]{6}$/i.test(color)) throw new Error("品牌色必须是有效 HEX。");
        job = await createQueuedJob(
          "logo_color_batch",
          { color, remove_background: "auto", trim: true },
          state.logosFiles,
        );
        addLedger("多 Logo 统一品牌色", -Math.max(2, state.logosFiles.length), job.id);
      } else {
        const colors = $("#productColors")
          .value.split(/[,，]/)
          .map((item) => {
            const [hex, name] = item.split("|");
            return { hex: hex.trim(), name: (name || "").trim() };
          })
          .filter((item) => /^#[0-9a-f]{6}$/i.test(item.hex));
        if (!colors.length) throw new Error("请输入至少一个有效色值。");
        job = await createQueuedJob(
          "product_color_finalize",
          { colors, pass_limit: 3, review_limit: 5 },
          state.productFiles,
        );
        addLedger("商品多色与 ΔE 质检", -Math.max(3, colors.length * 2), job.id);
      }
      toast("颜色任务已进入生产队列。");
      await loadJobs();
    } catch (error) {
      toast(error.message || "颜色任务提交失败", true);
    } finally {
      button.disabled = false;
    }
  }

  function renderHistory() {
    const query = $("#historySearch").value.trim().toLowerCase();
    const status = $("#historyStatus").value;
    const kind = $("#historyKind").value;
    const jobs = state.jobs.filter((job) => {
      const haystack = `${job.id} ${jobTitle(job)} ${kindLabels[job.kind] || job.kind}`.toLowerCase();
      return (!query || haystack.includes(query)) && (!status || job.status === status) && (!kind || job.kind === kind);
    });
    const rows = $("#historyRows");
    rows.innerHTML = jobs
      .map(
        (job) => `
          <tr>
            <td><b>${escapeHtml(jobTitle(job))}</b><small>${escapeHtml(job.id)}</small></td>
            <td>${escapeHtml(kindLabels[job.kind] || job.kind)}</td>
            <td>${statusMarkup(job.status)}</td>
            <td>${formatDate(job.created_at)}</td>
            <td><span class="table-bar"><i style="width:${Number(job.progress) || 0}%"></i></span></td>
            <td><button class="table-link" type="button" data-job="${escapeHtml(job.id)}">查看详情</button></td>
          </tr>
        `,
      )
      .join("");
    $("#historyEmpty").hidden = jobs.length > 0;
    $$("[data-job]", rows).forEach((button) => {
      button.addEventListener("click", () => openJob(button.dataset.job));
    });
  }

  function renderAssets() {
    const assets = state.jobs.flatMap((job) =>
      (job.outputs || [])
        .filter((asset) => asset.url)
        .map((asset) => ({ ...asset, job })),
    );
    $("#assetCount").textContent = assets.length;
    $("#assetJobCount").textContent = state.jobs.length;
    $("#assetZipCount").textContent = state.jobs.filter((job) => job.download_url).length;
    const grid = $("#assetGrid");
    if (!assets.length) {
      grid.innerHTML = `<div class="empty-canvas" style="grid-column:1/-1;min-height:300px"><span class="empty-symbol">▧</span><h2>暂无图片素材</h2><p>完成一次生产任务后，输出图片会自动汇总到这里。</p></div>`;
      return;
    }
    grid.innerHTML = assets
      .slice(0, 100)
      .map(
        (asset) => `
          <a class="asset-tile" href="${escapeHtml(asset.url)}" target="_blank" rel="noopener">
            <img src="${escapeHtml(asset.url)}" alt="${escapeHtml(asset.name || "")}" loading="lazy">
            <span>${escapeHtml(asset.name || "生成图片")}</span>
          </a>
        `,
      )
      .join("");
  }

  function renderBilling() {
    const rows = $("#billingRows");
    if (!state.ledger.length) {
      rows.innerHTML = `<tr><td colspan="5"><div class="table-empty" style="min-height:180px">暂无本地积分流水。提交一次任务后会在这里记录。</div></td></tr>`;
      return;
    }
    rows.innerHTML = state.ledger
      .slice(0, 80)
      .map(
        (entry) => `
          <tr>
            <td>${formatDate(entry.time)}</td>
            <td>${escapeHtml(entry.type)}</td>
            <td>${escapeHtml(entry.description)}</td>
            <td>${escapeHtml(entry.jobId || "—")}</td>
            <td style="color:${entry.points < 0 ? "var(--red)" : "var(--green)"}">${entry.points > 0 ? "+" : ""}${entry.points}</td>
          </tr>
        `,
      )
      .join("");
  }

  function defaultTemplates() {
    return [
      {
        id: crypto.randomUUID(),
        name: "男装 T 恤棚拍",
        kind: "product",
        category: "t_shirt",
        colors: ["#1D2A44", "#8C1A2D", "#6B6F45"],
        note: "3:4，干净棚拍，保留印花和服装版型。",
        createdAt: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        name: "精准商品多色",
        kind: "color",
        category: "custom",
        colors: ["#D4684F", "#1D2A44"],
        note: "Muse 生成后回收，执行精确 HEX 与 ΔE2000。",
        createdAt: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        name: "工厂切片 · T 恤",
        kind: "cutting",
        category: "t_shirt",
        colors: [],
        note: "待补充前后片切图 JSON 和打印尺寸。",
        createdAt: new Date().toISOString(),
      },
    ];
  }

  function renderTemplates() {
    const list = state.templates.filter(
      (template) => state.templateFilter === "all" || template.kind === state.templateFilter,
    );
    $("#templateCount").textContent = `${list.length} 个模板`;
    const grid = $("#templateGrid");
    if (!list.length) {
      grid.innerHTML = `<div class="empty-canvas" style="grid-column:1/-1;min-height:300px"><span class="empty-symbol">⚙</span><h2>这个分类还没有模板</h2><p>点击右上角新建模板。</p></div>`;
      return;
    }
    const kindLabel = { product: "商品生图", color: "精准配色", cutting: "工厂切片" };
    const categoryLabel = Object.fromEntries(categories.map((item) => [item.id, item.label]));
    grid.innerHTML = list
      .map(
        (template) => `
          <article class="template-card">
            <header>
              <span class="template-icon">${template.kind === "cutting" ? "✂" : template.kind === "color" ? "ΔE" : "T"}</span>
              <span class="small-status">${escapeHtml(kindLabel[template.kind] || template.kind)}</span>
            </header>
            <h3>${escapeHtml(template.name)}</h3>
            <p>${escapeHtml(template.note || "暂无备注")}</p>
            <p style="margin-top:10px">${escapeHtml(categoryLabel[template.category] || template.category)}</p>
            <div class="swatch-preview">
              ${(template.colors || [])
                .map((color) => `<i title="${escapeHtml(color)}" style="--swatch:${escapeHtml(color)}"></i>`)
                .join("")}
            </div>
            <footer>
              <span>${formatDate(template.createdAt, false)}</span>
              <button class="delete-template" type="button" data-delete-template="${escapeHtml(template.id)}">删除</button>
            </footer>
          </article>
        `,
      )
      .join("");
    $$("[data-delete-template]", grid).forEach((button) => {
      button.addEventListener("click", () => {
        state.templates = state.templates.filter((item) => item.id !== button.dataset.deleteTemplate);
        persistState();
        renderTemplates();
        toast("模板已删除。");
      });
    });
  }

  function saveTemplate() {
    const name = $("#templateName").value.trim();
    if (!name) {
      toast("请填写模板名称。", true);
      return;
    }
    state.templates.unshift({
      id: crypto.randomUUID(),
      name,
      kind: $("#templateKind").value,
      category: $("#templateCategory").value,
      colors: parseHexColors($("#templateColors").value),
      note: $("#templateNote").value.trim(),
      createdAt: new Date().toISOString(),
    });
    persistState();
    $("#templateDialog").close();
    $("#templateName").value = "";
    $("#templateNote").value = "";
    renderTemplates();
    toast("模板已保存。");
  }

  function renderSuiteCategories() {
    $("#suiteCategories").innerHTML = suiteCategoryItems
      .map(
        ([id, label, note]) => `
          <button type="button" class="suite-category${state.suiteSelected.has(id) ? " is-active" : ""}" data-suite-category="${id}">
            ${escapeHtml(label)}<small>${escapeHtml(note)}</small>
          </button>
        `,
      )
      .join("");
    $$("[data-suite-category]").forEach((button) => {
      button.addEventListener("click", () => {
        if (state.suiteSelected.has(button.dataset.suiteCategory)) {
          state.suiteSelected.delete(button.dataset.suiteCategory);
        } else {
          state.suiteSelected.add(button.dataset.suiteCategory);
        }
        renderSuiteCategories();
      });
    });
  }

  function submitSuitePrototype() {
    if (!state.suiteFiles.length) {
      toast("请先上传设计图。", true);
      return;
    }
    if (!state.suiteSelected.size) {
      toast("请至少选择一个商品类目。", true);
      return;
    }
    const record = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      fileName: state.suiteFiles[0].name,
      categories: [...state.suiteSelected],
      status: "待接入渲染器",
      points: state.suiteSelected.size * 2,
    };
    state.cuttingRecords.unshift(record);
    addLedger(`模板套图参数记录 · ${state.suiteSelected.size} 个类目`, -record.points, record.id);
    persistState();
    toast("套图参数已保存；当前版本未伪装成已生成成品。");
  }

  function renderCuttingRecords() {
    const container = $("#cuttingRecords");
    const records = state.cuttingRecords.filter((record) => record.kind !== "suite");
    if (!records.length) {
      container.innerHTML = `<div class="empty-canvas" style="min-height:230px"><p>暂无切片记录</p></div>`;
      return;
    }
    container.innerHTML = records
      .slice(0, 10)
      .map(
        (record) => `
          <div class="rail-task">
            <span style="display:flex;justify-content:space-between;gap:8px">
              <b>${escapeHtml(record.typeLabel || "切片任务")}</b>
              <span class="small-status">${escapeHtml(record.status)}</span>
            </span>
            <p>${escapeHtml(record.fileName || record.id)}</p>
            <small>${formatDate(record.createdAt)} · ${record.points || 2} AI 点</small>
          </div>
        `,
      )
      .join("");
  }

  function submitCuttingPrototype() {
    if (!state.cuttingFile) {
      toast("请先上传设计图。", true);
      return;
    }
    const typeLabels = {
      tshirt: "T恤",
      hoodie: "卫衣",
      blanket: "毛毯",
      groundmat: "地垫",
      beach_towel: "沙滩巾",
    };
    const type = $("#cuttingType").value;
    const record = {
      id: crypto.randomUUID(),
      kind: "cutting",
      type,
      typeLabel: `${typeLabels[type]}切片`,
      fileName: state.cuttingFile.name,
      createdAt: new Date().toISOString(),
      status: "等待配置",
      points: 2,
    };
    state.cuttingRecords.unshift(record);
    addLedger(`工厂切片参数记录 · ${typeLabels[type]}`, -2, record.id);
    persistState();
    renderCuttingRecords();
    toast("切片参数已保存；请补充该品类的切图配置 JSON 后才能生成面片。");
  }

  function loadProfile() {
    $("#profileDisplayName").value = state.profile.name;
    $("#profileBrandColor").value = state.profile.brandColor;
    $("#profileCompactTitles").checked = Boolean(state.profile.compactTitles);
    $("#profileName").textContent = state.profile.name;
  }

  function saveProfile() {
    state.profile = {
      name: $("#profileDisplayName").value.trim() || "Visual Creator",
      brandColor: $("#profileBrandColor").value.trim() || "#D4684F",
      compactTitles: $("#profileCompactTitles").checked,
    };
    persistState();
    loadProfile();
    toast("工作台设置已保存。");
  }

  async function checkHealth() {
    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      if (!response.ok) throw new Error("服务状态异常");
      const payload = await response.json();
      $("#sideQueueTitle").textContent = "异步队列在线";
      $("#sideQueueText").textContent = `${payload.workers || 1} 个 worker · 可恢复`;
      $(".queue-state").classList.add("online");
      $("#metricQueue").textContent = "在线";
      $("#apiStatus").textContent = "已连接";
      $("#providerStatus").textContent = payload.demo_mode
        ? "本地演示模型"
        : `${payload.provider} · ${payload.model || "已配置"}`;
      $("#apiAddress").textContent = location.origin;
    } catch {
      $("#sideQueueTitle").textContent = "本地服务离线";
      $("#sideQueueText").textContent = "请启动 visualforge serve";
      $("#metricQueue").textContent = "离线";
      $("#apiStatus").textContent = "未连接";
      $("#providerStatus").textContent = "未知";
    }
  }

  function bindEvents() {
    $$("[data-auth-mode]").forEach((button) => {
      button.addEventListener("click", () => setAuthMode(button.dataset.authMode));
    });
    $("#captchaButton").addEventListener("click", refreshCaptcha);
    $("#authForm").addEventListener("submit", handleAuthSubmit);
    $("#demoEntry").addEventListener("click", enterDemo);
    $("#logoutButton").addEventListener("click", logout);

    $$("[data-view]").forEach((element) => {
      element.addEventListener("click", (event) => {
        event.preventDefault();
        if (element.dataset.view === "home") {
          showView("home");
        } else {
          showView(element.dataset.view);
        }
      });
    });
    $("#backButton").addEventListener("click", () => showView(state.previousView || "home"));
    $("#menuToggle").addEventListener("click", () => {
      $("#sidebar").classList.add("is-open");
      $("#sidebarScrim").classList.add("is-visible");
    });
    $("#sidebarScrim").addEventListener("click", closeSidebar);

    $("#generationMode").addEventListener("click", (event) => {
      const button = event.target.closest("[data-mode]");
      if (!button) return;
      state.generationMode = button.dataset.mode;
      $$("#generationMode button").forEach((item) => {
        item.classList.toggle("is-active", item === button);
      });
      $("#createUploadTitle").textContent =
        state.generationMode === "batch" ? "添加数据文件" : "添加参考图";
      $("#createUploadHint").textContent =
        state.generationMode === "batch" ? "支持图片或任务数据文件" : "拖入图片，或点击选择";
    });

    $("#inputMode").addEventListener("click", (event) => {
      const button = event.target.closest("[data-input]");
      if (!button) return;
      state.inputMode = button.dataset.input;
      $$("#inputMode button").forEach((item) => {
        item.classList.toggle("is-active", item === button);
      });
      $("#createUpload").hidden = state.inputMode !== "upload";
      $("#createUrl").hidden = state.inputMode !== "url";
    });

    wireUploadZone($("#createUpload"), $("#createFile"), $("#createPreview"), (files) => {
      state.createFiles = files;
    });
    wireUploadZone($("#logoUpload"), $("#logoFile"), $("#logoPreview"), (files) => {
      state.logoFile = files[0];
    });
    wireUploadZone($("#logosUpload"), $("#logosFiles"), null, (files) => {
      state.logosFiles = files;
    });
    wireUploadZone($("#productUpload"), $("#productFiles"), null, (files) => {
      state.productFiles = files;
      $("#productFileList").innerHTML = files
        .map(
          (file, index) =>
            `<span><b>${index === 0 ? "主图 · " : ""}${escapeHtml(file.name)}</b><small>${Math.ceil(file.size / 1024)} KB</small></span>`,
        )
        .join("");
    });
    wireUploadZone($("#suiteUpload"), $("#suiteFile"), $("#suitePreview"), (files) => {
      state.suiteFiles = files;
    });
    wireUploadZone($("#cuttingUpload"), $("#cuttingFile"), $("#cuttingPreview"), (files) => {
      state.cuttingFile = files[0];
    });

    [
      "#createModel",
      "#createCount",
      "#createTitleOption",
      "#createFilterOption",
      "#createStrength",
    ].forEach((selector) => {
      $(selector).addEventListener("input", updateEstimate);
      $(selector).addEventListener("change", updateEstimate);
    });
    $("#generateButton").addEventListener("click", submitCreate);
    $("#refreshResults").addEventListener("click", loadJobs);
    $("#refreshDashboard").addEventListener("click", loadJobs);
    $("#resultFilter").addEventListener("change", renderCreateResults);

    $("#colorModeTabs").addEventListener("click", (event) => {
      const button = event.target.closest("[data-color-mode]");
      if (button) switchColorMode(button.dataset.colorMode);
    });
    $("#logoColors").addEventListener("input", renderSwatches);
    $$("[data-submit-color]").forEach((button) => {
      button.addEventListener("click", () => submitLogoColor(button.dataset.submitColor));
    });

    $("#historyRefresh").addEventListener("click", loadJobs);
    $("#historySearch").addEventListener("input", renderHistory);
    $("#historyStatus").addEventListener("change", renderHistory);
    $("#historyKind").addEventListener("change", renderHistory);
    $("#assetsRefresh").addEventListener("click", loadJobs);

    $("#newTemplateButton").addEventListener("click", () => {
      $("#templateDialog").showModal();
    });
    $("#saveTemplateButton").addEventListener("click", saveTemplate);
    $("#templateFilter").addEventListener("click", (event) => {
      const button = event.target.closest("[data-filter]");
      if (!button) return;
      state.templateFilter = button.dataset.filter;
      $$("#templateFilter button").forEach((item) => item.classList.toggle("is-active", item === button));
      renderTemplates();
    });

    $("#suiteSubmit").addEventListener("click", submitSuitePrototype);
    $("#cuttingSubmit").addEventListener("click", submitCuttingPrototype);
    $("#saveProfileButton").addEventListener("click", saveProfile);
    $("#rechargeButton").addEventListener("click", () => {
      addLedger("演示充值", 500, "LOCAL");
      renderBilling();
      toast("已添加 500 个演示 AI 点。");
    });
    $("#noticeButton").addEventListener("click", () => $("#noticeDialog").showModal());
    $("#settingsButton").addEventListener("click", () => showView("profile"));
  }

  function initialize() {
    state.points = Number(readStorage("muse-visual-forge-points", 1480)) || 1480;
    state.ledger = readStorage("muse-visual-forge-ledger", []);
    state.templates = readStorage("muse-visual-forge-templates", null) || defaultTemplates();
    state.cuttingRecords = readStorage("muse-visual-forge-cutting", []);
    state.profile = {
      ...state.profile,
      ...readStorage("muse-visual-forge-profile", {}),
    };
    renderHomeFeatures();
    renderCategoryStrip();
    renderSwatches();
    renderSuiteCategories();
    renderTemplates();
    renderCuttingRecords();
    loadProfile();
    updatePoints();
    updateEstimate();
    bindEvents();
    checkHealth();
    state.auth = authStorage();
    if (state.auth) {
      showApp();
    } else {
      showAuth();
    }
    state.pollTimer = window.setInterval(() => {
      if (document.visibilityState === "visible" && state.auth) loadJobs();
    }, 3500);
  }

  initialize();
})();

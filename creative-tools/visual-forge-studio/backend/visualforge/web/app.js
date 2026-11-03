const state = {
  jobs: [],
  busy: false,
};

const kindLabels = {
  logo_recolor: "单 Logo · 多色",
  logo_color_batch: "单色 · 多 Logo",
  product_generate: "单款 · 文生图裂变",
  product_color_finalize: "Muse · 商品多色",
};

const statusLabels = {
  queued: "排队中",
  running: "生成中",
  succeeded: "已完成",
  failed: "失败",
};

const notice = document.querySelector("#notice");
const jobGrid = document.querySelector("#jobGrid");
const jobTemplate = document.querySelector("#jobTemplate");
const serviceState = document.querySelector("#serviceState");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showNotice(message, success = false) {
  notice.textContent = message;
  notice.classList.toggle("is-success", success);
  notice.hidden = false;
  window.clearTimeout(showNotice.timer);
  showNotice.timer = window.setTimeout(() => {
    notice.hidden = true;
  }, 6000);
}

function switchPanel(panelId) {
  document.querySelectorAll(".mode-tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.panel === panelId);
  });
  document.querySelectorAll(".mode-panel").forEach((panel) => {
    panel.classList.toggle("is-active", panel.id === panelId);
  });
}

document.querySelectorAll(".mode-tab").forEach((tab) => {
  tab.addEventListener("click", () => switchPanel(tab.dataset.panel));
});

document.querySelectorAll(".upload-zone").forEach((zone) => {
  const input = zone.querySelector("input[type=file]");
  const label = zone.querySelector("[data-file-label]");
  const original = label.textContent;

  function updateLabel() {
    const files = [...input.files];
    if (!files.length) {
      label.textContent = original;
    } else if (files.length === 1) {
      label.textContent = files[0].name;
    } else {
      label.textContent = `已选择 ${files.length} 个文件`;
    }
  }

  input.addEventListener("change", updateLabel);
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
    if (!event.dataTransfer.files.length) return;
    input.files = event.dataTransfer.files;
    updateLabel();
  });
});

function optionsFor(kind, form) {
  if (kind === "logo_recolor") {
    return {
      colors: form.elements.colors.value,
      remove_background: form.elements.background.value,
      trim: true,
    };
  }
  if (kind === "logo_color_batch") {
    return {
      color: form.elements.color.value,
      remove_background: form.elements.background.value,
      trim: true,
    };
  }
  return {
    prompt: form.elements.prompt.value.trim(),
    count: Number(form.elements.count.value),
    size: form.elements.size.value,
    quality: form.elements.quality.value,
  };
}

async function createJob(form) {
  const kind = form.dataset.kind;
  const options = optionsFor(kind, form);
  const files = [...form.querySelectorAll("input[type=file]")].flatMap((input) => [
    ...input.files,
  ]);
  if (kind !== "product_generate" && !files.length) {
    showNotice("请先选择至少一个 Logo 文件。");
    return;
  }

  const data = new FormData();
  data.append("kind", kind);
  data.append("options", JSON.stringify(options));
  files.forEach((file) => data.append("files", file));

  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  const buttonText = submit.querySelector("span");
  const previousText = buttonText.textContent;
  buttonText.textContent = "正在提交任务…";
  try {
    const response = await fetch("/api/jobs", { method: "POST", body: data });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.detail || "提交失败");
    }
    showNotice("任务已进入生产队列。", true);
    form.reset();
    form.querySelectorAll("[data-file-label]").forEach((label) => {
      label.textContent = label.closest(".upload-zone").querySelector("input").multiple
        ? "选择多个 Logo 文件"
        : "拖入 Logo，或点击选择";
    });
    await loadJobs();
  } catch (error) {
    showNotice(error.message || "任务提交失败");
  } finally {
    submit.disabled = false;
    buttonText.textContent = previousText;
  }
}

document.querySelectorAll(".mode-panel").forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    createJob(form);
  });
});

function renderJob(job) {
  const card = jobTemplate.content.firstElementChild.cloneNode(true);
  card.querySelector(".job-kind").textContent = kindLabels[job.kind] || job.kind;
  const colorOptions = Array.isArray(job.options.colors)
    ? job.options.colors
        .map((color) => (typeof color === "string" ? color : color.hex))
        .filter(Boolean)
        .join(", ")
    : job.options.colors;
  card.querySelector(".job-title").textContent =
    job.options.prompt?.slice(0, 42) ||
    colorOptions ||
    job.options.color ||
    `任务 ${job.id.slice(0, 8)}`;

  const status = card.querySelector(".job-status");
  status.textContent = statusLabels[job.status] || job.status;
  status.classList.toggle("is-succeeded", job.status === "succeeded");
  status.classList.toggle("is-failed", job.status === "failed");

  card.querySelector(".progress i").style.width = `${job.progress || 0}%`;
  const message = card.querySelector(".job-message");
  message.textContent =
    job.status === "failed"
      ? job.error || "处理失败"
      : job.message || statusLabels[job.status];
  message.classList.toggle("is-error", job.status === "failed");

  const outputs = card.querySelector(".job-outputs");
  job.outputs.slice(0, 8).forEach((asset) => {
    if (!asset.url) return;
    const link = document.createElement("a");
    link.href = asset.url;
    link.target = "_blank";
    link.rel = "noopener";
    link.title = asset.name;
    const image = document.createElement("img");
    image.src = asset.url;
    image.alt = asset.name;
    image.loading = "lazy";
    link.append(image);
    outputs.append(link);
  });

  const download = card.querySelector(".job-download");
  if (job.download_url) {
    download.href = job.download_url;
    download.hidden = false;
  }
  const date = new Date(job.created_at);
  card.querySelector(".job-time").textContent = Number.isNaN(date.getTime())
    ? job.created_at
    : date.toLocaleString("zh-CN", { hour12: false });
  return card;
}

function renderJobs() {
  jobGrid.replaceChildren();
  if (!state.jobs.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML =
      "<span>VF</span><p>还没有生产记录</p><small>从上方选择一个模式开始</small>";
    jobGrid.append(empty);
    return;
  }
  state.jobs.forEach((job) => jobGrid.append(renderJob(job)));
}

async function loadJobs() {
  try {
    const response = await fetch("/api/jobs?limit=30");
    if (!response.ok) throw new Error("读取任务失败");
    const payload = await response.json();
    state.jobs = payload.jobs;
    renderJobs();
  } catch (error) {
    showNotice(error.message);
  }
}

async function checkHealth() {
  try {
    const response = await fetch("/api/health");
    const payload = await response.json();
    serviceState.classList.add("is-online");
    serviceState.classList.toggle("is-demo", payload.demo_mode);
    serviceState.querySelector("span:last-child").textContent = payload.demo_mode
      ? "本地演示模式"
      : `${payload.provider} · ${payload.model}`;
  } catch {
    serviceState.querySelector("span:last-child").textContent = "服务连接失败";
  }
}

document.querySelector("#refreshJobs").addEventListener("click", loadJobs);

checkHealth();
loadJobs();
window.setInterval(() => {
  if (document.visibilityState === "visible") loadJobs();
}, 2500);


"use strict";

const state = {
  token: localStorage.getItem("vfDashboardToken") || "",
  user: null,
  tasks: [],
  users: [],
  imageUrls: [],
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function moduleLabel(module) {
  return {
    product_generate: "文案生图",
    product_color_finalize: "商品配色",
    pattern_batch_finalize: "印花套图",
    logo_recolor: "Logo 多色",
    logo_color_batch: "多 Logo 同色",
  }[module] || module;
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(options.body);
  }
  const response = await fetch(path, { ...options, headers });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("json")
    ? await response.json()
    : await response.text();
  if (!response.ok) {
    const detail =
      typeof payload === "object" && payload?.detail
        ? payload.detail
        : `请求失败：${response.status}`;
    throw new Error(detail);
  }
  return payload;
}

async function authenticatedBlobUrl(url) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${state.token}` },
  });
  if (!response.ok) throw new Error(`图片读取失败：${response.status}`);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  state.imageUrls.push(objectUrl);
  return objectUrl;
}

function releaseImageUrls() {
  for (const url of state.imageUrls) URL.revokeObjectURL(url);
  state.imageUrls = [];
}

async function login(event) {
  event.preventDefault();
  try {
    const result = await api("/api/v1/auth/login", {
      method: "POST",
      body: {
        username: $("#loginUsername").value,
        password: $("#loginPassword").value,
      },
    });
    state.token = result.token;
    state.user = result.user;
    localStorage.setItem("vfDashboardToken", state.token);
    showApp();
    await refresh();
  } catch (error) {
    $("#loginError").textContent = error.message;
  }
}

function showApp() {
  $("#loginView").hidden = true;
  $("#appView").hidden = false;
  $("#userMeta").textContent = `${state.user.display_name} · ${state.user.role}`;
  $("#memberSection").hidden = state.user.role !== "admin";
}

function showLogin() {
  state.token = "";
  localStorage.removeItem("vfDashboardToken");
  $("#appView").hidden = true;
  $("#loginView").hidden = false;
}

async function refresh() {
  const [overview, taskResult] = await Promise.all([
    api("/api/v1/stats/overview"),
    loadTasks(),
  ]);
  $("#metricTasks").textContent = overview.total_tasks;
  $("#metricArtifacts").textContent = overview.total_artifacts;
  $("#metricToday").textContent = overview.today_tasks;
  $("#metricUsers").textContent = overview.member_count ?? overview.users.length;
  renderUserFilter(overview.users || []);
  if (state.user.role === "admin") await loadUsers();
}

async function loadTasks() {
  const params = new URLSearchParams();
  if ($("#searchInput").value) params.set("q", $("#searchInput").value);
  if ($("#userFilter").value) params.set("user", $("#userFilter").value);
  if ($("#moduleFilter").value) params.set("module", $("#moduleFilter").value);
  if ($("#statusFilter").value) params.set("status", $("#statusFilter").value);
  const result = await api(`/api/v1/tasks?${params.toString()}`);
  state.tasks = result.tasks || [];
  renderTasks();
  return result;
}

async function renderTasks() {
  releaseImageUrls();
  const grid = $("#taskGrid");
  grid.replaceChildren();
  $("#emptyState").hidden = state.tasks.length > 0;
  for (const task of state.tasks) {
    const card = document.createElement("article");
    card.className = "task-card";
    card.addEventListener("click", () => openTask(task.id));
    const thumb = document.createElement("div");
    thumb.className = "task-thumb";
    if (task.thumbnail_url) {
      try {
        const image = document.createElement("img");
        image.src = await authenticatedBlobUrl(task.thumbnail_url);
        image.loading = "lazy";
        thumb.append(image);
      } catch {
        thumb.textContent = "暂无预览";
      }
    } else {
      thumb.textContent = "暂无预览";
    }
    const body = document.createElement("div");
    body.className = "task-card-body";
    const title = document.createElement("h3");
    title.textContent = task.prompt || `${moduleLabel(task.module)} · ${task.id.slice(0, 8)}`;
    const meta = document.createElement("p");
    const status = document.createElement("span");
    status.className = `status ${task.status}`;
    status.textContent = {
      completed: "已完成",
      failed: "失败",
      running: "生成中",
    }[task.status] || task.status;
    meta.append(status, document.createTextNode(` ${moduleLabel(task.module)} · ${task.sku || "无货号"} · ${task.artifact_count || 0} 张`));
    body.append(title, meta);
    card.append(thumb, body);
    grid.append(card);
  }
}

async function openTask(taskId) {
  const task = await api(`/api/v1/tasks/${taskId}`);
  const result = await api(`/api/v1/tasks/${taskId}/artifacts`);
  $("#taskDialogTitle").textContent = `${moduleLabel(task.module)} · ${task.sku || task.id.slice(0, 8)}`;
  const body = $("#taskDialogBody");
  body.replaceChildren();
  const info = document.createElement("p");
  info.textContent = task.prompt || "无提示词";
  body.append(info);
  const grid = document.createElement("div");
  grid.className = "detail-grid";
  for (const artifact of result.artifacts || []) {
    const item = document.createElement("div");
    item.className = "detail-item";
    if (artifact.thumbnail_url) {
      try {
        const image = document.createElement("img");
        image.src = await authenticatedBlobUrl(artifact.thumbnail_url);
        item.append(image);
      } catch {
        // Keep the download link even when a thumbnail cannot be rendered.
      }
    }
    const link = document.createElement("button");
    link.type = "button";
    link.textContent = artifact.filename;
    link.addEventListener("click", () => downloadArtifact(artifact));
    item.append(link);
    grid.append(item);
  }
  body.append(grid);
  $("#taskDialog").showModal();
}

async function downloadArtifact(artifact) {
  try {
    const url = await authenticatedBlobUrl(artifact.download_url);
    const link = document.createElement("a");
    link.href = url;
    link.download = artifact.filename;
    document.body.append(link);
    link.click();
    link.remove();
  } catch (error) {
    alert(error.message);
  }
}

async function uploadTask(event) {
  event.preventDefault();
  const files = $("#uploadFiles").files;
  if (!files.length) {
    alert("请选择图片文件");
    return;
  }
  try {
    const task = await api("/api/v1/tasks", {
      method: "POST",
      body: {
        module: $("#uploadModule").value,
        sku: $("#uploadSku").value,
        prompt: $("#uploadPrompt").value,
        status: "completed",
      },
    });
    const form = new FormData();
    for (const file of files) form.append("files", file, file.name);
    await api(`/api/v1/tasks/${task.id}/artifacts`, {
      method: "POST",
      body: form,
    });
    $("#uploadDialog").close();
    $("#uploadForm").reset();
    await refresh();
  } catch (error) {
    alert(error.message);
  }
}

async function loadUsers() {
  const result = await api("/api/v1/users");
  state.users = result.users || [];
  const list = $("#userList");
  list.replaceChildren();
  for (const user of state.users) {
    const item = document.createElement("div");
    item.className = "user-card";
    const name = document.createElement("strong");
    name.textContent = user.display_name;
    const meta = document.createElement("span");
    meta.textContent = `${user.username} · ${user.role}`;
    item.append(name, meta);
    list.append(item);
  }
  renderUserFilter(state.users);
}

function renderUserFilter(users) {
  const select = $("#userFilter");
  const current = select.value;
  select.replaceChildren(new Option("全部成员", ""));
  for (const user of users) {
    const option = document.createElement("option");
    option.value = user.id;
    option.textContent = user.display_name || user.username;
    select.append(option);
  }
  select.value = current;
}

async function createUser(event) {
  event.preventDefault();
  try {
    await api("/api/v1/users", {
      method: "POST",
      body: {
        username: $("#newUsername").value,
        display_name: $("#newDisplayName").value,
        password: $("#newPassword").value,
        role: $("#newRole").value,
      },
    });
    $("#userDialog").close();
    $("#userForm").reset();
    await loadUsers();
  } catch (error) {
    alert(error.message);
  }
}

$("#loginForm").addEventListener("submit", login);
$("#logoutButton").addEventListener("click", showLogin);
$("#refreshButton").addEventListener("click", () => refresh().catch(alert));
$("#searchInput").addEventListener("input", () => loadTasks().catch(alert));
$("#userFilter").addEventListener("change", () => loadTasks().catch(alert));
$("#moduleFilter").addEventListener("change", () => loadTasks().catch(alert));
$("#statusFilter").addEventListener("change", () => loadTasks().catch(alert));
$("#newTaskButton").addEventListener("click", () => $("#uploadDialog").showModal());
$("#closeTaskButton").addEventListener("click", () => $("#taskDialog").close());
$("#closeUploadButton").addEventListener("click", () => $("#uploadDialog").close());
$("#closeUserButton").addEventListener("click", () => $("#userDialog").close());
$("#uploadForm").addEventListener("submit", uploadTask);
$("#addUserButton").addEventListener("click", () => $("#userDialog").showModal());
$("#userForm").addEventListener("submit", createUser);

if (state.token) {
  (async () => {
    try {
      state.user = await api("/api/v1/auth/me");
      showApp();
      await refresh();
    } catch {
      showLogin();
    }
  })();
}

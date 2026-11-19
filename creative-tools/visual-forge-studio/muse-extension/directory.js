"use strict";

const directoryStatus = document.querySelector("#directoryStatus");
const status = document.querySelector("#status");
const choose = document.querySelector("#chooseDirectory");
const reauthorize = document.querySelector("#reauthorizeDirectory");
const closePage = document.querySelector("#closePage");
let preparedHandle = null;
let preparedPermission = "missing";

function showStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("is-error", isError);
  status.classList.add("is-visible");
}

async function refresh() {
  const current = await VisualForgeArchive.status();
  preparedHandle = await VisualForgeArchive.getSavedHandle();
  preparedPermission = current.permission;
  const permissionLabel = {
    granted: "已授权",
    prompt: "可重新授权",
    denied: "权限被拒绝，请选择新目录",
    missing: "需要选择目录",
  }[current.permission] || current.permission;
  directoryStatus.textContent = current.name
    ? `当前目录：${current.name} · ${permissionLabel}`
    : "当前尚未选择归档目录";
  reauthorize.disabled =
    !preparedHandle || preparedPermission === "granted";
  reauthorize.title = !preparedHandle
    ? "请先选择一个目录"
    : preparedPermission === "granted"
      ? "当前目录已经授权"
      : "重新向浏览器申请当前目录的读写权限";
}

choose.addEventListener("click", async () => {
  choose.disabled = true;
  reauthorize.disabled = true;
  try {
    const handle = await VisualForgeArchive.chooseNewDirectory();
    await refresh();
    showStatus(`已选择新目录：${handle.name}`);
  } catch (error) {
    showStatus(error.message, true);
    await refresh();
  } finally {
    choose.disabled = false;
  }
});

reauthorize.addEventListener("click", async () => {
  choose.disabled = true;
  reauthorize.disabled = true;
  try {
    const handle = await VisualForgeArchive.reauthorizeSavedDirectory({
      handle: preparedHandle,
      permission: preparedPermission,
    });
    await refresh();
    showStatus(`已重新授权目录：${handle.name}`);
  } catch (error) {
    showStatus(error.message, true);
    await refresh();
  } finally {
    choose.disabled = false;
  }
});

closePage.addEventListener("click", () => window.close());

void refresh().catch((error) => showStatus(error.message, true));


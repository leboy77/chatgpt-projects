"use strict";

const directoryStatus = document.querySelector("#directoryStatus");
const status = document.querySelector("#status");
const choose = document.querySelector("#chooseDirectory");
const closePage = document.querySelector("#closePage");

function showStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("is-error", isError);
  status.classList.add("is-visible");
}

async function refresh() {
  const current = await VisualForgeArchive.status();
  directoryStatus.textContent = current.name
    ? `当前目录：${current.name} · ${current.permission === "granted" ? "已授权" : "需要重新授权"}`
    : "当前尚未选择归档目录";
}

choose.addEventListener("click", async () => {
  choose.disabled = true;
  try {
    const handle = await VisualForgeArchive.chooseDirectory();
    await refresh();
    showStatus(`已授权目录：${handle.name}`);
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    choose.disabled = false;
  }
});

closePage.addEventListener("click", () => window.close());

void refresh().catch((error) => showStatus(error.message, true));


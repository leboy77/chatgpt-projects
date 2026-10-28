(() => {
  "use strict";

  const pagePath = location.pathname.toLowerCase();
  const supportedPage =
    /\/(?:mall|search_result|goods)\.html$/.test(pagePath) ||
    /-g-\d+\.html$/.test(pagePath);
  if (!supportedPage) return;
  if (window.__TEC_TEMU_SAVE_BRIDGE__) return;
  window.__TEC_TEMU_SAVE_BRIDGE__ = true;

  const DB_NAME = "tec-temu-save-bridge";
  const STORE_NAME = "directory-handles";
  const HANDLE_KEY = "output-directory";
  const PICK_BUTTON_ID = "tec-page-save-picker";
  let directoryHandle = null;
  let database = null;

  function notify(type, payload = {}) {
    window.postMessage(
      {
        __tecTemuBridge: true,
        type,
        ...payload,
      },
      location.origin,
    );
  }

  function openDatabase() {
    if (database) return Promise.resolve(database);
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => {
        database = request.result;
        resolve(database);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async function readStoredHandle() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(HANDLE_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async function storeHandle(handle) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async function permissionState(handle) {
    if (!handle?.queryPermission) return "unsupported";
    try {
      return await handle.queryPermission({ mode: "readwrite" });
    } catch {
      return "denied";
    }
  }

  async function publishDirectoryState(error = "") {
    const permission = await permissionState(directoryHandle);
    const available = Boolean(
      directoryHandle && permission === "granted",
    );
    document.documentElement.dataset.tecSaveDirectory = available
      ? directoryHandle.name
      : "";
    document.documentElement.dataset.tecSaveDirectoryStatus = error
      ? "error"
      : available
        ? "ready"
        : directoryHandle
          ? "permission"
          : "default";
    notify("TEC_DIRECTORY_STATE", {
      name: directoryHandle?.name || "",
      permission,
      available,
      error,
    });
  }

  async function restoreDirectoryHandle() {
    try {
      directoryHandle = await readStoredHandle();
      await publishDirectoryState();
    } catch (error) {
      await publishDirectoryState(error.message || String(error));
    }
  }

  async function pickDirectory() {
    if (typeof window.showDirectoryPicker !== "function") {
      await publishDirectoryState("当前浏览器不支持选择保存目录");
      return;
    }
    try {
      directoryHandle = await window.showDirectoryPicker({
        id: "tec-temu-output",
        mode: "readwrite",
        startIn: "downloads",
      });
      await storeHandle(directoryHandle);
      await publishDirectoryState();
    } catch (error) {
      if (error.name !== "AbortError") {
        await publishDirectoryState(error.message || String(error));
      }
    }
  }

  function ensurePickerButton() {
    const slot = document.getElementById("tec-page-picker-slot");
    if (!slot) return;
    if (document.getElementById(PICK_BUTTON_ID)) return;
    const button = document.createElement("button");
    button.id = PICK_BUTTON_ID;
    button.type = "button";
    button.className = "tec-action";
    button.textContent = "选择保存目录";
    button.title = "选择 ZIP 直接保存到的文件夹";
    button.addEventListener("click", pickDirectory);
    slot.appendChild(button);
  }

  async function handleSaveZip(message) {
    const token = String(message.token || "");
    try {
      if (!directoryHandle) throw new Error("尚未选择保存目录");
      const permission = await permissionState(directoryHandle);
      if (permission !== "granted") {
        throw new Error("保存目录权限已失效，请重新选择目录");
      }
      if (!(message.blob instanceof Blob)) {
        throw new Error("待保存的 ZIP 数据无效");
      }
      const fileName = String(message.fileName || "图片包.zip");
      const fileHandle = await directoryHandle.getFileHandle(fileName, {
        create: true,
      });
      const writable = await fileHandle.createWritable();
      await writable.write(message.blob);
      await writable.close();
      notify("TEC_SAVE_ZIP_RESULT", {
        token,
        ok: true,
        directoryName: directoryHandle.name,
        fileName,
      });
    } catch (error) {
      notify("TEC_SAVE_ZIP_RESULT", {
        token,
        ok: false,
        error: error.message || String(error),
      });
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const message = event.data;
    if (!message?.__tecTemuBridge) return;
    if (message.type === "TEC_SAVE_ZIP") handleSaveZip(message);
  });

  const observer = new MutationObserver(() => {
    ensurePickerButton();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        ensurePickerButton();
        restoreDirectoryHandle();
      },
      { once: true },
    );
  } else {
    ensurePickerButton();
    restoreDirectoryHandle();
  }
})();

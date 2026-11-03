"use strict";

const port = Number(process.argv[2] || 62185);
const action = process.argv[3] || "inspect";

async function targets() {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  return response.json();
}

async function connect(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  let nextId = 1;
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    const task = pending.get(message.id);
    if (!task) return;
    pending.delete(message.id);
    if (message.error) task.reject(new Error(message.error.message));
    else task.resolve(message.result);
  };
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = () => reject(new Error("CDP connection failed"));
  });
  return {
    send(method, params = {}) {
      const id = nextId++;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    close() {
      socket.close();
    },
  };
}

async function main() {
  if (action === "reload-muse") {
    const muse = (await targets()).find(
      (target) =>
        target.type === "page" &&
        /^https:\/\/muse\.ai\//.test(target.url),
    );
    if (!muse) throw new Error("Muse page was not found");
    const museClient = await connect(muse.webSocketDebuggerUrl);
    await museClient.send("Page.reload", { ignoreCache: true });
    console.log("Muse page reload requested.");
    museClient.close();
    return;
  }
  if (action === "check-muse") {
    const muse = (await targets()).find(
      (target) =>
        target.type === "page" &&
        /^https:\/\/muse\.ai\//.test(target.url),
    );
    if (!muse) throw new Error("Muse page was not found");
    const museClient = await connect(muse.webSocketDebuggerUrl);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const checked = await museClient.send("Runtime.evaluate", {
      expression: `(() => {
        const launcher = document.querySelector("#vf-widget-launcher");
        if (launcher && launcher.style.display !== "none") launcher.click();
        const frame = document.querySelector("#vf-widget-frame");
        return JSON.stringify({
          bridgeLoaded: Boolean(window.__VF_MUSE_BRIDGE_LOADED__),
          root: Boolean(document.querySelector("#vf-widget-root")),
          launcher: Boolean(launcher),
          frameSrc: frame?.src || "",
          shellVisible: !document.querySelector("#vf-widget-shell")?.hidden
        });
      })()`,
      returnByValue: true,
    });
    if (checked.exceptionDetails) {
      throw new Error(
        checked.exceptionDetails.exception?.description ||
          checked.exceptionDetails.text,
      );
    }
    console.log(checked.result.value);
    museClient.close();
    return;
  }
  if (action === "check-widget") {
    const frame = (await targets()).find(
      (target) =>
        target.type === "iframe" &&
        /^chrome-extension:\/\/[^/]+\/sidepanel\.html\?embedded=1/.test(
          target.url,
        ),
    );
    if (!frame) throw new Error("Visual Forge widget iframe was not found");
    const frameClient = await connect(frame.webSocketDebuggerUrl);
    const checked = await frameClient.send("Runtime.evaluate", {
      expression: `JSON.stringify({
        ready: document.readyState,
        connection: document.querySelector("#vfConnection span")?.textContent,
        archive: document.querySelector("#vfExportPath")?.textContent,
        jobsModule: Boolean(window.VisualForgeJobs),
        storeModule: Boolean(window.VisualForgeStore),
        archiveModule: Boolean(window.VisualForgeArchive)
      })`,
      returnByValue: true,
    });
    if (checked.exceptionDetails) {
      throw new Error(
        checked.exceptionDetails.exception?.description ||
          checked.exceptionDetails.text,
      );
    }
    console.log(checked.result.value);
    frameClient.close();
    return;
  }
  if (action === "reload-extension-pages") {
    const pages = (await targets()).filter(
      (target) =>
        target.type === "page" &&
        target.url.startsWith("chrome-extension://"),
    );
    for (const extensionPage of pages) {
      const pageClient = await connect(extensionPage.webSocketDebuggerUrl);
      await pageClient.send("Page.reload", { ignoreCache: true });
      pageClient.close();
    }
    console.log(`Reloaded ${pages.length} extension page(s).`);
    return;
  }
  if (action === "check-options") {
    const optionsPage = (await targets()).find(
      (target) =>
        target.type === "page" &&
        /^chrome-extension:\/\/[^/]+\/options\.html/.test(target.url),
    );
    if (!optionsPage) throw new Error("Options page was not found");
    const optionsClient = await connect(optionsPage.webSocketDebuggerUrl);
    const checked = await optionsClient.send("Runtime.evaluate", {
      expression: `JSON.stringify({
        modelProvider: Boolean(document.querySelector("#modelProvider")),
        apiKey: Boolean(document.querySelector("#apiKey")),
        legacyApiBase: Boolean(document.querySelector("#apiBase")),
        title: document.querySelector("h1")?.textContent
      })`,
      returnByValue: true,
    });
    if (checked.exceptionDetails) {
      throw new Error(
        checked.exceptionDetails.exception?.description ||
          checked.exceptionDetails.text,
      );
    }
    console.log(checked.result.value);
    optionsClient.close();
    return;
  }
  const page = (await targets()).find(
    (target) => target.type === "page" && target.url.startsWith("chrome://extensions"),
  );
  if (!page) throw new Error("chrome://extensions page is not open");
  const client = await connect(page.webSocketDebuggerUrl);
  await client.send("Runtime.enable");
  const expression = `(() => {
    const manager = document.querySelector("extensions-manager");
    const list = manager?.shadowRoot?.querySelector("extensions-item-list");
    const items = [...(list?.shadowRoot?.querySelectorAll("extensions-item") || [])];
    return JSON.stringify(items.map((item) => {
      const root = item.shadowRoot;
      return {
        id: item.id,
        name: root?.querySelector("#name")?.textContent?.trim(),
        version: root?.querySelector("#version")?.textContent?.trim(),
        ids: [...(root?.querySelectorAll("[id]") || [])].map((node) => node.id)
      };
    }));
  })()`;
  const result = await client.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text,
    );
  }
  const items = JSON.parse(result.result.value);
  console.log(JSON.stringify(items, null, 2));
  if (action === "reload") {
    const item = items.find((entry) => entry.name === "Visual Forge for Muse");
    if (!item) throw new Error("Visual Forge extension item was not found");
    const clicked = await client.send("Runtime.evaluate", {
      expression: `(() => {
        const manager = document.querySelector("extensions-manager");
        const list = manager?.shadowRoot?.querySelector("extensions-item-list");
        const item = [...(list?.shadowRoot?.querySelectorAll("extensions-item") || [])]
          .find((node) => node.shadowRoot?.querySelector("#name")?.textContent?.trim() === "Visual Forge for Muse");
        const button = item?.shadowRoot?.querySelector("#dev-reload-button");
        if (!button) return false;
        button.click();
        return true;
      })()`,
      returnByValue: true,
    });
    if (!clicked.result.value) throw new Error("Reload button was not found");
    console.log("Visual Forge extension reload requested.");
  }
  client.close();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

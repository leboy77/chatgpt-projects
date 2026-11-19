#!/usr/bin/env node

const [webSocketUrl, extensionPath] = process.argv.slice(2);
if (!webSocketUrl || !extensionPath) {
  console.error(
    "Usage: node tools/cdp-load-extension.mjs <webSocketDebuggerUrl> <extensionPath>",
  );
  process.exit(2);
}

const socket = new WebSocket(webSocketUrl);
let nextId = 1;
const pending = new Map();
let chooserResolve;

function send(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
}

function waitForChooser(timeoutMs = 5000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    chooserResolve = (event) => {
      clearTimeout(timer);
      chooserResolve = null;
      resolve(event);
    };
  });
}

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.method === "Page.fileChooserOpened" && chooserResolve) {
    chooserResolve(message.params);
    return;
  }
  if (!message.id || !pending.has(message.id)) {
    return;
  }
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) {
    reject(new Error(JSON.stringify(message.error)));
  } else {
    resolve(message.result);
  }
});

socket.addEventListener("open", async () => {
  try {
    await send("Page.enable");
    await send("DOM.enable");
    await send("Page.setInterceptFileChooserDialog", { enabled: true });

    const chooserPromise = waitForChooser();
    await send("Runtime.evaluate", {
      expression:
        "chrome.developerPrivate.loadUnpacked({failQuietly:true,populateError:true}); true",
      awaitPromise: false,
      userGesture: true,
    });
    const chooser = await chooserPromise;
    if (!chooser) {
      throw new Error("No intercepted directory chooser was emitted");
    }

    if (chooser.backendNodeId) {
      await send("DOM.setFileInputFiles", {
        files: [extensionPath],
        backendNodeId: chooser.backendNodeId,
      });
    } else {
      throw new Error(
        `Directory chooser cannot be answered through CDP: ${JSON.stringify(chooser)}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 2500));
    const result = await send("Runtime.evaluate", {
      expression:
        "chrome.developerPrivate.getExtensionsInfo({includeDisabled:true,includeTerminated:true})",
      awaitPromise: true,
      returnByValue: true,
    });
    console.log(JSON.stringify(result.result?.value, null, 2));
    socket.close();
  } catch (error) {
    console.error(error.message);
    socket.close();
    process.exitCode = 1;
  }
});

socket.addEventListener("error", () => {
  console.error("WebSocket connection failed");
  process.exitCode = 1;
});

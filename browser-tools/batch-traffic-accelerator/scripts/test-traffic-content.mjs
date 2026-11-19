import { readFile } from "node:fs/promises";

const port = 52618;
const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) =>
  response.json(),
);
const target = targets.find(
  (item) =>
    item.type === "page" &&
    item.url.includes("agentseller-eu.temu.com/main/flux-analysis"),
);
if (!target) throw new Error("TEMU traffic analysis page was not found");

const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
let nextId = 1;
const ready = new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});
function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text);
  }
  return result.result.value;
}
async function call(message, timeout = 20000) {
  return evaluate(`(async () => {
    window.__trafficSpecResult = null;
    window.__trafficSpecHandler(
      ${JSON.stringify(message)},
      {},
      (result) => { window.__trafficSpecResult = result; }
    );
    const startedAt = Date.now();
    while (!window.__trafficSpecResult && Date.now() - startedAt < ${timeout}) {
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    return window.__trafficSpecResult;
  })()`);
}

try {
  await ready;
  const source = await readFile("content/content.js", "utf8");
  await evaluate(`(() => {
    delete window.__SPEC_TRAFFIC_ACCELERATOR__;
    window.chrome.runtime = {
      id: "content-test",
      onMessage: { addListener(handler) { window.__trafficSpecHandler = handler; } },
      sendMessage() { return Promise.resolve({ ok: true }); }
    };
  })()`);
  await evaluate(source);

  const target = await evaluate(`(() => {
    const clean = (value) => String(value || "").replace(/\\s+/g, " ").trim();
    const row = [...document.querySelectorAll("tbody tr")].find((item) =>
      clean(item.innerText).includes("立即开启")
    );
    if (!row) return null;
    const text = clean(row.innerText);
    return {
      spu: text.match(/SPU ID：\\s*(\\d+)/)?.[1],
      skc: text.match(/SKC ID：\\s*(\\d+)/)?.[1],
      station: text.match(/经营站点：\\s*([^\\s]+站)/)?.[1]
    };
  })()`);
  if (!target?.spu || !target?.station) {
    throw new Error("No eligible target row found for content test");
  }

  const opened = await call({
    type: "OPEN_TARGET_ROW",
    config: {
      idType: "SPU",
      spu: target.spu,
      skc: target.skc,
      station: target.station
    }
  });
  if (!opened?.ok) throw new Error(`Open row failed: ${JSON.stringify(opened)}`);

  const tierPreview = await call({
    type: "PREVIEW_ACCELERATION_TIERS",
    config: {
      tierPrice: 1,
      tierStrategy: "maxTraffic",
    },
  });
  if (
    !tierPreview?.ok ||
    tierPreview.selected?.index !== tierPreview.tiers?.length
  ) {
    throw new Error(`Unexpected tier preview: ${JSON.stringify(tierPreview)}`);
  }

  const shallowTier = await call({
    type: "PREVIEW_ACCELERATION_TIERS",
    config: {
      tierPrice: 1,
      tierStrategy: "minDiscount",
    },
  });
  if (!shallowTier?.ok || shallowTier.selected?.index !== 1) {
    throw new Error(`Unexpected shallow tier: ${JSON.stringify(shallowTier)}`);
  }

  const hybridPreview = await call({
    type: "PREVIEW_ACCELERATION_TIERS",
    config: {
      accelerationMode: "reduceThenTier",
      specName: "",
      targetPrice: null,
      otherPrice: 999,
      tierStrategy: "maxTraffic",
    },
  });
  if (
    !hybridPreview?.ok ||
    hybridPreview.selected?.index !== hybridPreview.tiers?.length ||
    hybridPreview.usedFallback !== true ||
    hybridPreview.continueDiscountAvailable !== true
  ) {
    throw new Error(
      `Unexpected hybrid preview: ${JSON.stringify(hybridPreview)}`,
    );
  }

  const more = await call({ type: "OPEN_MORE_PRICES" });
  if (!more?.ok) throw new Error(`Open price modal failed: ${JSON.stringify(more)}`);

  const filled = await call({
    type: "FILL_TRAFFIC_PRICES",
    config: {
      specName: "Mixed Color2",
      targetPrice: 120,
      otherPrice: 999,
      guardReferencePrice: true,
      dryRun: true
    }
  });
  if (
    !filled?.ok ||
    !filled.rows?.length ||
    !filled.errors?.length ||
    filled.canSubmit !== false ||
    filled.readbackVerified !== true
  ) {
    throw new Error(`Unexpected fill result: ${JSON.stringify(filled)}`);
  }

  const reopened = await call({ type: "OPEN_MORE_PRICES" });
  if (!reopened?.ok) {
    throw new Error(`Reopen price modal failed: ${JSON.stringify(reopened)}`);
  }

  const missingPrice = await call({
    type: "FILL_TRAFFIC_PRICES",
    config: {
      specName: "Mixed Color2",
      targetPrice: 120,
      otherPrice: null,
      guardReferencePrice: true,
      fallbackReferencePrice: true,
      dryRun: true
    }
  });
  if (
    !missingPrice?.ok ||
    !missingPrice.errors?.length ||
    missingPrice.canSubmit !== false ||
    missingPrice.readbackVerified !== false ||
    missingPrice.rows?.some(
      (row) => row.useFallback !== false
    )
  ) {
    throw new Error(
      `Unexpected missing-price result: ${JSON.stringify(missingPrice)}`,
    );
  }

  await evaluate(`(async () => {
    const clean = (value) => String(value || "").replace(/\\s+/g, " ").trim();
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const clickButton = async (text) => {
      const button = [...document.querySelectorAll("button")]
        .filter((item) => visible(item) && clean(item.textContent) === text)
        .at(-1);
      if (button) button.click();
      await new Promise((resolve) => setTimeout(resolve, 350));
      return Boolean(button);
    };
    await clickButton("取消");
    await clickButton("放弃加速机会");
    if (/确认选择|放弃加速/.test(clean(document.body.innerText))) {
      await clickButton("确认");
    }
    return { closed: !document.body.innerText.includes("调整申报价") };
  })()`);

  console.log(
    JSON.stringify(
      {
        open: opened.ok,
        tierIndex: tierPreview.selected.index,
        tierPrice: tierPreview.selected.maximumPrice,
        shallowTierIndex: shallowTier.selected.index,
        hybridTierIndex: hybridPreview.selected.index,
        hybridFallback: hybridPreview.usedFallback,
        more: more.ok,
        rows: filled.rows.length,
        blocked: filled.errors.length,
        canSubmit: filled.canSubmit,
        sampleBlocked: filled.errors[0],
        missingPriceRows: missingPrice.rows.filter((row) => row.missingPrice).length
      },
      null,
      2,
    ),
  );
} finally {
  socket.close();
}

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

let messageListener = null;
const local = {
  modelConfig: {
    provider: "mock",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-image-1",
    apiKey: "",
  },
};
const session = {};

const chromeMock = {
  storage: {
    local: {
      async get(defaults) {
        return { ...defaults, ...local };
      },
      async set(values) {
        Object.assign(local, values);
      },
    },
    session: {
      async set(values) {
        Object.assign(session, values);
      },
      async get(defaults) {
        return { ...defaults, ...session };
      },
      async remove(key) {
        delete session[key];
      },
    },
  },
  runtime: {
    lastError: null,
    onMessage: {
      addListener(listener) {
        messageListener = listener;
      },
    },
    onInstalled: { addListener() {} },
    async sendMessage() {},
    async openOptionsPage() {},
    getManifest() {
      return { version: "0.4.1" };
    },
  },
  sidePanel: {
    async open() {},
  },
  action: {
    onClicked: {
      addListener() {},
    },
  },
  tabs: {
    async sendMessage() {},
    async create() {},
  },
};

const source = fs.readFileSync(
  path.resolve(__dirname, "..", "background.js"),
  "utf8",
);
vm.runInNewContext(source, {
  chrome: chromeMock,
  fetch,
  URL,
  AbortController,
  setTimeout,
  clearTimeout,
  atob,
  btoa,
  console,
  Uint8Array,
});

function send(message) {
  return new Promise((resolve, reject) => {
    const keepAlive = messageListener(message, {}, (response) => {
      if (!response?.ok) reject(new Error(response?.error || "No response"));
      else resolve(response.data);
    });
    if (!keepAlive) reject(new Error("Message listener did not stay alive"));
  });
}

async function main() {
  const health = await send({ type: "VF_HEALTH" });
  if (health.mode !== "extension" || health.provider !== "mock") {
    throw new Error(`Unexpected extension health: ${JSON.stringify(health)}`);
  }

  const pending = await send({
    type: "VF_COMMAND_FROM_MUSE",
    command: "/vf generate 极简陶瓷杯 --count 2",
  });
  const expectedCommand = session.pendingCommand;
  if (!pending.queued || !expectedCommand) {
    throw new Error("Muse command was not persisted for the side panel");
  }
  const taken = await send({ type: "VF_TAKE_PENDING_COMMAND" });
  if (taken.command !== expectedCommand) {
    throw new Error("Pending command could not be consumed");
  }

  let oldApiRejected = false;
  try {
    await send({ type: "VF_CREATE_JOB" });
  } catch (error) {
    oldApiRejected = /已移除/.test(error.message);
  }
  if (!oldApiRejected) throw new Error("Legacy local API message was not rejected");
  console.log("background extension bridge: ok");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});


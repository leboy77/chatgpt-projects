"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function loadModel() {
  globalThis.VisualForgeCore = {
    async mockImage(prompt, size) {
      return new Blob([`${prompt}:${size}`], { type: "image/png" });
    },
  };
  let saved = null;
  let requestedOrigins = null;
  globalThis.chrome = {
    storage: {
      local: {
        async get(defaults) {
          return saved ? { ...defaults, modelConfig: saved } : { ...defaults };
        },
        async set(values) {
          saved = values.modelConfig;
        },
      },
    },
    permissions: {
      async contains() {
        return false;
      },
      async request({ origins }) {
        requestedOrigins = origins;
        return true;
      },
    },
  };
  delete require.cache[require.resolve(path.resolve(__dirname, "..", "local-model.js"))];
  require("../local-model.js");
  return {
    api: globalThis.VisualForgeModel,
    getSaved: () => saved,
    getRequestedOrigins: () => requestedOrigins,
  };
}

test("saves standalone model configuration", async () => {
  const { api, getSaved } = loadModel();
  const saved = await api.saveConfig({
    provider: "openai",
    baseUrl: "https://example.com/v1/",
    model: "gpt-image-1",
    apiKey: "sk-test",
  });
  assert.equal(saved.baseUrl, "https://example.com/v1");
  assert.equal(getSaved().apiKey, "sk-test");
});

test("requires an API key for the remote provider", async () => {
  const { api } = loadModel();
  await assert.rejects(
    api.saveConfig({
      provider: "openai",
      baseUrl: "https://example.com/v1",
      model: "gpt-image-1",
      apiKey: "",
    }),
    /必须填写 API Key/,
  );
});

test("requests optional host permission for the model origin", async () => {
  const { api, getRequestedOrigins } = loadModel();
  assert.equal(await api.ensureHostPermission("https://example.com/v1"), true);
  assert.deepEqual(getRequestedOrigins(), ["https://example.com/*"]);
});

test("calls an OpenAI-compatible Images endpoint directly", async () => {
  const { api } = loadModel();
  let request = null;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(
      JSON.stringify({
        data: [{ b64_json: Buffer.from("image-bytes").toString("base64") }],
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  };
  const provider = await api.createProvider({
    provider: "openai",
    baseUrl: "https://example.com/v1",
    model: "gpt-image-1",
    apiKey: "sk-test",
  });
  const blob = await provider.generate("a cup", "1024x1024", "high");
  assert.equal(request.url, "https://example.com/v1/images/generations");
  const body = JSON.parse(request.options.body);
  assert.equal(body.model, "gpt-image-1");
  assert.equal(body.n, 1);
  assert.equal(await blob.text(), "image-bytes");
});

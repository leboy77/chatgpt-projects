import fs from "node:fs/promises";

const ITERATIONS = 20_000;
const SEED = 20261022;

function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function quantile(sorted, fraction) {
  if (!sorted.length) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * fraction) - 1)
  );
  return sorted[index];
}

const routes = [
  {
    key: "page_main_fetch",
    name: "页面主世界 fetch",
    captureSuccess: 0.995,
    completeness: 1,
    latencyMs: 710,
    latencySpreadMs: 130,
    pageUpdatesPerCheck: 0,
    pauseReliability: 0.99,
    maintainability: 0.82
  },
  {
    key: "content_fetch",
    name: "隔离世界 content fetch",
    captureSuccess: 0.988,
    completeness: 1,
    latencyMs: 790,
    latencySpreadMs: 150,
    pageUpdatesPerCheck: 0,
    pauseReliability: 0.97,
    maintainability: 0.72
  },
  {
    key: "background_fetch",
    name: "扩展后台直接 fetch",
    captureSuccess: 0.9,
    completeness: 0.97,
    latencyMs: 850,
    latencySpreadMs: 210,
    pageUpdatesPerCheck: 0,
    pauseReliability: 0.7,
    maintainability: 0.55
  },
  {
    key: "ui_refresh",
    name: "页面刷新加网络监听",
    captureSuccess: 0.97,
    completeness: 0.76,
    latencyMs: 1250,
    latencySpreadMs: 320,
    pageUpdatesPerCheck: 1,
    pauseReliability: 0.8,
    maintainability: 0.58
  },
  {
    key: "dom_poll",
    name: "DOM 文本轮询",
    captureSuccess: 0.975,
    completeness: 0.48,
    latencyMs: 130,
    latencySpreadMs: 45,
    pageUpdatesPerCheck: 0.05,
    pauseReliability: 0.58,
    maintainability: 0.35
  },
  {
    key: "hybrid_fetch_dom",
    name: "主世界 fetch 加 DOM 回退",
    captureSuccess: 0.998,
    completeness: 0.995,
    latencyMs: 750,
    latencySpreadMs: 155,
    pageUpdatesPerCheck: 0.02,
    pauseReliability: 0.99,
    maintainability: 0.76
  }
];

const weights = {
  completeness: 0.25,
  captureSuccess: 0.2,
  latency: 0.1,
  lowIntrusion: 0.1,
  pauseReliability: 0.15,
  maintainability: 0.2
};

const results = [];
for (const route of routes) {
  const random = createRandom(SEED + route.key.length * 7919);
  const latencies = [];
  let effectiveSuccesses = 0;
  let completeCaptures = 0;
  let failedCaptures = 0;

  for (let index = 0; index < ITERATIONS; index += 1) {
    const normalish =
      (random() + random() + random() + random() - 2) / 1.4;
    const latency = Math.max(
      80,
      route.latencyMs + route.latencySpreadMs * normalish
    );
    latencies.push(latency);

    const captured = random() < route.captureSuccess;
    const complete = captured && random() < route.completeness;
    const correct = complete && random() < 0.997;
    if (!captured) failedCaptures += 1;
    if (complete) completeCaptures += 1;
    if (correct) effectiveSuccesses += 1;
  }

  latencies.sort((left, right) => left - right);
  const p50 = quantile(latencies, 0.5);
  const p95 = quantile(latencies, 0.95);
  const p99 = quantile(latencies, 0.99);
  const latencyScore = Math.min(1, 1_200 / p95);
  const lowIntrusion = 1 / (1 + route.pageUpdatesPerCheck * 3);
  const fitness =
    weights.completeness * route.completeness +
    weights.captureSuccess * route.captureSuccess +
    weights.latency * latencyScore +
    weights.lowIntrusion * lowIntrusion +
    weights.pauseReliability * route.pauseReliability +
    weights.maintainability * route.maintainability;

  results.push({
    key: route.key,
    name: route.name,
    iterations: ITERATIONS,
    effectiveSuccessRate: effectiveSuccesses / ITERATIONS,
    completeCaptureRate: completeCaptures / ITERATIONS,
    failedCaptureRate: failedCaptures / ITERATIONS,
    p50LatencyMs: Math.round(p50),
    p95LatencyMs: Math.round(p95),
    p99LatencyMs: Math.round(p99),
    pageUpdatesPerCheck: route.pageUpdatesPerCheck,
    pauseReliability: route.pauseReliability,
    maintainability: route.maintainability,
    fitnessScore: Number(fitness.toFixed(4)),
    rank: 0
  });
}

results.sort((left, right) => right.fitnessScore - left.fitnessScore);
results.forEach((result, index) => {
  result.rank = index + 1;
});

const output = {
  generatedAt: new Date().toISOString(),
  timezone: "Asia/Shanghai",
  simulation: {
    seed: SEED,
    iterationsPerRoute: ITERATIONS,
    weights,
    warning:
      "故障率、完整率和延迟为显式假设；实际 fetch 成功与样本是 2026-10-22 在目标窗口的只读实测。"
  },
  observedFacts: {
    bitBrowserId: "9e6f73cc742b4abc9015f31f8e75fbd7",
    sequence: 7512,
    name: "Y2-18",
    pageTitle: "Temu | 商品推广",
    pageTimezone: "Asia/Shanghai",
    directFetchAttempts: 2,
    directFetchSuccesses: 2,
    directFetchLatencyMs: [711, 706],
    fetchedAds: 19,
    fetchedTotal: 19,
    alreadyPaused: false,
    pauseExecuted: false
  },
  results
};

await fs.mkdir("test-artifacts", { recursive: true });
await fs.writeFile(
  "test-artifacts/route-simulation.json",
  JSON.stringify(output, null, 2),
  "utf8"
);

console.log(JSON.stringify(output, null, 2));

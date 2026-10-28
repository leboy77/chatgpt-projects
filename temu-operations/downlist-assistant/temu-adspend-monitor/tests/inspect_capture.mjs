import fs from "node:fs/promises";

const capture = JSON.parse(
  await fs.readFile("test-artifacts/network-capture.json", "utf8")
);

for (const request of capture.requests) {
  let body = null;
  try {
    body = JSON.parse(request.responseBody);
  } catch (_) {
    // Not JSON.
  }
  console.log(`\n=== ${request.url}`);
  console.log("METHOD", request.method, "STATUS", request.status);
  console.log("POST", request.postData);
  if (!body) {
    console.log("BODY_PREFIX", request.responseBody.slice(0, 500));
    continue;
  }
  console.log("ROOT_KEYS", Object.keys(body));
  console.log("BODY_PREFIX", JSON.stringify(body).slice(0, 3000));

  const costPaths = [];
  const adIdPaths = [];
  const spuPaths = [];
  const seen = new Set();
  function walk(value, path, depth = 0) {
    if (!value || typeof value !== "object" || depth > 8 || seen.has(value)) return;
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
      const nextPath = path ? `${path}.${key}` : key;
      const normalizedKey = key.toLowerCase();
      if (
        /cost|spend|expense|consume|fee|amount|adid|ad_id|productid|spuid|goods/.test(
          normalizedKey
        )
      ) {
        const text = JSON.stringify(child);
        if (text.length < 500) {
          const target = /cost|spend|expense|consume|fee|amount/.test(normalizedKey)
            ? costPaths
            : /adid|ad_id/.test(normalizedKey)
              ? adIdPaths
              : spuPaths;
          target.push([nextPath, child]);
        }
      }
      walk(child, nextPath, depth + 1);
    }
  }
  walk(body, "");
  console.log("COST_PATHS", JSON.stringify(costPaths.slice(0, 50), null, 2));
  console.log("AD_ID_PATHS", JSON.stringify(adIdPaths.slice(0, 30), null, 2));
  console.log("SPU_PATHS", JSON.stringify(spuPaths.slice(0, 30), null, 2));
}

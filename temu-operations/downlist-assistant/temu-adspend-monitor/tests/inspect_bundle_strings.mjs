const url =
  "https://static.kwcdn.com/m-assets/assets/modernjs/ad-list_f6cdf2a278767732b642.js";
const content = await (await fetch(url)).text();

const endpoints = new Map();
for (const match of content.matchAll(
  /["'`](\/api\/v\d+\/[A-Za-z0-9_/?=&.-]+)["'`]/g
)) {
  endpoints.set(match[1], match.index);
}

console.log("ENDPOINTS", JSON.stringify([...endpoints.keys()], null, 2));

for (const needle of [
  "modifyAds",
  "modify_ads",
  "ads_detail",
  "StopAds",
  "StartAds",
  "StopAds:",
  "StartAds:",
  "ad_show_status",
  "MANUAL_PAUSE",
  "PROMOTION",
  "pauseAds",
  "pause_ads",
  "queryAdsDetail"
]) {
  const indices = [];
  let cursor = 0;
  while (indices.length < 12) {
    const index = content.indexOf(needle, cursor);
    if (index === -1) break;
    indices.push(index);
    cursor = index + needle.length;
  }
  console.log(`\n=== ${needle} (${indices.length})`);
  for (const index of indices) {
    console.log(
      content.slice(Math.max(0, index - 500), index + 900).replace(/\s+/g, " ")
    );
  }
}

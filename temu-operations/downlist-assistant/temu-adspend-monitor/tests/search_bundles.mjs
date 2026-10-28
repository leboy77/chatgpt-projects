import fs from "node:fs/promises";
import { chromium } from "../../_spreadsheet_edit_dwrg/node_modules/playwright/index.mjs";

const browser = await chromium.connectOverCDP(
  process.env.BIT_CDP_ENDPOINT || "http://127.0.0.1:50262"
);
try {
  const page = browser
    .contexts()
    .flatMap((context) => context.pages())
    .find((candidate) => candidate.url().includes("ads.temu.com/ad-list.html"));
  if (!page) throw new Error("未找到商品推广页面");

  const result = await page.evaluate(async () => {
    const allScriptUrls = [...document.querySelectorAll("script[src]")].map(
      (script) => script.src
    );
    const allResources = performance
      .getEntriesByType("resource")
      .map((entry) => entry.name);
    const urls = [...new Set([
      ...performance
        .getEntriesByType("resource")
        .map((entry) => entry.name),
      ...[...document.querySelectorAll("script[src]")].map(
        (script) => script.src
      ),
      ...[...document.querySelectorAll("link[rel=modulepreload]")].map(
        (link) => link.href
      )
    ].filter(
      (url) =>
        /^https:\/\/(?:ads\.temu\.com|static\.kwcdn\.com)\//.test(url) &&
        /\.(?:js|mjs)(?:\?|$)/i.test(url)
    ))];

    const bundles = [];
    for (const url of urls) {
      try {
        const response = await fetch(url, { credentials: "include" });
        if (!response.ok) continue;
        const content = await response.text();
        bundles.push({ url, content });
      } catch (_) {
        // Ignore a bundle that expires or cannot be fetched.
      }
    }

    const endpoints = new Map();
    const snippets = [];
    for (const bundle of bundles) {
      for (const match of bundle.content.matchAll(
        /["'`](\/api\/v\d+\/coconut\/[A-Za-z0-9_/?=&.-]+)["'`]/g
      )) {
        endpoints.set(match[1], bundle.url);
      }
      for (const match of bundle.content.matchAll(
        /["'`]([^"'`]{0,80}(?:pause|enable|status)[^"'`]{0,100})["'`]/gi
      )) {
        const value = match[1];
        if (/api|coconut|ad_|pause|resume|status/i.test(value)) {
          snippets.push({
            url: bundle.url,
            value: value.slice(0, 220),
            context: bundle.content
              .slice(Math.max(0, match.index - 260), match.index + 520)
              .replace(/\s+/g, " ")
              .slice(0, 780)
          });
        }
      }
    }

    return {
      allScriptUrls,
      allResources: allResources.slice(-200),
      bundleUrls: urls,
      bundleSizes: bundles.map((bundle) => ({
        url: bundle.url,
        bytes: bundle.content.length
      })),
      endpoints: [...endpoints].map(([endpoint, source]) => ({ endpoint, source })),
      snippets: snippets.slice(0, 300)
    };
  });

  await fs.writeFile(
    "test-artifacts/bundle-search.json",
    JSON.stringify(result, null, 2),
    "utf8"
  );
  console.log(
    JSON.stringify(
      {
        bundleSizes: result.bundleSizes,
        allScriptUrls: result.allScriptUrls,
        allResources: result.allResources,
        endpoints: result.endpoints,
        snippets: result.snippets.filter((item) =>
          /pause|status|ad_st|ad_status|operation|operate/i.test(item.value)
        ).slice(0, 100)
      },
      null,
      2
    )
  );
} finally {
  await browser.close();
}

import fs from "node:fs/promises";

const search = JSON.parse(
  await fs.readFile("test-artifacts/bundle-search.json", "utf8")
);
const urls = search.allScriptUrls;

await Promise.all(
  urls.map(async (url) => {
    try {
      const content = await (await fetch(url)).text();
      const matches = [
        ...content.matchAll(
          /(?:StartAds|StopAds|deleteAds|ad_show_status)\s*:\s*[^,}]{1,80}/g
        )
      ].slice(0, 20);
      const plainMatches = [...content.matchAll(/StartAds/g)].slice(0, 5);
      if (matches.length || plainMatches.length) {
        console.log(`\n=== ${url}`);
        for (const match of matches) {
          console.log(match[0]);
          console.log(
            content
              .slice(Math.max(0, match.index - 500), match.index + 900)
              .replace(/\s+/g, " ")
          );
        }
        for (const match of plainMatches) {
          console.log("PLAIN", content.slice(
            Math.max(0, match.index - 300),
            match.index + 500
          ).replace(/\s+/g, " "));
        }
      }
    } catch (error) {
      console.error(url, String(error));
    }
  })
);

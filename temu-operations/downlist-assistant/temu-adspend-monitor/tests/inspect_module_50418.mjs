import fs from "node:fs/promises";

const search = JSON.parse(
  await fs.readFile("test-artifacts/bundle-search.json", "utf8")
);
for (const url of search.allScriptUrls) {
  try {
    const content = await (await fetch(url)).text();
    for (const needle of ["50418:", "50418:function", "50418:("]) {
      const index = content.indexOf(needle);
      if (index >= 0) {
        console.log(url, needle);
        console.log(content.slice(index, index + 5000));
      }
    }
  } catch (_) {
    // Ignore failed bundles.
  }
}

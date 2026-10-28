const url =
  "https://static.kwcdn.com/m-assets/assets/modernjs/ad-list_f6cdf2a278767732b642.js";
const content = await (await fetch(url)).text();

const patterns = [
  /\bStartAds\s*:\s*[^,}]+/g,
  /\bStopAds\s*:\s*[^,}]+/g,
  /\bdeleteAds\s*:\s*[^,}]+/g,
  /\bad_show_status\s*:\s*[^,}]+/g,
  /\bad_show_status\b[^;]{0,300}/g
];

for (const pattern of patterns) {
  const matches = [...content.matchAll(pattern)].slice(0, 30);
  console.log(`\n=== ${pattern}`);
  for (const match of matches) {
    console.log(match[0].slice(0, 500));
  }
}

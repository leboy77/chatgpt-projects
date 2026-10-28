const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sourcePath =
  process.argv[2] ||
  "C:\\Users\\QZJLKJ\\Desktop\\TEMU产品列表图片下载\\lib\\jclps.js";
const outputPath =
  process.argv[3] || path.join(__dirname, "jclps.deobfuscated.js");

const source = fs.readFileSync(sourcePath, "utf8");
const runtimeStart = source.indexOf("if(chrome[");
if (runtimeStart < 0) {
  throw new Error("Could not locate the obfuscated runtime start.");
}

const context = {
  console,
  atob: (value) => Buffer.from(value, "base64").toString("binary"),
  decodeURIComponent,
};
vm.createContext(context);
vm.runInContext(
  `${source.slice(0, runtimeStart)}\nglobalThis.__decode = _0x5c9b;`,
  context,
);

const decode = context.__decode;
let runtime = source.slice(runtimeStart);
let replacements = 0;

runtime = runtime.replace(
  /_0x5c9b\(\s*(['"])0x([0-9a-fA-F]+)\1\s*,\s*'([^']*)'\s*\)/g,
  (match, indexQuote, indexHex, key) => {
    try {
      const value = decode(`0x${indexHex}`, key);
      replacements += 1;
      return JSON.stringify(value);
    } catch (error) {
      console.error(`Failed to decode ${match}: ${error.message}`);
      return match;
    }
  },
);

const remainingStatic = runtime.match(
  /_0x5c9b\(\s*['"]0x[0-9a-fA-F]+['"]\s*,/g,
);
const dynamicCalls = runtime.match(/_0x5c9b\(/g);

fs.writeFileSync(
  outputPath,
  `${runtime}\n// Decoded static string calls: ${replacements}` +
    `\n// Remaining calls to decryptor: ${dynamicCalls ? dynamicCalls.length : 0}` +
    `\n// Remaining static calls: ${remainingStatic ? remainingStatic.length : 0}\n`,
  "utf8",
);

console.log(
  JSON.stringify(
    {
      sourcePath,
      outputPath,
      replacements,
      remainingCalls: dynamicCalls ? dynamicCalls.length : 0,
      remainingStatic: remainingStatic ? remainingStatic.length : 0,
    },
    null,
    2,
  ),
);

/* 一次性：把 agnes 端直连配置写进 gitignore 的 miniprogram/config/config.js */
const fs = require("fs");
const path = require("path");

const FILE = "miniprogram/config/config.js";
let s = fs.readFileSync(FILE, "utf8");
if (s.includes("agnes")) {
  console.log("agnes already present, skip");
} else {
  const apiKey = JSON.parse(fs.readFileSync("cloudfunctions/ai/llm.json", "utf8")).apiKey;
  s = s.replace(
    /};\s*$/,
    "  agnes: {\n" +
      "    baseUrl: \"https://apihub.agnes-ai.com/v1\",\n" +
      "    apiKey: \"" + apiKey + "\",\n" +
      "    imageModel: \"agnes-image-2.5-flash\",\n" +
      "  },\n};\n"
  );
  fs.writeFileSync(FILE, s);
}
const c = require(path.join(__dirname, "..", FILE));
console.log("agnes baseUrl:", c.agnes.baseUrl, "| key len:", c.agnes.apiKey.length, "| model:", c.agnes.imageModel);

/* D1 自检：自动化启动微信开发者工具，逐页编译运行并断言关键元素
   运行：NODE_PATH=<workspace>/node_modules node tools/auto-check.js */
const fs = require("fs");
const path = require("path");
const automator = require("miniprogram-automator");

const CLI = "C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat";
const PROJECT = "C:\\Users\\lenovo\\WorkBuddy\\青檬字词";
const SHOTS = path.join(PROJECT, "tools", "shots");

const PAGES = [
  { path: "/pages/index/index", expect: ".hero" },
  { path: "/pages/vocab/vocab", expect: ".term-switch" },
  { path: "/pages/dictation/dictation", expect: ".tianzigge" },
  { path: "/pages/photo-check/photo-check", expect: ".photo-btn" },
  { path: "/pages/review/review", expect: ".tag-green" },
  { path: "/pages/wrong-book/wrong-book", expect: ".review-btn" },
  { path: "/pages/settings/settings", expect: ".danger-btn" },
];

(async () => {
  if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

  console.log("[1/3] 连接开发者工具自动化端口 9420 ...");
  const miniProgram = await automator.connect({ wsEndpoint: "ws://127.0.0.1:9420" });
  console.log("[2/3] 已连接");

  const sys = await miniProgram.systemInfo();
  console.log("基础库:", sys.SDKVersion, "| 平台:", sys.platform);

  const runtimeErrors = [];
  miniProgram.on("exception", (e) =>
    runtimeErrors.push("[exception] " + (e.message || "").slice(0, 200))
  );
  miniProgram.on("console", (m) => {
    if (m.type === "error")
      runtimeErrors.push(
        "[console.error] " + JSON.stringify(m.args).slice(0, 200)
      );
  });

  const results = [];
  for (const p of PAGES) {
    const name = p.path.split("/")[2];
    try {
      const page = await miniProgram.reLaunch(p.path);
      await page.waitFor(600);
      const el = await page.$(p.expect);
      let shot = "skipped";
      try {
        await miniProgram.screenshot({ path: path.join(SHOTS, name + ".png") });
        shot = "shot ok";
      } catch (e) {
        shot = "shot fail: " + (e.message || "").slice(0, 80);
      }
      results.push(
        (el ? "PASS" : "WARN") +
          " " +
          p.path +
          (el ? "" : "  ← 未找到 " + p.expect) +
          "  (" + shot + ")"
      );
    } catch (e) {
      results.push("FAIL " + p.path + " :: " + String(e.message || e).slice(0, 200));
    }
  }

  console.log("[3/3] 自检结果：");
  console.log(results.join("\n"));
  console.log(
    runtimeErrors.length
      ? "运行时报错 (" + runtimeErrors.length + "):\n" + runtimeErrors.slice(0, 15).join("\n")
      : "无运行时报错"
  );

  await miniProgram.disconnect(); // 断开但保持工具打开，便于人工查看
  console.log("DONE（工具保持打开）");
  process.exit(0);
})().catch((e) => {
  console.error("LAUNCH FAIL:", String(e.message || e));
  process.exit(1);
});

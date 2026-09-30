/* D2 自检：词库选择全流程 → 带词进报默页
   前置：开发者工具已启动且 cli auto 已开 9420 自动化端口 */
const path = require("path");
const automator = require("miniprogram-automator");

const SHOTS = path.join(__dirname, "shots");

(async () => {
  const mp = await automator.connect({ wsEndpoint: "ws://127.0.0.1:9420" });
  console.log("connected");

  const errors = [];
  mp.on("exception", (e) => errors.push("[exception] " + String(e.message).slice(0, 200)));
  mp.on("console", (m) => {
    if (m.type === "error") errors.push("[console.error] " + JSON.stringify(m.args).slice(0, 200));
  });

  // 1. 进词库选择页
  let page = await mp.reLaunch("/pages/vocab/vocab");
  await page.waitFor(1000);
  let d = await page.data();
  console.log("vocab 页: units =", d.units.length, "| 当前单元 =", d.currentUnit, "| poolSize =", d.poolSize);

  // 2. 点第二单元
  const cells = await page.$$(".unit-cell");
  await cells[1].tap();
  await page.waitFor(300);
  d = await page.data();
  console.log("选单元 2 → poolSize =", d.poolSize);

  // 3. 点词语表
  const types = await page.$$(".type-btn");
  await types[1].tap();
  await page.waitFor(300);
  d = await page.data();
  console.log("选词语表 → poolSize =", d.poolSize, "| count =", d.count);
  await mp.screenshot({ path: path.join(SHOTS, "d2-vocab.png") });

  // 4. 点开始报默
  const start = await page.$(".start-btn");
  await start.tap();
  await page.waitFor(2500);

  page = await mp.currentPage();
  if (!page || page.path.indexOf("dictation") < 0) {
    console.log("FAIL: 未跳转到报默页, 当前 =", page ? page.path : "NULL");
    process.exit(1);
  }
  d = await page.data();
  if (!d.words || !d.words.length) {
    console.log("FAIL: 报默页词表为空, data =", JSON.stringify(d).slice(0, 200));
    process.exit(1);
  }
  console.log("落地页:", page.path);
  console.log(
    "报默页: words =", d.words.length,
    "| listName =", d.listName,
    "| unitTitle =", d.unitTitle,
    "| 首词 =", d.words[0] ? d.words[0].word + "(" + d.words[0].pinyin + ")" : "无"
  );
  await mp.screenshot({ path: path.join(SHOTS, "d2-dictation.png") });

  const pass = page.path.indexOf("dictation") >= 0 && d.words.length > 0;
  console.log(pass ? "D2 PASS：选中单元已带词进入报默页" : "D2 FAIL");
  console.log(errors.length ? "运行时报错:\n" + errors.join("\n") : "无运行时报错");

  await mp.disconnect();
  process.exit(pass ? 0 : 1);
})().catch((e) => {
  console.error("FAIL:", String(e.message || e));
  process.exit(1);
});

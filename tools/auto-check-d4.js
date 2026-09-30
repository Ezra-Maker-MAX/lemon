/* D4 自检：拍照批改全流程（mock OCR 驱动，不依赖云环境）
   覆盖：选词 → mock 识别 → 编辑距离预判 → 逐词改判 → 入库（session photo + 错题本）→ 结果页
   前置：微信开发者工具已打开项目且自动化端口 9420 就绪 */
const automator = require("miniprogram-automator");

const WS = "ws://127.0.0.1:9420";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  for (let i = 0; i < 8; i++) {
    try {
      return await automator.connect({ wsEndpoint: WS });
    } catch (e) {
      console.log(`连接重试 ${i + 1}/8 …`);
      await sleep(4000);
    }
  }
  throw new Error("无法连接自动化端口 9420");
}

(async () => {
  const mp = await connect();
  console.log("已连接自动化端口");
  const errs = [];
  mp.on("exception", (e) => errs.push("EXC: " + String(e.message).slice(0, 300)));
  mp.on("console", (m) => {
    if (m.type === "error") errs.push("ERR: " + JSON.stringify(m.args).slice(0, 300));
  });

  /* ---------- 1. pick ---------- */
  console.log("\n[1] 进入拍照批改页（U2 词语表 5 词）");
  let page = await mp.reLaunch("/pages/photo-check/photo-check?term=1&unit=2&listType=ciyu&count=5");
  await page.waitFor(1500);
  let d = await page.data();
  if (d.phase !== "pick" || d.words.length !== 5) {
    throw new Error(`pick 异常: phase=${d.phase} words=${d.words.length}`);
  }
  const target = d.words.map((w) => w.word);
  console.log(`  pick OK：${d.unitTitle} ${d.listName}，目标词：${target.join(" ")}`);

  /* ---------- 2. mock OCR：孩子把 4 个词写对了、1 个写成错别字 ---------- */
  // 手写 OCR 模拟：4 个词原样出现；target[2] 写成错别字（换掉第二个字，dist=1 → 预判对）
  // target[4] 没写 → 不出现 → 预判错
  console.log("\n[2] mock OCR 识别返回");
  const typo = target[2][0] + (target[2][1] === "囍" ? "喜" : "囍");
  await page.callMethod("onMockOcr", [
    target[0],
    target[1],
    typo,
    target[3],
  ]);
  await page.waitFor(600);
  d = await page.data();
  if (d.phase !== "confirm" || d.items.length !== 5) {
    throw new Error(`confirm 异常: phase=${d.phase} items=${(d.items || []).length}`);
  }
  const judges = d.items.map((it) => `${it.word}:${it.judge}(dist=${it.dist})`);
  console.log("  预判：" + judges.join("  "));
  const byWord = {};
  for (const it of d.items) byWord[it.word] = it;
  if (byWord[target[0]].judge !== "ok") throw new Error(`${target[0]} 应预判对`);
  if (byWord[target[2]].judge !== "ok" || byWord[target[2]].dist !== 1) {
    throw new Error(`错别字（dist=1）应预判对，实际 ${byWord[target[2]].judge}/${byWord[target[2]].dist}`);
  }
  if (byWord[target[4]].judge !== "wrong") throw new Error(`未写的 ${target[4]} 应预判错`);
  console.log(`  预判断言 OK（错别字「${typo}」近似匹配 ✓ / 漏写判错 ✓）`);
  try {
    await mp.screenshot({ path: "tools/shots/d4-confirm.png" });
    console.log("  📸 d4-confirm.png");
  } catch (e) {}

  /* ---------- 3. 人工改判：把第 2 词改成错 ---------- */
  console.log("\n[3] 人工改判第 2 词（点一次：ok→wrong）");
  const cells = await page.$$(".match-item");
  await cells[1].tap();
  await page.waitFor(300);
  d = await page.data();
  if (d.items[1].judge !== "wrong") throw new Error("改判失败: " + d.items[1].judge);
  console.log(`  「${d.items[1].word}」已人工改判为错`);

  /* ---------- 4. 提交入库 ---------- */
  console.log("\n[4] 完成批改 → 入库断言");
  const submit = await page.$(".pc-btn");
  await submit.tap();
  await page.waitFor(600);
  d = await page.data();
  if (d.phase !== "done") throw new Error("提交后未进入 done: " + d.phase);
  // 预期：5 词全判（3 ok + 2 wrong，无 skip）
  if (d.result.total !== 5 || d.result.correct !== 3) {
    throw new Error(`结果异常: total=${d.result.total} correct=${d.result.correct}`);
  }
  const st = await mp.evaluate(() => ({
    sessions: wx.getStorageSync("dictation_sessions"),
    wrong: wx.getStorageSync("wrong_book"),
  }));
  const s0 = st.sessions[0];
  if (s0.mode !== "photo" || s0.total !== 5 || s0.correct !== 3) {
    throw new Error("photo session 数据异常: " + JSON.stringify(s0).slice(0, 120));
  }
  const wrongWords = d.result.wrongList.map((w) => w.word);
  for (const w of wrongWords) {
    const hit = (st.wrong || []).find((x) => x.word === w);
    if (!hit) throw new Error(`错题本缺「${w}」`);
  }
  console.log(`  done OK：${d.result.pct}%，错词「${wrongWords.join("、")}」已进错题本，session(mode=photo) ✓`);
  try {
    await mp.screenshot({ path: "tools/shots/d4-done.png" });
    console.log("  📸 d4-done.png");
  } catch (e) {}

  /* ---------- 汇总 ---------- */
  console.log("\n========== D4 结果 ==========");
  if (errs.length) {
    console.log("⚠ 运行时报错：\n" + errs.join("\n"));
  } else {
    console.log("✅ 全流程 PASS，零运行时报错");
  }
  await mp.disconnect();
  process.exit(errs.length ? 2 : 0);
})().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});

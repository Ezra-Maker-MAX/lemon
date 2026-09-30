/* D5 自检：错题本 + 复习卷 + 首页统计
   流程：播种错题本 → 错题本页列表/数量 → 生成复习卷 → review 页
   → 开始复习（mode=review）→ 判词 → 毕业机制/入库/首页统计断言 */
const automator = require("miniprogram-automator");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  for (let i = 0; i < 5; i++) {
    try {
      return await automator.connect({ wsEndpoint: "ws://127.0.0.1:9420" });
    } catch (e) {
      await sleep(4000);
    }
  }
  throw new Error("connect failed");
}

async function shot(mp, name) {
  try {
    await mp.screenshot({ path: `tools/shots/${name}.png` });
    console.log(`  📸 ${name}.png`);
  } catch (e) {
    console.log(`  (截图失败: ${e.message})`);
  }
}

async function tap(page, selector) {
  const el = await page.$(selector);
  if (!el) throw new Error(`元素不存在: ${selector}`);
  await el.tap();
}

(async () => {
  console.log("已连接自动化端口");
  const mp = await connect();
  const errs = [];
  mp.on("exception", (e) => errs.push("EXC: " + String(e.message).slice(0, 200)));
  mp.on("console", (m) => {
    if (m.type === "error") errs.push("ERR: " + JSON.stringify(m.args).slice(0, 200));
  });

  /* ---------- 0. 播种错题本与历史 session ---------- */
  console.log("\n[0] 播种错题本（4 词：1 个连对 2、1 个错 2 次）+ 2 条历史 session");
  await mp.evaluate(() => {
    const now = Date.now();
    wx.setStorageSync("wrong_book", [
      { word: "篱笆", pinyin: "lí ba", wrongCount: 9, lastWrongAt: new Date(now - 2 * 86400e3).toISOString(), correctStreak: 2, mastered: false }, // 错最多排第一，再对 1 次毕业
      { word: "地毯", pinyin: "dì tǎn", wrongCount: 2, lastWrongAt: new Date(now - 86400e3).toISOString(), correctStreak: 0, mastered: false },
      { word: "绒球", pinyin: "róng qiú", wrongCount: 3, lastWrongAt: new Date(now - 3 * 86400e3).toISOString(), correctStreak: 0, mastered: false },
      { word: "穿戴", pinyin: "chuān dài", wrongCount: 1, lastWrongAt: new Date(now - 3 * 86400e3).toISOString(), correctStreak: 0, mastered: false },
    ]);
    const mk = (id, total, correct, days) => ({
      id, date: new Date(now - days * 86400e3).toISOString(),
      unit: 1, listType: "ciyu", mode: "voice", total, correct,
      words: [],
    });
    wx.setStorageSync("dictation_sessions", [mk("h1", 10, 9, 1), mk("h2", 10, 7, 3)]);
    wx.removeStorageSync("progress");
  });

  /* ---------- 1. 首页统计卡 ---------- */
  console.log("\n[1] 首页统计卡");
  let page = await mp.reLaunch("/pages/index/index");
  await page.waitFor(1200);
  let d = await page.data();
  if (d.weeklyAccuracy !== 80) throw new Error("周正确率应为 80%，实际 " + d.weeklyAccuracy);
  if (d.wrongCount !== 4) throw new Error("错词在池应为 4，实际 " + d.wrongCount);
  if (d.sessionCount !== 2) throw new Error("本周 session 应为 2");
  console.log("  统计 OK：周正确率 80% · 本周 2 次 · 错词 4");

  /* ---------- 2. 错题本页 ---------- */
  console.log("\n[2] 错题本页（Tab 切换）");
  await mp.switchTab("/pages/wrong-book/wrong-book");
  await sleep(1500);
  page = await mp.currentPage();
  d = await page.data();
  if (d.items.length !== 4) throw new Error("错词列表应 4 条，实际 " + d.items.length);
  // 错得多的在前
  if (d.items[0].word !== "篱笆") throw new Error("排序异常，首条应为「篱笆」: " + d.items[0].word);
  if (d.count > d.items.length) throw new Error("复习卷数量大于在池词数");
  console.log(`  列表 OK：4 词，首条「篱笆」(错 9 次)，复习卷默认 ${d.count} 词`);
  await shot(mp, "d5-wrongbook");

  /* ---------- 3. 生成复习卷 → review 页 ---------- */
  console.log("\n[3] 一键生成复习卷 → review 页（真实 tap）");
  await tap(page, ".review-btn");
  await sleep(2500);
  page = await mp.currentPage();
  page = await mp.currentPage();
  if (!page.path.includes("review")) throw new Error("未跳转 review 页: " + page.path);
  d = await page.data();
  if (d.words.length !== d.count) throw new Error("复习卷词数与预期不符");
  console.log(`  review OK：${d.count} 词在卷（池 ${d.poolSize}）`);
  await shot(mp, "d5-review");

  /* ---------- 4. 开始复习 → dictation mode=review ---------- */
  console.log("\n[4] 开始复习报默");
  await tap(page, ".rv-start");
  await sleep(2500);
  page = await mp.currentPage();
  if (!page.path.includes("dictation")) throw new Error("未进入报默页");
  d = await page.data();
  if (d.listName !== "复习卷" || d.unitTitle !== "错题复习") {
    throw new Error("review 模式标题异常: " + d.listName + "/" + d.unitTitle);
  }
  if (d.words.length !== d.preview.length && d.words.length > 10) throw new Error("词数异常");
  console.log(`  报默页 OK：复习卷 ${d.words.length} 词，首词「${d.words[0].word}」`);
  await shot(mp, "d5-dictation-ready");

  // 开始，判完整轮：篱笆对(毕业) 绒球错 地毯对 穿戴对
  await tap(page, ".start-btn"); // ready 页「开始报默」
  await sleep(1500);
  d = await page.data();
  const seq = d.words.map((w) => w.word);
  const verdicts = ["1", "0", "1", "1"]; // 篱笆对 绒球错 地毯对 穿戴对
  for (let i = 0; i < d.words.length; i++) {
    await page.callMethod("mark", { currentTarget: { dataset: { ok: verdicts[i] } } });
    await page.waitFor(300);
  }
  console.log(`  已判完 4 词：${seq.map((w, i) => `${w}${verdicts[i] === "1" ? "√" : "×"}`).join(" ")}`);
  d = await page.data();
  if (d.phase !== "done") throw new Error("应进入 done，实际 " + d.phase);
  if (d.result.total !== 4 || d.result.correct !== 3) {
    throw new Error(`结果异常: total=${d.result.total} correct=${d.result.correct}`);
  }
  console.log(`  done OK：正确率 ${d.result.pct}%`);
  /* ---------- 5. storage 断言：毕业 + 错题更新 + session ---------- */
  console.log("\n[5] storage 断言");
  const check = await mp.evaluate(() => {
    const wb = wx.getStorageSync("wrong_book");
    const ss = wx.getStorageSync("dictation_sessions");
    return {
      liba: wb.find((w) => w.word === "篱笆"),
      rongqiu: wb.find((w) => w.word === "绒球"),
      reviewSession: ss.find((s) => s.mode === "review"),
    };
  });
  if (!check.liba || !check.liba.mastered) throw new Error("篱笆连对 3 应毕业");
  if (!check.rongqiu || check.rongqiu.wrongCount !== 4) throw new Error("绒球错后应为 4 次");
  if (!check.reviewSession) throw new Error("review session 未入库");
  console.log(`  毕业 ✓「篱笆」连对 3 出池 · 错题更新 ✓「绒球」错 4 次 · session mode=review ✓`);

  /* ---------- 6. 错题本页刷新：3 词在池 ---------- */
  console.log("\n[6] 错题本页复核");
  await mp.switchTab("/pages/wrong-book/wrong-book");
  await sleep(1500);
  page = await mp.currentPage();
  d = await page.data();
  if (d.items.length !== 3) throw new Error("在池应剩 3 词，实际 " + d.items.length);
  if (d.masteredCount !== 1) throw new Error("已毕业应 1，实际 " + d.masteredCount);
  console.log(`  在池 3 词 · 已毕业 1 ✓`);

  /* ---------- 结果 ---------- */
  if (errs.length) {
    console.log("\n⚠️ 运行时报错：\n" + errs.join("\n"));
    process.exit(1);
  }
  console.log("\n========== D5 结果 ==========");
  console.log("✅ 全流程 PASS，零运行时报错");
  await shot(mp, "d5-final");
  await mp.disconnect();
  process.exit(0);
})().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});

/* D8 自检：官方站复刻四件套
   看拼音写词语 / 多音字 / 古诗填空 / 练习单 + 首页入口 */
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

  /* ---------- 1. 首页入口 ---------- */
  console.log("\n[1] 首页「更多练法」入口");
  let page = await mp.reLaunch("/pages/index/index");
  await sleep(1800);
  page = await mp.currentPage();
  const extras = await page.$$(".extra-item");
  if (extras.length !== 4) throw new Error("首页入口数量异常: " + extras.length);
  console.log("  4 个练法入口渲染 OK");

  /* ---------- 2. 看拼音写词语 ---------- */
  console.log("\n[2] 看拼音写词语：U2 词语表 4 词");
  await mp.reLaunch("/pages/pinyin-write/pinyin-write");
  await sleep(1600);
  page = await mp.currentPage();
  await page.callMethod("onPickUnit", { currentTarget: { dataset: { unit: 2 } } });
  await page.callMethod("onPickList", { currentTarget: { dataset: { list: "ciyu" } } });
  let d = await page.data();
  console.log(`  选中 ${d.unitTitle} · ${d.listType} · ${d.count} 词`);
  await page.callMethod("onCountMinus");
  await page.callMethod("onCountMinus");
  await page.callMethod("onCountMinus");
  await page.callMethod("onCountMinus");
  await page.callMethod("onStart");
  await sleep(500);
  d = await page.data();
  if (d.phase !== "running" || d.words.length !== 4) throw new Error("pw 开始异常: " + JSON.stringify({ phase: d.phase, n: d.words.length }));
  // 第 1 词：显示答案 → 判对；第 2 词：显示答案 → 判错
  await page.callMethod("onReveal");
  await sleep(400);
  await page.callMethod("mark", { currentTarget: { dataset: { ok: "1" } } });
  await sleep(300);
  await page.callMethod("onReveal");
  await sleep(300);
  await page.callMethod("mark", { currentTarget: { dataset: { ok: "0" } } });
  await sleep(300);
  // 剩余 2 词直接显示答案 + 判对
  for (let i = 0; i < 2; i++) {
    await page.callMethod("onReveal");
    await sleep(200);
    await page.callMethod("mark", { currentTarget: { dataset: { ok: "1" } } });
    await sleep(300);
  }
  d = await page.data();
  if (d.phase !== "done" || d.result.total !== 4 || d.result.correct !== 3) {
    throw new Error("pw 结果异常: " + JSON.stringify(d.result));
  }
  const st = await mp.evaluate(() => ({
    sessions: wx.getStorageSync("dictation_sessions"),
    wrong: wx.getStorageSync("wrong_book"),
  }));
  const s0 = st.sessions[0];
  if (s0.mode !== "pinyin" || s0.total !== 4 || s0.correct !== 3) throw new Error("pw session 异常");
  if (!st.wrong.find((w) => w.word === d.result.wrongList[0].word)) throw new Error("pw 错题本未收录");
  console.log(`  done OK：75%（3/4），session(mode=pinyin) ✓ 错词「${d.result.wrongList[0].word}」进错题本 ✓`);

  /* ---------- 3. 多音字 ---------- */
  console.log("\n[3] 多音字：8 题全答对");
  await mp.reLaunch("/pages/polyphone/polyphone");
  await sleep(1600);
  page = await mp.currentPage();
  await page.callMethod("onStart");
  await sleep(400);
  for (let i = 0; i < 8; i++) {
    d = await page.data();
    await page.callMethod("onPick", { currentTarget: { dataset: { py: d.current.answer } } });
    await sleep(200);
    await page.callMethod("onNext");
    await sleep(200);
  }
  d = await page.data();
  if (d.phase !== "done" || d.result.correct !== 8) throw new Error("多音字结果异常: " + JSON.stringify(d.result));
  console.log("  done OK：100%（8/8），选项判分与辨析提示 ✓");
  try { await mp.screenshot({ path: "tools/shots/d8-polyphone.png" }); } catch (e) {}

  /* ---------- 4. 古诗填空 ---------- */
  console.log("\n[4] 古诗填空：《山行》2 空全对");
  await mp.reLaunch("/pages/poem/poem");
  await sleep(1600);
  page = await mp.currentPage();
  d = await page.data();
  if (d.poems.length !== 8) throw new Error("古诗数量异常: " + d.poems.length);
  await page.callMethod("onPickPoem", { currentTarget: { dataset: { idx: 0 } } });
  await sleep(400);
  for (let i = 0; i < 2; i++) {
    d = await page.data();
    await page.callMethod("onPick", { currentTarget: { dataset: { ch: d.blanks[d.cur].char } } });
    await sleep(200);
    await page.callMethod("onNext");
    await sleep(200);
  }
  d = await page.data();
  if (d.phase !== "done" || d.result.correct !== 2) throw new Error("古诗结果异常: " + JSON.stringify(d.result));
  console.log("  全诗展示 + 计分 OK（2/2）");
  try { await mp.screenshot({ path: "tools/shots/d8-poem.png" }); } catch (e) {}

  /* ---------- 5. 练习单 ---------- */
  console.log("\n[5] 练习单：U2 写字表生成");
  await mp.reLaunch("/pages/sheet/sheet");
  await sleep(1600);
  page = await mp.currentPage();
  await page.callMethod("onPickUnit", { currentTarget: { dataset: { unit: 2 } } });
  await page.callMethod("onPickList", { currentTarget: { dataset: { list: "xiezi" } } });
  await page.callMethod("onGenerate");
  await sleep(500);
  d = await page.data();
  if (d.phase !== "sheet" || !d.rows.length) throw new Error("练习单生成异常");
  if (d.rows.some((r) => !r.pinyin || !r.cells.length)) throw new Error("练习单行数据异常");
  console.log(`  生成 ${d.rows.length} 词的 A4 版式练习单 ✓`);
  try { await mp.screenshot({ path: "tools/shots/d8-sheet.png" }); console.log("  📸 d8-sheet.png"); } catch (e) {}

  /* ---------- 汇总 ---------- */
  console.log("\n========== D8 结果 ==========");
  if (errs.length) {
    console.log("⚠ 运行时报错：\n" + errs.join("\n"));
  } else {
    console.log("✅ 官方站复刻四件套全流程 PASS，零运行时报错");
  }
  await mp.disconnect();
  process.exit(errs.length ? 2 : 0);
})().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});

/* D11 自检：手写默写判分 + 词解读（M2.3 扩展：看写法记错题本 + 判错逐字定位）
   1. 语文报默：手写判分（mock OCR）→ 改判 → 下一个词流转；中文解读链路（NO_KEY 提示）
   1.5 看写法：自动记错题本 + 田字格揭示；判错定位 detail/hint
   2. 英语报默：四线三格手写判分（mock OCR 滑窗）；显示拼写记错词本；词典释义两层
   3. 手写板组件渲染（田字格 + 四线三格两种背景） */
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

let passed = 0;
const ok = (name) => { passed++; console.log(`  PASS ${name}`); };

(async () => {
  const mp = await connect();
  console.log("已连接自动化端口");

  /* ===== 1. 语文报默：手写判分 ===== */
  console.log("\n[1] 语文手写判分（mock OCR）");
  await mp.reLaunch("/pages/dictation/dictation?term=1&unit=1&listType=xiezi&count=3");
  await sleep(1600);
  let page = await mp.currentPage();
  await page.callMethod("onStart");
  await sleep(1200);
  page = await mp.currentPage();
  let d = await page.data();
  if (d.phase !== "running") throw new Error("报默未进入 running");

  // 手写板已挂载（组件内部节点对 page.$ 不可见，用 selectComponent 断言）
  const hasHw = await mp.evaluate(() => {
    const pages = getCurrentPages();
    const p = pages[pages.length - 1];
    return !!p.selectComponent("#hw");
  });
  if (!hasHw) throw new Error("手写板组件未挂载");
  ok("手写板（田字格）挂载于 running 态");

  // 目标词正确 → OCR 返回该词 → 判对
  const word = d.current.word;
  await page.callMethod("onMockHw", [word]);
  d = await page.data();
  if (!d.hwJudge || d.hwJudge.judge !== "ok") {
    throw new Error("正确词判分异常: " + JSON.stringify(d.hwJudge));
  }
  ok(`目标词「${word}」OCR 判对 ✓`);

  // 近似词（改一字）→ 容错判对（len<=2 阈值 1）
  if (word.length >= 2) {
    const near = word[0] + (word[1] === "水" ? "氷" : "水");
    await page.callMethod("onMockHw", [near]);
    d = await page.data();
    if (!d.hwJudge || d.hwJudge.judge !== "ok") {
      throw new Error("近似词容错异常: " + JSON.stringify(d.hwJudge));
    }
    ok(`近似词容错判对 ✓`);
  }

  // 改判 + 下一个词
  await page.callMethod("onHwToggle");
  d = await page.data();
  if (d.hwJudge.judge !== "wrong") throw new Error("改判异常");
  ok("改判 ok→wrong ✓");

  await page.callMethod("onHwNext");
  await sleep(800);
  d = await page.data();
  if (d.index !== 1 || d.words[0].status !== "wrong") {
    throw new Error("下一个词流转异常: " + JSON.stringify({ index: d.index, st: d.words[0].status }));
  }
  if (d.hwJudge !== null) throw new Error("hwJudge 未随换词清空");
  ok("下一个词流转 + 判分态清空 ✓（错词入错题本）");
  try { await mp.screenshot({ path: "tools/shots/d11-zh-hw.png" }); } catch (e) {}

  // 中文解读（已配 Agnes → 真实 LLM 调用 3-60s；未配 → 引导提示；轮询等完）
  await page.callMethod("onExplain");
  d = await page.data();
  const zhDeadline = Date.now() + 90000;
  while (d.explain && d.explain.loading && Date.now() < zhDeadline) {
    await sleep(5000);
    d = await page.data();
  }
  if (!d.explain) throw new Error("中文解读无响应");
  if (d.explain.error) {
    if (!/Agnes|DeepSeek|密钥/.test(d.explain.error)) throw new Error("解读提示异常: " + d.explain.error);
    ok("中文解读链路通（未配密钥 → 返回引导提示）");
  } else {
    if (!d.explain.meaning) throw new Error("解读内容为空");
    ok("中文解读已返回（Agnes LLM）: " + String(d.explain.meaning).slice(0, 30) + "…");
  }

  /* ===== 1.5 看写法 + 判错定位（M2.3） ===== */
  console.log("\n[1.5] 看写法记错题本 + 判错逐字定位");
  d = await page.data();
  const w1 = d.current.word;
  await page.callMethod("onRevealZh");
  await sleep(500);
  d = await page.data();
  if (!d.revealed || d.revealCells.map((c) => c.ch).join("") !== w1) {
    throw new Error("田字格揭示异常: " + JSON.stringify(d.revealCells));
  }
  ok(`看写法田字格揭示「${w1}」✓`);

  const wb = await mp.callWxMethod("getStorageSync", "wrong_book");
  if (!Array.isArray(wb) || !wb.some((x) => x.word === w1)) {
    throw new Error("看写法未记入错题本");
  }
  ok("看写法自动记入错题本 ✓");

  // 判错定位：mock 一个与目标完全不同的 OCR 结果（保证超容错阈值）
  const forbidden = new Set(w1.split(""));
  const pool = "口日月山水火木".split("").filter((c) => !forbidden.has(c));
  const mockBad = pool.slice(0, 3).join("");
  await page.callMethod("onMockHw", [mockBad]);
  d = await page.data();
  if (!d.hwJudge || d.hwJudge.judge !== "wrong" || !d.hwJudge.detail || !d.hwJudge.hint) {
    throw new Error("判错定位缺失: " + JSON.stringify(d.hwJudge));
  }
  ok(`判错逐字定位 ✓（${d.hwJudge.hint}）`);
  try { await mp.screenshot({ path: "tools/shots/d11-zh-detail.png" }); } catch (e) {}

  // 流转：revealCounted 状态下 mark 不重复记错题本
  await page.callMethod("onHwNext");
  await sleep(800);
  d = await page.data();
  if (d.index !== 2) throw new Error("看写法后流转异常: index=" + d.index);
  ok("看写法 → 判分 → 流转 ✓");

  /* ===== 2. 英语报默：手写判分 + 词典释义 ===== */
  console.log("\n[2] 英语手写判分 + 词典释义");
  await mp.reLaunch("/pages/english-dictation/english-dictation?grade=3&term=1&unit=1");
  await sleep(1800);
  page = await mp.currentPage();
  d = await page.data();
  const en0 = d.words[0].en;

  // 手写板（四线三格）
  const hasHwEn = await mp.evaluate(() => {
    const pages = getCurrentPages();
    const p = pages[pages.length - 1];
    return !!p.selectComponent("#hw");
  });
  if (!hasHwEn) throw new Error("英语手写板未挂载");
  ok("手写板（四线三格）挂载 ✓");

  // 近似拼写（漏一个字母）→ 滑窗容错判对
  await page.callMethod("onMockHw", [en0.slice(0, -1)]);
  d = await page.data();
  if (!d.hwJudge || d.hwJudge.judge !== "ok") {
    throw new Error("英语近似拼写判分异常: " + JSON.stringify(d.hwJudge));
  }
  ok(`近似拼写「${en0.slice(0, -1)}」→ 目标「${en0}」容错判对 ✓`);

  await page.callMethod("onHwNext");
  await sleep(800);
  d = await page.data();
  if (d.index !== 1 || d.words[0].status !== "ok") throw new Error("英语下一个词流转异常");
  ok("英语判分入库 + 流转 ✓");

  // 显示拼写 → 自动记错词本（M2.3）
  d = await page.data();
  const en1 = d.current.en;
  await page.callMethod("onReveal");
  await sleep(500);
  d = await page.data();
  if (!d.revealed || d.revealCells.map((c) => c.ch).join("") !== en1) {
    throw new Error("四线三格揭示异常: " + JSON.stringify(d.revealCells));
  }
  ok(`显示拼写四线三格揭示「${en1}」✓`);
  const wbe = await mp.callWxMethod("getStorageSync", "wrong_book_en");
  if (!Array.isArray(wbe) || !wbe.some((x) => x.en === en1)) {
    throw new Error("显示拼写未记入错词本");
  }
  ok("显示拼写自动记入错词本 ✓");

  // 英语判错定位（3 错超阈值 2）
  const forbEn = new Set(en1.split(""));
  const poolEn = "zqxjvk".split("").filter((c) => !forbEn.has(c));
  await page.callMethod("onMockHw", [poolEn.slice(0, 3).join("")]);
  d = await page.data();
  if (!d.hwJudge || d.hwJudge.judge !== "wrong" || !d.hwJudge.detail || !d.hwJudge.hint) {
    throw new Error("英语判错定位缺失: " + JSON.stringify(d.hwJudge));
  }
  ok(`英语判错逐字母定位 ✓（${d.hwJudge.hint}）`);
  try { await mp.screenshot({ path: "tools/shots/d11-en-detail.png" }); } catch (e) {}

  // 释义两层：① 词库本地释义立即显示 ② LLM 联网增强（未配密钥 → 保留本地 + 引导提示）
  await page.callMethod("onExplain");
  await sleep(600);
  d = await page.data();
  const zhExpect = d.current && d.current.zh;
  if (!d.explain || d.explain.level !== 1 || d.explain.meanings[0] !== zhExpect) {
    throw new Error("本地释义未立即显示: " + JSON.stringify(d.explain));
  }
  ok(`课本释义立即显示 ✓（${d.explain.meanings[0]}）`);

  await page.callMethod("onExplain"); // 第二次点 → LLM 增强
  d = await page.data();
  const enDeadline = Date.now() + 90000;
  while (d.explain && d.explain.loading && Date.now() < enDeadline) {
    await sleep(5000);
    d = await page.data();
  }
  if (d.explain && d.explain.level === 2 && d.explain.meanings.length && !d.explain.loading) {
    ok("LLM 联网详解已返回 ✓");
  } else if (d.explain && d.explain.error && /Agnes|DeepSeek|密钥/.test(d.explain.error)) {
    ok("LLM 增强链路通（未配密钥 → 本地释义保留 + 引导提示）");
  } else {
    throw new Error("释义两层逻辑异常: " + JSON.stringify(d.explain));
  }
  try { await mp.screenshot({ path: "tools/shots/d11-en-hw.png" }); } catch (e) {}

  console.log(`\n========== D11 结果 ==========`);
  console.log(`✅ 手写判分 + 解读全流程 PASS（${passed} 项）`);
  process.exit(0);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});

/* D3 自检：TTS 报默全流程 + 断点续默 + 入库断言
   前置：微信开发者工具已打开项目且自动化端口 9420 就绪
   （启动 GUI → cli.bat auto --project ... --auto-port 9420）
   用法：node tools/auto-check-d3.js */
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

async function shot(mp, name) {
  try {
    await mp.screenshot({ path: `tools/shots/${name}.png` });
    console.log(`  📸 ${name}.png`);
  } catch (e) {
    console.log(`  ⚠ 截图失败 ${name}: ${e.message}`);
  }
}

async function tap(page, sel) {
  const el = await page.$(sel);
  if (!el) throw new Error(`找不到元素 ${sel}`);
  await el.tap();
}

(async () => {
  const mp = await connect();
  console.log("已连接自动化端口");
  const errs = [];
  mp.on("exception", (e) => errs.push("EXC: " + String(e.message).slice(0, 300)));
  mp.on("console", (m) => {
    if (m.type === "error") errs.push("ERR: " + JSON.stringify(m.args).slice(0, 300));
  });

  /* ---------- 1. ready ---------- */
  console.log("\n[1] 进入报默页（U2 词语表 5 词）");
  let page = await mp.reLaunch("/pages/dictation/dictation?term=1&unit=2&listType=ciyu&count=5");
  await page.waitFor(1500);
  let d = await page.data();
  if (d.phase !== "ready") throw new Error("ready 阶段异常: " + d.phase);
  if (d.words.length !== 5) throw new Error("词数应为 5，实际 " + d.words.length);
  console.log(`  ready OK：${d.unitTitle} ${d.listName}，${d.words.length} 词，TTS 插件 ${d.ttsOk === false ? "❌不可用" : "已声明"}`);
  await shot(mp, "d3-ready");

  /* ---------- 2. running：报词 + 标对错 ---------- */
  console.log("\n[2] 开始报默 → 判 3 对 1 错 1 对");
  await tap(page, ".start-btn");
  await page.waitFor(3000); // 给 TTS 请求与播放留时间
  d = await page.data();
  if (d.phase !== "running") throw new Error("running 阶段异常: " + d.phase);
  if (!d.current || !d.current.word) throw new Error("当前词未设置");
  console.log(`  第 1 词已报：${d.current.word}（${d.current.pinyin}）`);
  await shot(mp, "d3-running");

  let wrongWord = null;
  for (let i = 0; i < 5; i++) {
    const ok = i !== 3; // 第 4 词标错
    if (!ok) {
      const cur = await page.data();
      wrongWord = cur.words[3].word;
    }
    await tap(page, ok ? ".judge-right" : ".judge-wrong");
    await page.waitFor(900);
  }
  d = await page.data();
  if (d.phase !== "done") throw new Error("判完 5 词未进入 done: " + d.phase);
  if (d.result.total !== 5 || d.result.correct !== 4) {
    throw new Error(`结果异常：total=${d.result.total} correct=${d.result.correct}`);
  }
  console.log(`  done OK：正确率 ${d.result.pct}%，错词「${d.result.wrongList.map((w) => w.word).join("、")}」`);
  await shot(mp, "d3-done");

  /* ---------- 3. storage 断言 ---------- */
  console.log("\n[3] storage 断言（session 入库 / 错题本 / 断点清除）");
  const st = await mp.evaluate(() => ({
    sessions: wx.getStorageSync("dictation_sessions"),
    wrong: wx.getStorageSync("wrong_book"),
    progress: wx.getStorageSync("progress"),
  }));
  if (!st.sessions || !st.sessions.length) throw new Error("dictation_sessions 未入库");
  const s0 = st.sessions[0];
  if (s0.total !== 5 || s0.correct !== 4) throw new Error("session 数据异常: " + JSON.stringify(s0).slice(0, 120));
  const wrongHit = (st.wrong || []).find((w) => w.word === wrongWord);
  if (!wrongHit || wrongHit.wrongCount < 1) throw new Error(`错题本未收录「${wrongWord}」`);
  if (st.progress) throw new Error("完成后 progress 应已清除");
  console.log(`  session ✓（${s0.unit} ${s0.listType} 4/5）· 错题本收录「${wrongWord}」✓ · 断点已清 ✓`);

  /* ---------- 4. 断点续默 ---------- */
  console.log("\n[4] 断点续默：再来一轮 → 判 2 词 → 离开 → 回来续默");
  // 「再来一轮」是 ctrl-row 第一个按钮
  const ctrlBtns = await page.$$(".ctrl-btn");
  await ctrlBtns[0].tap();
  await page.waitFor(800);
  let d2 = await page.data();
  if (d2.phase !== "running") throw new Error("重开一轮失败: " + d2.phase);
  console.log("  已重开一轮，判 2 词…");
  await tap(page, ".judge-right");
  await page.waitFor(700);
  await tap(page, ".judge-right");
  await page.waitFor(700);

  // 离开（模拟 home/切走）：直接 reLaunch 到 vocab
  await mp.reLaunch("/pages/vocab/vocab");
  await page.waitFor(800);
  // 回报默页
  page = await mp.reLaunch("/pages/dictation/dictation?term=1&unit=2&listType=ciyu&count=5");
  await page.waitFor(1200);
  d = await page.data();
  if (!d.resume || d.resume.index !== 2) {
    throw new Error("断点卡缺失或 index 异常: " + JSON.stringify(d.resume && { i: d.resume.index }));
  }
  console.log(`  断点卡 OK：${d.resumeText}`);
  await tap(page, ".resume-btn");
  await page.waitFor(2000);
  d = await page.data();
  if (d.phase !== "running" || d.index !== 2) throw new Error("续默未从第 3 词开始: " + d.phase + "/" + d.index);
  console.log("  续默 OK：从第 3 词继续");
  // 收尾：判完剩余
  for (let i = 0; i < 3; i++) {
    await tap(page, ".judge-right");
    await page.waitFor(800);
  }
  d = await page.data();
  if (d.phase !== "done") throw new Error("续默后未完成: " + d.phase);
  console.log(`  续默完成：${d.result.correct}/${d.result.total}`);

  /* ---------- 汇总 ---------- */
  console.log("\n========== D3 结果 ==========");
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

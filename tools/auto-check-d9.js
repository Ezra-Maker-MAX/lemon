/* D9 自检：M2 四件套
   柠檬单词（英语浏览+听写）/ 自定义词表（建表→报默→看拼音写→练习单）/ 错题本周报
   注：练习单「存为图片」需真机验证相册权限，此处只验页面数据流 */
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

  /* ---------- 1. 首页 → 柠檬单词 ---------- */
  console.log("\n[1] 首页点亮柠檬单词");
  let page = await mp.reLaunch("/pages/index/index");
  await sleep(1800);
  page = await mp.currentPage();
  await page.callMethod("goEnglish");
  await sleep(1800);
  page = await mp.currentPage();
  let d = await page.data();
  if (!d.units || d.units.length !== 6) throw new Error("英语单元数异常: " + (d.units || []).length);
  if (d.words.length !== 12) throw new Error("U1 词数异常: " + d.words.length);
  console.log(`  6 单元 × ${d.words.length} 词卡渲染 OK（四线三格）`);
  try { await mp.screenshot({ path: "tools/shots/d9-english.png" }); } catch (e) {}

  /* ---------- 2. 英语听音拼写 ---------- */
  console.log("\n[2] 英语听音拼写：U1 全流程（真实英语 TTS）");
  await page.callMethod("goDictation");
  await sleep(2000);
  page = await mp.currentPage();
  d = await page.data();
  if (d.phase !== "running" || d.words.length !== 12) throw new Error("英语报默进入异常");
  // 第 1 词揭示判对，第 2 词判错，其余判对
  for (let i = 0; i < d.words.length; i++) {
    await page.callMethod("onReveal");
    await sleep(150);
    await page.callMethod("mark", { currentTarget: { dataset: { ok: i === 1 ? "0" : "1" } } });
    await sleep(250);
  }
  d = await page.data();
  if (d.phase !== "done" || d.result.correct !== 11) throw new Error("英语报默结果异常: " + JSON.stringify(d.result));
  const stEn = await mp.evaluate(() => ({
    sessions: wx.getStorageSync("dictation_sessions"),
    wrongEn: wx.getStorageSync("wrong_book_en"),
  }));
  if (stEn.sessions[0].mode !== "english") throw new Error("english session 未入库");
  if (!stEn.wrongEn.find((w) => w.en === d.result.wrongList[0].en)) throw new Error("英语错词未收录");
  console.log(`  done OK：92%（11/12），session(mode=english) ✓ 错词「${d.result.wrongList[0].en}」入 wrong_book_en ✓`);
  try { await mp.screenshot({ path: "tools/shots/d9-ed-done.png" }); } catch (e) {}

  /* ---------- 3. 自定义词表：建表 → 补拼音 → 报默 ---------- */
  console.log("\n[3] 自定义词表全流程");
  await mp.reLaunch("/pages/custom-list/custom-list");
  await sleep(1600);
  page = await mp.currentPage();
  await page.callMethod("onNew");
  await page.callMethod("onName", { detail: { value: "测试词单" } });
  await page.callMethod("onRaw", { detail: { value: "明月 温柔 早餐 晴朗" } });
  await sleep(200);
  d = await page.data();
  if (d.editWordCount !== 4) throw new Error("词数识别异常: " + d.editWordCount);
  await page.callMethod("onSave");
  await sleep(400);
  const stCustom = await mp.evaluate(() => wx.getStorageSync("custom_lists"));
  const cl = stCustom.find((x) => x.name === "测试词单");
  if (!cl || cl.words.length !== 4) throw new Error("自定义词单保存异常");
  const noPinyin = cl.words.filter((w) => !w.pinyin).length;
  console.log(`  词单保存 OK（4 词，补上拼音 ${4 - noPinyin}/4）`);

  // 报默走自定义词源
  await page.callMethod("goDictation", { currentTarget: { dataset: { id: cl.id } } });
  await sleep(1800);
  page = await mp.currentPage();
  d = await page.data();
  if (d.listName !== "自定义词单" || d.words.length !== 4) {
    throw new Error("自定义报默异常: " + JSON.stringify({ listName: d.listName, n: d.words.length }));
  }
  console.log(`  报默页载入「${d.unitTitle}」4 词 ✓`);
  try { await mp.screenshot({ path: "tools/shots/d9-custom.png" }); } catch (e) {}

  /* ---------- 4. 自定义 → 看拼音写词语 ---------- */
  console.log("\n[4] 自定义词单看拼音写");
  await mp.reLaunch(`/pages/pinyin-write/pinyin-write?src=custom&lid=${cl.id}`);
  await sleep(1600);
  page = await mp.currentPage();
  d = await page.data();
  if (!d.isCustom || d.customName !== "测试词单") throw new Error("pw 自定义模式异常");
  await page.callMethod("onStart");
  await sleep(400);
  d = await page.data();
  if (d.phase !== "running" || d.words.length !== 4) throw new Error("pw 自定义开始异常");
  console.log("  自定义词单 4 词进入看拼音写 ✓");

  /* ---------- 5. 自定义 → 练习单 ---------- */
  console.log("\n[5] 自定义词单练习单");
  await mp.reLaunch(`/pages/sheet/sheet?src=custom&lid=${cl.id}`);
  await sleep(1600);
  page = await mp.currentPage();
  d = await page.data();
  if (!d.isCustom) throw new Error("sheet 自定义模式异常");
  await page.callMethod("onGenerate");
  await sleep(400);
  d = await page.data();
  if (d.rows.length !== 4) throw new Error("sheet 自定义行数异常: " + d.rows.length);
  console.log("  自定义练习单 4 行生成 ✓（canvas 导出留真机验证）");

  /* ---------- 6. 错题本周报 ---------- */
  console.log("\n[6] 错题本周报");
  await mp.reLaunch("/pages/wrong-book/wrong-book");
  await sleep(1600);
  page = await mp.currentPage();
  d = await page.data();
  if (!d.weekly || d.weekly.bars.length !== 7) throw new Error("周报数据异常");
  console.log(`  周报 OK：7 日柱状图 · 近7天 ${d.weekly.pct === null ? "—" : d.weekly.pct + "%"} · 重点盯防 ${d.weekly.topWrong.join(" ")}`);
  try { await mp.screenshot({ path: "tools/shots/d9-weekly.png" }); console.log("  📸 d9-weekly.png"); } catch (e) {}

  /* ---------- 汇总 ---------- */
  console.log("\n========== D9 结果 ==========");
  if (errs.length) {
    console.log("⚠ 运行时报错：\n" + errs.join("\n"));
  } else {
    console.log("✅ M2 四件套全流程 PASS，零运行时报错");
  }
  await mp.disconnect();
  process.exit(errs.length ? 2 : 0);
})().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});

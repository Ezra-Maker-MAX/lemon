/* D6 自检：设置页接线
   覆盖：settings 加载 → 语速/间隔/重复/拼音修改落 storage → 报默页消费 settings
   → 清空数据二次确认（mock showModal 自动确认）→ 重置默认值
   末尾会清空 storage，给后续回归一个干净起点 */
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

  /* ---------- 1. 进入设置页，默认值加载 ---------- */
  console.log("\n[1] 打开设置页");
  let page = await mp.reLaunch("/pages/settings/settings");
  await sleep(1500);
  page = await mp.currentPage(); // reLaunch 后重取句柄
  let d = await page.data();
  if (!d.s || d.s.intervalSec !== 15 || d.s.repeatCount !== 1) {
    throw new Error("默认设置异常: " + JSON.stringify(d.s));
  }
  console.log(`  默认值 OK：语速 ${d.s.speechRate}（${d.rateText}）/ 间隔 ${d.s.intervalSec}s / 重复 ${d.s.repeatCount} / 拼音 ${d.s.showPinyin}`);

  /* ---------- 2. 语速滑杆 ---------- */
  console.log("\n[2] 语速 → 0.4");
  await page.callMethod("onRateChange", { detail: { value: 0.4 } });
  await sleep(300);
  d = await page.data();
  if (d.s.speechRate !== 0.4 || d.rateText !== "稍快") throw new Error("语速写入异常: " + d.s.speechRate + "/" + d.rateText);
  console.log(`  speechRate=0.4，标签「${d.rateText}」✓`);

  /* ---------- 3. 间隔滑杆 ---------- */
  console.log("\n[3] 报词间隔 → 25s");
  await page.callMethod("onIntervalChange", { detail: { value: 25 } });
  await sleep(300);
  d = await page.data();
  if (d.s.intervalSec !== 25) throw new Error("间隔写入异常: " + d.s.intervalSec);
  console.log("  intervalSec=25 ✓");

  /* ---------- 4. 重复次数 stepper ---------- */
  console.log("\n[4] 重复次数 1 → 2 → 3 → 边界 3");
  await page.callMethod("onRepeatPlus");
  await page.callMethod("onRepeatPlus");
  await page.callMethod("onRepeatPlus"); // 已到 3，再点不越界
  await sleep(300);
  d = await page.data();
  if (d.s.repeatCount !== 3) throw new Error("重复次数异常: " + d.s.repeatCount);
  console.log("  repeatCount=3（+3 次封顶）✓");

  /* ---------- 5. 拼音开关 ---------- */
  console.log("\n[5] 拼音提示 → 开");
  await page.callMethod("onPinyinToggle", { detail: { value: true } });
  await sleep(300);
  d = await page.data();
  if (d.s.showPinyin !== true) throw new Error("拼音开关异常");
  console.log("  showPinyin=true ✓");

  /* ---------- 6. 报默页消费 settings ---------- */
  console.log("\n[6] 报默页读取 settings");
  await mp.reLaunch("/pages/dictation/dictation?term=1&unit=1&listType=xiezi&count=5");
  await sleep(1800);
  const consumed = await mp.evaluate(() => {
    const p = getCurrentPages().find((pg) => pg.route.indexOf("dictation") > -1);
    return p ? { rate: p.settings.speechRate, sec: p.settings.intervalSec, rep: p.settings.repeatCount, pinyin: p.settings.showPinyin } : null;
  });
  if (!consumed || consumed.rate !== 0.4 || consumed.sec !== 25 || consumed.rep !== 3 || consumed.pinyin !== true) {
    throw new Error("报默页 settings 消费异常: " + JSON.stringify(consumed));
  }
  console.log(`  报默页读到：语速 ${consumed.rate} / 间隔 ${consumed.sec}s / 重复 ${consumed.rep} / 拼音 ${consumed.pinyin} ✓`);

  /* ---------- 7. 清空数据（mock showModal 自动确认） ---------- */
  console.log("\n[7] 清空全部数据（mock 二次确认）");
  await mp.reLaunch("/pages/settings/settings");
  await sleep(1500);
  page = await mp.currentPage();
  await mp.evaluate(() => {
    // 先塞脏数据，验证清空确实生效
    wx.setStorageSync("dictation_sessions", [{ total: 9, correct: 0, date: new Date().toISOString() }]);
    wx.showModal = (opt) => opt.success && opt.success({ confirm: true });
  });
  await page.callMethod("onClearData");
  await sleep(600);
  const cleared = await mp.evaluate(() => {
    const store = require("utils/store.js");
    return {
      sessions: wx.getStorageSync("dictation_sessions"),
      settings: wx.getStorageSync("settings"),
    };
  });
  if (cleared.sessions.length !== 0) throw new Error("清空后 sessions 残留: " + JSON.stringify(cleared.sessions).slice(0, 100));
  if (!cleared.settings || cleared.settings.intervalSec !== 15 || cleared.settings.speechRate !== 0) {
    throw new Error("清空后默认值未重置: " + JSON.stringify(cleared.settings));
  }
  console.log("  脏数据已清，默认设置已重置 ✓");
  try {
    await mp.screenshot({ path: "tools/shots/d6-settings.png" });
    console.log("  📸 d6-settings.png");
  } catch (e) {}

  /* ---------- 汇总 ---------- */
  console.log("\n========== D6 结果 ==========");
  if (errs.length) {
    console.log("⚠ 运行时报错：\n" + errs.join("\n"));
  } else {
    console.log("✅ 设置页接线全流程 PASS，零运行时报错");
  }
  await mp.disconnect();
  process.exit(errs.length ? 2 : 0);
})().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});

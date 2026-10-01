/* explain 动作真实验证：经模拟器 wx.cloud.callFunction 调云函数 ai
   注意：automator evaluate 有 ~60s 响应上限，冷启动调用会超时 → 统一 fire-and-poll 模式 */
const automator = require("miniprogram-automator");

const TIMEOUT = 150000;

async function callExplain(mp, lang, word) {
  await mp.evaluate((lang, w) => {
    const app = getApp();
    app._explainTest = { done: false };
    wx.cloud
      .callFunction({ name: "ai", data: { action: "explain", lang, word: w } })
      .then((r) => (app._explainTest = { done: true, result: r.result }))
      .catch((e) => (app._explainTest = { done: true, error: String(e.errMsg || e.message).slice(0, 120) }));
    return true;
  }, lang, word);
  const t0 = Date.now();
  while (Date.now() - t0 < TIMEOUT) {
    await new Promise((r) => setTimeout(r, 5000));
    const st = await mp.evaluate(() => getApp()._explainTest);
    if (st.done) return st;
  }
  return { done: true, error: "poll-timeout" };
}

(async () => {
  const mp = await automator.connect({ wsEndpoint: "ws://127.0.0.1:9420" });
  console.log("已连接");
  let pass = 0, fail = 0;

  // 1) 中文解读
  const zh = await callExplain(mp, "zh", "早晨");
  const zhOk = zh.result && zh.result.code === "OK" && zh.result.data && zh.result.data.meaning;
  console.log("zh 早晨 →", JSON.stringify(zh.result || zh.error || {}).slice(0, 300));
  zhOk ? (pass++, console.log("✅ 中文解读 PASS")) : (fail++, console.log("❌ 中文解读 FAIL", zh.error || ""));

  // 2) 英文释义（复用热实例）
  const en = await callExplain(mp, "en", "watermelon");
  const enOk = en.result && en.result.code === "OK" && en.result.data && en.result.data.meanings && en.result.data.meanings.length;
  console.log("en watermelon →", JSON.stringify(en.result || en.error || {}).slice(0, 300));
  enOk ? (pass++, console.log("✅ 英文释义 PASS")) : (fail++, console.log("❌ 英文释义 FAIL", en.error || ""));

  console.log(`\n结果: ${pass} PASS / ${fail} FAIL`);
  await mp.disconnect();
  if (fail) process.exitCode = 1;
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });

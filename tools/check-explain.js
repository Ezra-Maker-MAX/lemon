/* explain 动作真实验证：经模拟器 wx.cloud.callFunction 调云函数 ai */
const automator = require("miniprogram-automator");

(async () => {
  const mp = await automator.connect({ wsEndpoint: "ws://127.0.0.1:9420" });
  console.log("已连接");
  let pass = 0, fail = 0;

  // 1) 中文解读
  const zh = await mp.evaluate((w) =>
    wx.cloud.callFunction({ name: "ai", data: { action: "explain", lang: "zh", word: w } }).then((r) => r.result),
  "早晨");
  console.log("zh 早晨 →", JSON.stringify(zh).slice(0, 300));
  if (zh.code === "OK" && zh.data && zh.data.meaning) { pass++; console.log("✅ 中文解读 PASS"); }
  else { fail++; console.log("❌ 中文解读 FAIL"); }

  // 2) 英文释义
  const en = await mp.evaluate((w) =>
    wx.cloud.callFunction({ name: "ai", data: { action: "explain", lang: "en", word: w } }).then((r) => r.result),
  "watermelon");
  console.log("en watermelon →", JSON.stringify(en).slice(0, 300));
  if (en.code === "OK" && en.data && en.data.meanings && en.data.meanings.length) { pass++; console.log("✅ 英文释义 PASS"); }
  else { fail++; console.log("❌ 英文释义 FAIL"); }

  console.log(`\n结果: ${pass} PASS / ${fail} FAIL`);
  await mp.disconnect();
  if (fail) process.exitCode = 1;
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });

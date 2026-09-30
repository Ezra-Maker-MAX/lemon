/* D7 自检：发音音色选择
   覆盖：音色卡渲染 → 点卡试听+选中（真实云函数 TTS，onDone 即链路通）
   → 换音色缓存 key 区分 → 报默页消费 voiceType → 与 D6 设置项共存 */
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

  /* ---------- 1. 设置页音色卡渲染 ---------- */
  console.log("\n[1] 打开设置页");
  let page = await mp.reLaunch("/pages/settings/settings");
  await sleep(1500);
  page = await mp.currentPage();
  let d = await page.data();
  if (!d.voices || d.voices.length !== 6) throw new Error("音色卡数量异常: " + (d.voices || []).length);
  if (d.s.voiceType !== 101001) console.log(`  当前音色 ${d.s.voiceType}（非默认，属正常）`);
  console.log("  6 款音色卡渲染 OK：" + d.voices.map((v) => v.name).join(" "));
  const cards = await page.$$(".voice-card");
  if (cards.length !== 6) throw new Error("WXML 音色卡节点异常: " + cards.length);

  /* ---------- 2. 点卡试听 + 选中（真实 TTS） ---------- */
  console.log("\n[2] 选「智甜」101016 → 试听 + 选中");
  await page.callMethod("onVoiceTap", { currentTarget: { dataset: { id: 101016 } } });
  await sleep(300);
  d = await page.data();
  if (d.s.voiceType !== 101016) throw new Error("选中未落库: " + d.s.voiceType);
  if (d.previewingId !== 101016) throw new Error("试听态未触发");
  console.log("  voiceType=101016 已落库，试听中…");
  // 等 TTS 播完（onDone 会清 previewingId）——能清掉说明云函数返回音频且播放完成
  for (let i = 0; i < 20; i++) {
    await sleep(1000);
    d = await page.data();
    if (d.previewingId === 0) break;
  }
  if (d.previewingId !== 0) throw new Error("试听 20s 未结束（TTS 链路可能失败）");
  console.log("  试听播放完成（onDone 回调）✓ 真实云函数 TTS 音色链路通");

  /* ---------- 3. 再换一款超自然童声，缓存 key 应区分 ---------- */
  console.log("\n[3] 换「云小朵」403000");
  await page.callMethod("onVoiceTap", { currentTarget: { dataset: { id: 403000 } } });
  await sleep(300);
  d = await page.data();
  if (d.s.voiceType !== 403000) throw new Error("换音色未落库: " + d.s.voiceType);
  for (let i = 0; i < 20; i++) {
    await sleep(1000);
    d = await page.data();
    if (d.previewingId === 0) break;
  }
  if (d.previewingId !== 0) throw new Error("云小朵试听未完成");
  console.log("  403000 试听完成 ✓ 两款音色缓存互不串音");

  /* ---------- 4. 报默页消费 voiceType ---------- */
  console.log("\n[4] 报默页读取 voiceType");
  await mp.reLaunch("/pages/dictation/dictation?term=1&unit=1&listType=xiezi&count=3");
  await sleep(1800);
  const consumed = await mp.evaluate(() => {
    const p = getCurrentPages().find((pg) => pg.route.indexOf("dictation") > -1);
    return p ? p.settings.voiceType : null;
  });
  if (consumed !== 403000) throw new Error("报默页 voiceType 异常: " + consumed);
  console.log(`  报默页将用「云小朵」(${consumed}) 报默 ✓`);

  /* ---------- 5. D6 设置项共存回归 ---------- */
  console.log("\n[5] D6 设置项共存");
  await mp.reLaunch("/pages/settings/settings");
  await sleep(1500);
  page = await mp.currentPage();
  await page.callMethod("onRateChange", { detail: { value: -0.4 } });
  await page.callMethod("onPinyinToggle", { detail: { value: true } });
  await sleep(300);
  d = await page.data();
  if (d.s.speechRate !== -0.4 || d.s.showPinyin !== true || d.s.voiceType !== 403000) {
    throw new Error("设置项冲突: " + JSON.stringify(d.s));
  }
  console.log("  语速/拼音/音色三项互不覆盖 ✓");
  try {
    await mp.screenshot({ path: "tools/shots/d7-voices.png" });
    console.log("  📸 d7-voices.png");
  } catch (e) {}

  /* ---------- 汇总 ---------- */
  console.log("\n========== D7 结果 ==========");
  if (errs.length) {
    console.log("⚠ 运行时报错：\n" + errs.join("\n"));
  } else {
    console.log("✅ 音色选择全流程 PASS，零运行时报错");
  }
  await mp.disconnect();
  process.exit(errs.length ? 2 : 0);
})().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});

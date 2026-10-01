/* D13 冒烟自检：①年级切换（四上/四下）②英语四下册 ③设置页教材文案 ④古诗配图云链路 ⑤订阅记录链路 */
const automator = require("miniprogram-automator");
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  console.log((cond ? "✅" : "❌") + " " + name + (extra ? "  → " + extra : ""));
  cond ? pass++ : fail++;
};

(async () => {
  const mp = await automator.connect({ wsEndpoint: "ws://127.0.0.1:9420" });
  console.log("已连接");

  // 1) 词库页：切四年级上/下册
  await mp.evaluate(() => wx.reLaunch({ url: "/pages/vocab/vocab" }));
  await new Promise((r) => setTimeout(r, 2000));
  const g4t1 = await mp.evaluate(() => {
    const p = getCurrentPages().pop();
    p.pickGrade({ currentTarget: { dataset: { grade: 4 } } });
    return { grade: p.data.grade, count: p.data.units.length };
  });
  ok("四年级上册切换（8 单元）", g4t1.grade === 4 && g4t1.count === 8, JSON.stringify(g4t1));

  const g4t2 = await mp.evaluate(() => {
    const p = getCurrentPages().pop();
    p.pickTerm({ currentTarget: { dataset: { term: 2 } } });
    return { grade: p.data.grade, term: p.data.term, count: p.data.units.length };
  });
  ok("四年级下册切换（8 单元）", g4t2.grade === 4 && g4t2.term === 2 && g4t2.count === 8, JSON.stringify(g4t2));

  // 2) 报默页透传 grade：直接以四上 U1 出词
  const g4words = await mp.evaluate(() => {
    const p = getCurrentPages().pop();
    return p ? p.data.units.length : -1;
  });
  ok("四下单元数仍在页态", g4words === 8);

  // 3) 英语主页：四下册在册列表
  await mp.evaluate(() => wx.reLaunch({ url: "/pages/english/english" }));
  await new Promise((r) => setTimeout(r, 2000));
  const enBooks = await mp.evaluate(() => {
    const p = getCurrentPages().pop();
    return { labels: (p.data.books || []).map((b) => b.label) };
  });
  ok(
    "英语四册齐（" + enBooks.labels.join("/") + "）",
    enBooks.labels.length === 4 && enBooks.labels.includes("四下")
  );

  // 4) 设置页：教材文案跟随 profile
  await mp.evaluate(() => wx.reLaunch({ url: "/pages/settings/settings" }));
  await new Promise((r) => setTimeout(r, 2000));
  const gt = await mp.evaluate(() => {
    const p = getCurrentPages().pop();
    return { gradeText: p.data.gradeText, hasWeekly: typeof p.onWeeklyRemind === "function" };
  });
  ok("设置页教材文案动态（" + gt.gradeText + "）", /年级[上下]册/.test(gt.gradeText || ""));
  ok("每周学习提醒入口存在", gt.hasWeekly);

  // 5) 古诗配图全链路：真实 UI 流（选诗 → 答完 → done 阶段自动配图）
  await mp.evaluate(() => wx.reLaunch({ url: "/pages/poem/poem" }));
  await new Promise((r) => setTimeout(r, 2000));
  await mp.evaluate(() => {
    getCurrentPages().pop().onPickPoem({ currentTarget: { dataset: { idx: 0 } } });
    return true;
  });
  // 逐空选正确答案（buildQuiz 只挖 2 空，循环上限兜底）
  for (let i = 0; i < 8; i++) {
    const st = await mp.evaluate(() => {
      const p = getCurrentPages().pop();
      if (p.data.phase !== "running") return { phase: p.data.phase };
      const b = p.data.blanks[p.data.cur];
      if (!b.judged) p.onPick({ currentTarget: { dataset: { ch: b.char } } });
      p.onNext();
      return { phase: p.data.phase };
    });
    if (st.phase === "done") break;
  }
  console.log("   答题完成，等待端直连配图（约 10-40s）…");
  let img = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    await new Promise((r) => setTimeout(r, 6000));
    img = await mp.evaluate(() => {
      const p = getCurrentPages().pop();
      return { phase: p.data.phase, img: p.data.poemImg, loading: p.data.poemImgLoading };
    });
    if (img && img.img) break;
    if (img && !img.loading && !img.img) break; // 已失败，停
  }
  const imgMs = Date.now() - t0;
  ok(
    "古诗配图全链路（" + (imgMs / 1000).toFixed(1) + "s）",
    img && img.img && img.img.indexOf("http") === 0,
    img ? "loading=" + img.loading + " img=" + String(img.img || "").slice(0, 60) : "no-state"
  );

  // 6) 订阅记录链路（devtools 会话有 OPENID；会在 Turso 建 sub_quota 表）
  const sub = await mp.evaluate(() =>
    wx.cloud
      .callFunction({ name: "ai", data: { action: "subscribeReport" } })
      .then((r) => r.result)
      .catch((e) => ({ code: "ERR", message: String(e.errMsg || e.message).slice(0, 100) }))
  );
  ok("订阅记录写入（subscribeReport）", sub.code === "OK", sub.code !== "OK" ? sub.message : "");

  console.log(`\nD13 结果: ${pass} PASS / ${fail} FAIL`);
  await mp.disconnect();
  if (fail) process.exitCode = 1;
})().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});

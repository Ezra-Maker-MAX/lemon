/* D12 冒烟自检：①语文三下词库解锁 ②英语错词统计页渲染 */
const automator = require("miniprogram-automator");
let pass = 0, fail = 0;
const ok = (name, cond) => {
  console.log((cond ? "✅" : "❌") + " " + name);
  cond ? pass++ : fail++;
};

(async () => {
  const mp = await automator.connect({ wsEndpoint: "ws://127.0.0.1:9420" });
  console.log("已连接");

  // 1) 词库页：切到三下，刷新出 8 单元（页面链路验证 hasBook 门控解锁）
  await mp.evaluate(() => wx.reLaunch({ url: "/pages/vocab/vocab" }));
  await new Promise((r) => setTimeout(r, 2000));
  const vocab = await mp.evaluate(() => {
    const p = getCurrentPages().pop();
    p.setData({ term: 2 });
    p.refreshUnits();
    return { count: p.data.units.length, u1: p.data.units[0] };
  });
  ok("语文三下词库解锁（8 单元）", vocab.count === 8);
  ok(
    "三下单元一有写字/识字/词语表",
    vocab.u1 && vocab.u1.counts.xiezi > 0 && vocab.u1.counts.shizi > 0 && vocab.u1.counts.ciyu > 0
  );

  // 3) 统计页导航 + 渲染
  await mp.evaluate(() => wx.reLaunch({ url: "/pages/en-stats/en-stats" }));
  await new Promise((r) => setTimeout(r, 2500));
  const stat = await mp.evaluate(() => {
    const p = getCurrentPages().pop();
    return {
      route: p.route,
      pending: p.data.pending,
      totalWrong: p.data.totalWrong,
      days: p.data.days.length,
      top: p.data.top.length,
      empty: p.data.empty,
    };
  });
  ok("统计页打开（route=" + stat.route + "）", stat.route === "pages/en-stats/en-stats");
  ok("统计页数据就绪（7 天分布 + 汇总）", stat.days === 7 && typeof stat.totalWrong === "number");
  console.log("   统计详情:", JSON.stringify(stat));

  // 4) 英语主页有统计入口
  await mp.evaluate(() => wx.reLaunch({ url: "/pages/english/english" }));
  await new Promise((r) => setTimeout(r, 2000));
  const hasEntry = await mp.evaluate(() => {
    const p = getCurrentPages().pop();
    return typeof p.goStats === "function";
  });
  ok("英语主页 goStats 入口存在", hasEntry);

  console.log(`\nD12 结果: ${pass} PASS / ${fail} FAIL`);
  await mp.disconnect();
  if (fail) process.exitCode = 1;
})().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});

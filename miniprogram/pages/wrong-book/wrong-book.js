/* 错题本（D5）
   未毕业错词列表（错得多的在前）+ 复习卷数量选择 + 一键生成复习卷
   毕业机制：连对 3 次自动出池；已毕业数量在页脚展示 */
const store = require("../../utils/store");

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const p = (n) => (n < 10 ? "0" + n : "" + n);
  return `${d.getMonth() + 1}-${p(d.getDate())}`;
}

Page({
  data: {
    items: [], // 未毕业错词（带展示字段）
    masteredCount: 0,
    count: 10, // 复习卷词数
    maxCount: 10,
  },

  onShow() {
    store.initDefaults();
    this.refresh();
  },

  refresh() {
    const pool = store
      .getWrongBook()
      .slice()
      .sort((a, b) => (b.wrongCount || 0) - (a.wrongCount || 0));
    const mastered = wx
      .getStorageSync(store.KEYS.WRONG)
      .filter((w) => w.mastered).length;
    const items = pool.map((w) => ({
      ...w,
      dateText: fmtDate(w.lastWrongAt),
      streakText: w.correctStreak ? `连对 ${w.correctStreak}/3` : "",
    }));
    const maxCount = Math.max(1, Math.min(20, items.length));
    this.setData({
      items,
      masteredCount: mastered,
      maxCount,
      count: Math.min(this.data.count, maxCount),
      weekly: this.buildWeekly(pool),
    });
  },

  /* ---------- 周报（M2）：近 7 天正确率走势 + 重点错词 ---------- */
  buildWeekly(pool) {
    const sessions = store.getSessions().filter(
      (s) => Date.now() - new Date(s.date).getTime() < 7 * 86400e3
    );
    const DAY = 86400e3;
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * DAY);
      const label = i === 0 ? "今天" : `${d.getMonth() + 1}/${d.getDate()}`;
      days.push({ label, total: 0, wrong: 0 });
    }
    // 逐 session 归日
    const today0 = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
    sessions.forEach((s) => {
      const t = new Date(new Date(s.date).setHours(0, 0, 0, 0)).getTime();
      const idx = Math.round((today0 - t) / DAY);
      if (idx >= 0 && idx < 7) {
        days[6 - idx].total += s.total || 0;
        days[6 - idx].wrong += (s.total || 0) - (s.correct || 0);
      }
    });
    const maxTotal = Math.max(1, ...days.map((d) => d.total));
    const bars = days.map((d) => ({
      ...d,
      h: Math.round((d.total / maxTotal) * 100),
      wrongPct: d.total ? Math.round((d.wrong / d.total) * 100) : 0,
    }));
    const weekWrong = days.reduce((a, d) => a + d.wrong, 0);
    const weekTotal = days.reduce((a, d) => a + d.total, 0);
    return {
      bars,
      weekWrong,
      weekTotal,
      pct: weekTotal ? Math.round(((weekTotal - weekWrong) / weekTotal) * 100) : null,
      topWrong: pool.slice(0, 5).map((w) => w.word),
    };
  },

  incCount() {
    this.setData({ count: Math.min(this.data.count + 1, this.data.maxCount) });
  },
  decCount() {
    this.setData({ count: Math.max(1, this.data.count - 1) });
  },

  goReview() {
    if (!this.data.items.length) return;
    wx.navigateTo({ url: `/pages/review/review?count=${this.data.count}` });
  },

  goVocab() {
    wx.navigateTo({ url: "/pages/vocab/vocab" });
  },
});

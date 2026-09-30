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
    });
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

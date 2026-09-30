/* 首页（D5 接线）
   今日任务卡：报默断点续默 / 无断点引导去词库
   统计卡：近 7 天正确率 + 错题本在池数 */
const store = require("../../utils/store");

Page({
  data: {
    resume: null, // 报默断点
    taskTitle: "语文 · 三年级上册",
    taskCells: [], // 进度格子 [{done,current}]
    weeklyAccuracy: null, // 近 7 天正确率 %
    weeklyText: "—",
    sessionCount: 0,
    wrongCount: 0,
  },

  onShow() {
    store.initDefaults();
    this.refresh();
  },

  refresh() {
    const p = store.getProgress();
    let resume = null;
    const taskCells = [];
    if (p && p.words && p.index > 0 && p.index < p.words.length) {
      resume = {
        title: `${p.unitTitle || ""} ${p.listName || ""}`.trim() || "上次报默",
        text: `已判 ${p.index}/${p.words.length} 词`,
        url: `/pages/dictation/dictation?term=${p.term || 1}&unit=${p.unit || 1}&listType=${p.listType || "xiezi"}&count=${p.words.length}`,
      };
      for (let i = 0; i < Math.min(p.words.length, 10); i++) {
        taskCells.push({ done: i < p.index, current: i === p.index });
      }
    }

    const acc = store.getWeeklyAccuracy();
    const sessions = store.getSessions();
    const wrongCount = store.getWrongBook().length;

    this.setData({
      resume,
      taskCells,
      weeklyAccuracy: acc,
      weeklyText: acc === null ? "本周还没有报默记录" : `近 7 天正确率 ${acc}%`,
      sessionCount: sessions.filter(
        (s) => Date.now() - new Date(s.date).getTime() < 7 * 86400e3
      ).length,
      wrongCount,
    });
  },

  onResume() {
    const r = this.data.resume;
    if (r) wx.navigateTo({ url: r.url });
  },

  goVocab() {
    wx.navigateTo({ url: "/pages/vocab/vocab" });
  },
  goWrongBook() {
    wx.switchTab({ url: "/pages/wrong-book/wrong-book" });
  },
});

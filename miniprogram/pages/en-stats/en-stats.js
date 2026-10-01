const store = require("../../utils/store");

/* 英语错题独立统计页（D-⑥）
   数据源：wrong_book_en（{en, zh, wrongCount, okStreak}）+ sessions(mode=english) */
Page({
  data: {
    pending: 0, // 待复习词数（错词池剩余）
    totalWrong: 0, // 累计拼错次数
    recentRate: 0, // 最近 7 次英语报默正确率 %
    days: [], // 最近 7 天每天拼错次数 [{label, count, isMax}]
    top: [], // Top10 错词榜 [{en, zh, wrongCount, okStreak}]
    empty: true,
  },

  onShow() {
    const wrongList = wx.getStorageSync("wrong_book_en") || [];
    const sessions = store
      .getSessions()
      .filter((s) => s.mode === "english");

    // 最近 7 次正确率
    const recent = sessions.slice(0, 7);
    const recentRate = recent.length
      ? Math.round(
          (recent.reduce((a, s) => a + (s.correct || 0), 0) /
            recent.reduce((a, s) => a + (s.total || 0), 0)) *
            100
        )
      : 0;

    // 最近 7 天每天拼错次数（英语 sessions 按天聚合）
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const wrong = sessions
        .filter((s) => (s.date || "").slice(0, 10) === key)
        .reduce((a, s) => a + ((s.total || 0) - (s.correct || 0)), 0);
      days.push({
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        count: wrong,
      });
    }
    const maxCount = Math.max(1, ...days.map((d) => d.count));
    days.forEach((d) => {
      d.isMax = d.count >= maxCount && d.count > 0;
      d.pct = Math.round((d.count / maxCount) * 100);
    });

    // Top10 错词榜
    const top = wrongList
      .slice()
      .sort((a, b) => (b.wrongCount || 0) - (a.wrongCount || 0))
      .slice(0, 10);

    this.setData({
      pending: wrongList.length,
      totalWrong: wrongList.reduce((a, w) => a + (w.wrongCount || 0), 0),
      recentRate,
      days,
      top,
      empty: !wrongList.length,
    });
  },

  goReview() {
    wx.navigateTo({ url: "/pages/english-dictation/english-dictation?mode=review" });
  },
});

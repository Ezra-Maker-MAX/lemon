/* 复习卷页（D5）：错题本一键生成的复习卷确认页
   展示待复习错词 + 数量微调 → 开始 → 复用报默页（mode=review） */
const store = require("../../utils/store");

Page({
  data: {
    words: [], // [{word, pinyin}]
    count: 10,
    maxCount: 10,
    poolSize: 0,
  },

  onLoad(options) {
    store.initDefaults();
    const pool = store
      .getWrongBook()
      .slice()
      .sort((a, b) => (b.wrongCount || 0) - (a.wrongCount || 0));
    const count = Math.min(Number(options.count) || 10, Math.max(1, pool.length));
    this.setData({
      poolSize: pool.length,
      maxCount: Math.max(1, pool.length),
      count,
      words: pool.slice(0, count).map((w) => ({ word: w.word, pinyin: w.pinyin })),
    });
  },

  refreshPreview(count) {
    const pool = store
      .getWrongBook()
      .slice()
      .sort((a, b) => (b.wrongCount || 0) - (a.wrongCount || 0));
    this.setData({
      count,
      words: pool.slice(0, count).map((w) => ({ word: w.word, pinyin: w.pinyin })),
    });
  },

  incCount() {
    this.refreshPreview(Math.min(this.data.count + 1, this.data.maxCount));
  },
  decCount() {
    this.refreshPreview(Math.max(1, this.data.count - 1));
  },

  onStart() {
    wx.redirectTo({
      url: `/pages/dictation/dictation?mode=review&count=${this.data.count}`,
    });
  },
});

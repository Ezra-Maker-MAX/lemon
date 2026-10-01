/* 柠檬单词（英语模块）
   人教版 PEP 三上/三下/四上：册切换 + 四线三格浏览 + 听音拼写报默 + 错词复习
   英语 TTS 固定用美音音色（403006 云小朵系/YunMia），与语文音色互不影响 */
const enVocab = require("../../data/vocab/english/index");
const tts = require("../../utils/tts");

const EN_VOICE = 101016; // 智甜·女童声（基础音色；大模型音色资源包已耗尽，见 2026-10-01 日志）

Page({
  data: {
    books: [], // [{key, grade, term, label}]
    bookKey: "3-1",
    bookLabel: "三上",
    units: [],
    unit: 1,
    unitTitle: "",
    words: [], // 当前单元词卡
    wrongCount: 0, // 英语错词池数量
  },

  onLoad() {
    this.setData({ books: enVocab.listBooks() });
  },

  onShow() {
    this.loadBook(this.data.bookKey);
  },

  loadBook(key) {
    const book = enVocab.getBook(
      Number(String(key).split("-")[0]),
      Number(String(key).split("-")[1])
    );
    const units = book.db.units.map((u) => ({ unit: u.unit, title: u.title }));
    this.bookDb = book.db;
    this.setData({
      bookKey: `${book.grade}-${book.term}`,
      bookLabel: book.label,
      units,
    });
    this.loadUnit(1);
    this.setData({
      wrongCount: (wx.getStorageSync("wrong_book_en") || []).length,
    });
  },

  onPickBook(e) {
    this.loadBook(e.currentTarget.dataset.key);
  },

  loadUnit(unit) {
    const u = this.bookDb.units.find((x) => x.unit === unit) || this.bookDb.units[0];
    this.setData({
      unit: u.unit,
      unitTitle: u.title,
      words: u.words,
    });
  },

  onPickUnit(e) {
    this.loadUnit(Number(e.currentTarget.dataset.unit));
  },

  /* 单词试听 */
  onSpeak(e) {
    const en = e.currentTarget.dataset.en;
    tts.speak(en, {
      voiceType: EN_VOICE,
      rate: -0.2,
      onError: () =>
        wx.showToast({ title: "发音失败，请检查网络", icon: "none" }),
    });
  },

  goDictation() {
    const { grade, term } = enVocab.getBook(
      Number(this.data.bookKey.split("-")[0]),
      Number(this.data.bookKey.split("-")[1])
    );
    wx.navigateTo({
      url: `/pages/english-dictation/english-dictation?grade=${grade}&term=${term}&unit=${this.data.unit}`,
    });
  },

  goStats() {
    wx.navigateTo({ url: "/pages/en-stats/en-stats" });
  },

  goWrongReview() {
    if (!this.data.wrongCount) {
      wx.showToast({ title: "错词池是空的，先来一轮报默吧", icon: "none" });
      return;
    }
    wx.navigateTo({
      url: `/pages/english-dictation/english-dictation?mode=review`,
    });
  },
});

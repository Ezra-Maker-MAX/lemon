/* 英语听音拼写报默
   流程：🔊 听发音 → 看中文提示 → 孩子拼写 → 揭示四线三格拼写 → 自判
   错词独立收录 wrong_book_en（与语文错题本分开）；整轮记 session(mode=english)
   入口：① 指定单元 ?grade=3&term=1&unit=2  ② 错词复习 ?mode=review（错词池随机 10 词） */
const enVocab = require("../../data/vocab/english/index");
const store = require("../../utils/store");
const tts = require("../../utils/tts");

const EN_VOICE = 101016; // 智甜·女童声（基础音色）

Page({
  data: {
    phase: "running", // running | done
    unitTitle: "",
    words: [],
    index: 0,
    currentIndex: 0,
    current: null, // {en, zh}
    revealed: false,
    speaking: false,

    result: null,
  },

  onLoad(options) {
    store.initDefaults();
    if (options.mode === "review") {
      const pool = wx.getStorageSync("wrong_book_en") || [];
      const picked = pool
        .slice()
        .sort(() => Math.random() - 0.5)
        .slice(0, 10)
        .map((x) => ({ en: x.en, zh: x.zh, status: "pending" }));
      this.unitData = { unit: 0 };
      this.isReview = true;
      this.setData({
        unitTitle: "错词复习",
        words: picked,
      });
      return;
    }
    const book = enVocab.getBook(Number(options.grade) || 3, Number(options.term) || 1);
    const u = book.db.units.find((x) => x.unit === Number(options.unit)) || book.db.units[0];
    this.unitData = u;
    this.setData({
      unitTitle: u.title,
      words: u.words.map((w) => ({ ...w, status: "pending" })),
    });
  },

  onShow() {
    // onShow 会与 onLoad 首次进入重复触发，onReady 后再读
  },

  onReady() {
    this.speakCurrent();
  },

  speakCurrent() {
    const w = this.data.words[this.data.index];
    if (!w || this.data.phase !== "running") return;
    this.setData({ current: w, revealed: false, speaking: true });
    tts.speak(w.en, {
      voiceType: EN_VOICE,
      rate: -0.2,
      onDone: () => this.setData({ speaking: false }),
      onError: () => {
        this.setData({ speaking: false });
        wx.showToast({ title: "发音失败，可点「再听一次」重试", icon: "none" });
      },
    });
  },

  onRepeat() {
    if (this.data.phase === "running") this.speakCurrent();
  },

  onReveal() {
    this.setData({ revealed: true });
  },

  mark(e) {
    if (!this.data.revealed) return;
    const ok = e.currentTarget.dataset.ok === "1";
    const i = this.data.index;
    const w = this.data.words[i];
    this.recordWrong(w, ok);

    const words = this.data.words.slice();
    words[i] = { ...w, status: ok ? "ok" : "wrong" };
    const next = i + 1;
    if (next >= words.length) {
      this.finish(words);
      return;
    }
    this.setData({ words, index: next, currentIndex: next });
    this.speakCurrent();
  },

  /* 英语错词本：独立 storage，最多记 100 条 */
  recordWrong(w, ok) {
    const list = wx.getStorageSync("wrong_book_en") || [];
    let item = list.find((x) => x.en === w.en);
    if (!item) {
      if (ok) return;
      item = { en: w.en, zh: w.zh, wrongCount: 0 };
      list.push(item);
    }
    if (ok) item.okStreak = (item.okStreak || 0) + 1;
    else {
      item.wrongCount = (item.wrongCount || 0) + 1;
      item.okStreak = 0;
    }
    const kept = list.filter((x) => !(x.okStreak >= 3)).slice(-100);
    wx.setStorageSync("wrong_book_en", kept);
  },

  finish(words) {
    tts.stop();
    const total = words.length;
    const wrongList = words.filter((w) => w.status === "wrong");
    const correct = total - wrongList.length;
    store.addSession({
      unit: this.unitData.unit,
      listType: "english",
      mode: "english",
      total,
      correct,
      words: words.map((w) => ({ word: w.en, status: w.status })),
    });
    this.setData({
      phase: "done",
      words,
      currentIndex: -1,
      result: { total, correct, wrongList, pct: total ? Math.round((correct / total) * 100) : 0 },
    });
  },

  onRetryWrong() {
    const wrongList = (this.data.result || {}).wrongList || [];
    if (!wrongList.length) return;
    this.setData({
      phase: "running",
      words: wrongList.map((w) => ({ ...w, status: "pending" })),
      index: 0,
      currentIndex: 0,
      result: null,
    });
    this.speakCurrent();
  },

  onBack() {
    wx.navigateBack({ fail: () => wx.reLaunch({ url: "/pages/english/english" }) });
  },

  onUnload() {
    tts.stop();
  },
});

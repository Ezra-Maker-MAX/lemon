/* 看拼音写词语（官方站「填空写字」题型的复刻）
   链路：选单元/表 → 显示拼音 → 孩子口答或手写 → 显示答案 → 标对/错
   判错进错题本（与报默共用），整轮记 session(mode=pinyin) */
const vocab = require("../../data/vocab/index");
const store = require("../../utils/store");
const tts = require("../../utils/tts");

const LIST_NAME = { xiezi: "写字表", ciyu: "词语表", shizi: "识字表" };

Page({
  data: {
    phase: "pick", // pick | running | done
    units: [],
    unit: 1,
    unitTitle: "",
    listType: "xiezi",
    listName: "",
    count: 8,

    words: [],
    index: 0,
    currentIndex: 0,
    current: null, // {word, pinyin}
    revealed: false,
    boxes: [], // 田字格占位数组

    result: null,
  },

  onLoad() {
    store.initDefaults();
    const units = vocab.getUnits(3, 1);
    this.setData({
      units,
      unitTitle: (units.find((u) => u.unit === 1) || {}).title || "",
    });
  },

  onPickUnit(e) {
    const unit = Number(e.currentTarget.dataset.unit);
    const units = this.data.units;
    this.setData({
      unit,
      unitTitle: (units.find((u) => u.unit === unit) || {}).title || "",
    });
  },

  onPickList(e) {
    this.setData({ listType: e.currentTarget.dataset.list });
  },

  onCountMinus() {
    this.setData({ count: Math.max(3, this.data.count - 1) });
  },
  onCountPlus() {
    this.setData({ count: Math.min(15, this.data.count + 1) });
  },

  onStart() {
    const { unit, listType, count } = this.data;
    const words = vocab.buildWordList(3, 1, unit, listType, count, "seq");
    if (!words.length) {
      wx.showToast({ title: "该词表为空", icon: "none" });
      return;
    }
    this.setData({
      phase: "running",
      listName: LIST_NAME[listType] || listType,
      words: words.map((w) => ({ ...w, status: "pending" })),
      index: 0,
      currentIndex: 0,
      result: null,
    });
    this.showWord();
  },

  showWord() {
    const w = this.data.words[this.data.index];
    this.setData({
      current: w,
      revealed: false,
      boxes: new Array(w.word.length).fill(0),
    });
  },

  onReveal() {
    this.setData({ revealed: true });
    const s = store.getSettings();
    tts.speak(this.data.current.word, {
      rate: s.speechRate || 0,
      voiceType: s.voiceType || 101001,
      onError: () => {},
    });
  },

  mark(e) {
    if (!this.data.revealed) return; // 先看答案再判
    const ok = e.currentTarget.dataset.ok === "1";
    const i = this.data.index;
    const w = this.data.words[i];
    store.updateWrongBook(w.word, w.pinyin, ok);

    const words = this.data.words.slice();
    words[i] = { ...w, status: ok ? "ok" : "wrong" };
    const next = i + 1;
    if (next >= words.length) {
      this.finish(words);
      return;
    }
    this.setData({ words, index: next, currentIndex: next });
    this.showWord();
  },

  finish(words) {
    const total = words.length;
    const wrongList = words.filter((w) => w.status === "wrong");
    const correct = total - wrongList.length;
    store.addSession({
      unit: this.data.unit,
      listType: this.data.listType,
      mode: "pinyin",
      total,
      correct,
      words: words.map((w) => ({ word: w.word, status: w.status })),
    });
    this.setData({
      phase: "done",
      words,
      currentIndex: -1,
      result: { total, correct, wrongList, pct: total ? Math.round((correct / total) * 100) : 0 },
    });
  },

  onRestart() {
    this.setData({ phase: "pick", current: null, result: null });
  },
});

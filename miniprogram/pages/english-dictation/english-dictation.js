/* 英语听音拼写报默
   流程：🔊 听发音 → 看中文提示 → 孩子拼写 → 揭示四线三格拼写 → 自判
   错词独立收录 wrong_book_en（与语文错题本分开）；整轮记 session(mode=english)
   入口：① 指定单元 ?grade=3&term=1&unit=2  ② 错词复习 ?mode=review（错词池随机 10 词） */
const enVocab = require("../../data/vocab/english/index");
const store = require("../../utils/store");
const tts = require("../../utils/tts");
const ocrUtil = require("../../utils/ocr");

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
    revealCells: [], // 揭示拼写：逐字母格子 [{ch}]
    speaking: false,

    result: null,

    hwJudge: null, // 手写判分 {judge: ok|wrong, ocr, dist}
    hwLoading: false,
    explain: null, // 词典释义 {loading, phonetic, meanings, example, error}
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
    this.revealCounted = false; // 新词重置：本词是否已因"看答案"记过错
    this.setData({
      current: w,
      revealed: false,
      revealCells: [],
      speaking: true,
    });
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

  /* 看答案 = 不会这个词：直接记入错词本（本词不再重复计数） */
  onReveal() {
    if (this.data.revealed) return;
    const w = this.data.words[this.data.index];
    if (!w) return;
    this.revealCounted = true;
    this.recordWrong(w, false);
    this.setData({
      revealed: true,
      revealCells: w.en.split("").map((ch) => ({ ch })),
    });
    wx.showToast({ title: "已记入错词本，照着四线格写", icon: "none" });
  },

  mark(e) {
    if (!this.data.revealed) return;
    const ok = e.currentTarget.dataset.ok === "1";
    const i = this.data.index;
    const w = this.data.words[i];
    if (!this.revealCounted) this.recordWrong(w, ok); // 看过答案的词已在 onReveal 记过

    const words = this.data.words.slice();
    words[i] = { ...w, status: ok ? "ok" : "wrong" };
    const next = i + 1;
    this.setData({ words, hwJudge: null, explain: null });
    const hw = this.selectComponent("#hw");
    if (hw) hw.clear();
    if (next >= words.length) {
      this.finish(words);
      return;
    }
    this.setData({ index: next, currentIndex: next });
    this.speakCurrent();
  },

  /* ---------- 手写判分（M2.2）：四线三格手写英文 → OCR 滑窗比对 ---------- */
  onHwClear() {
    const hw = this.selectComponent("#hw");
    if (hw) hw.clear();
    this.setData({ hwJudge: null });
  },

  onHwSubmit() {
    if (this.data.hwLoading) return;
    const w = this.data.words[this.data.index];
    const hw = this.selectComponent("#hw");
    if (!w || !hw) return;
    if (hw.isEmpty()) {
      wx.showToast({ title: "先在四线格里拼写，再提交", icon: "none" });
      return;
    }
    this.setData({ hwLoading: true });
    hw
      .exportImage()
      .then((path) => {
        const fsm = wx.getFileSystemManager();
        fsm.readFile({
          filePath: path,
          encoding: "base64",
          success: (res) =>
            ocrUtil.ocrBase64(res.data).then((out) => {
              this.setData({ hwLoading: false });
              if (!out.ok) {
                wx.showToast({ title: "识别失败，可手动判定", icon: "none" });
                return;
              }
              const r = ocrUtil.judgeWord(w.en, out.lines, "en");
              if (r.judge === "skip") {
                wx.showToast({ title: "没认出来，重写或手动判", icon: "none" });
                return;
              }
              this.setData({ hwJudge: r });
            }),
          fail: () => {
            this.setData({ hwLoading: false });
            wx.showToast({ title: "读取手写失败", icon: "none" });
          },
        });
      })
      .catch(() => {
        this.setData({ hwLoading: false });
        wx.showToast({ title: "导出手写失败", icon: "none" });
      });
  },

  onHwToggle() {
    const hwJudge = this.data.hwJudge;
    if (!hwJudge) return;
    this.setData({ hwJudge: { ...hwJudge, judge: hwJudge.judge === "ok" ? "wrong" : "ok" } });
  },

  onHwNext() {
    const hwJudge = this.data.hwJudge;
    if (!hwJudge) return;
    this.setData({ revealed: true });
    this.mark({ currentTarget: { dataset: { ok: hwJudge.judge === "ok" ? "1" : "0" } } });
  },

  /* ---------- 词释义（M2.2）：词库中文释义立即兜底 + LLM 联网增强 ---------- */
  onExplain() {
    const w = this.data.words[this.data.index];
    if (!w) return;

    // 第一层：词库自带中文释义（本地、零依赖）
    if (this.data.explain && this.data.explain.level === 2) {
      this.setData({ explain: null }); // 已是联网详解，再点收起
      return;
    }
    if (this.data.explain && this.data.explain.enhancing) return; // 已在增强中
    const local = {
      phonetic: "",
      meanings: [w.zh || "暂无释义"],
      example: "",
    };
    if (this.data.explain) {
      // 已展示本地层 → 第二层：LLM 增强
      this.setData({ explain: { ...local, loading: true } });
      wx.cloud
        .callFunction({ name: "ai", data: { action: "explain", lang: "en", word: w.en } })
        .then((r) => {
          const out = r && r.result;
          if (out && out.code === "OK" && out.data && !out.data.error) {
            this.setData({ explain: { loading: false, ...out.data, level: 2 } });
          } else {
            this.setData({
              explain: {
                ...local,
                error: (out && out.message) || "联网增强释义不可用，已显示课本释义",
                level: 1,
              },
            });
          }
        })
        .catch(() =>
          this.setData({ explain: { ...local, error: "网络异常，已显示课本释义", level: 1 } })
        );
      return;
    }
    this.setData({ explain: { ...local, level: 1 } });
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

  /* ---------- 自动化调试入口（自检脚本调用，不影响正常流程） ---------- */
  onMockHw(lines) {
    const w = this.data.words[this.data.index];
    if (!w) return;
    const r = ocrUtil.judgeWord(w.en, lines || [], "en");
    if (r.judge !== "skip") this.setData({ hwJudge: r });
  },
});

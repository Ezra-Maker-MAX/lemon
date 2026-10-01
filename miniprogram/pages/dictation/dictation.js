/* 语音报默页（D3 全量）
   三态：ready（词表确认 + 断点续默卡）→ running（TTS 报词 + 标对错）→ done（结果 + 错词重练）
   节奏：进入新词立即朗读；intervalSec 内未判分则重读一遍（repeatCount 控制一次读几遍）
   断点：每判一词即存 progress；离开页面不清，ready 页提供"继续上次" */
const vocab = require("../../data/vocab/index");
const store = require("../../utils/store");
const tts = require("../../utils/tts");
const ocrUtil = require("../../utils/ocr");

const LIST_NAME = { xiezi: "写字表", ciyu: "词语表", shizi: "识字表" };

Page({
  data: {
    phase: "ready", // ready | running | done
    paused: false,

    words: [], // [{word, pinyin, status: pending|ok|wrong}]
    index: 0,
    currentIndex: 0, // 供 WXML 进度条比对（wx:for 的 index 会遮蔽 data.index）
    current: null, // {word, pinyin} 当前词（报默中不显示 word 本字）
    speaking: false,
    ttsOk: true, // 插件故障时转手动报词兜底

    term: 1,
    unit: 1,
    listType: "xiezi",
    listName: "",
    unitTitle: "",

    preview: [],
    resume: null, // 断点 {words,index,unitTitle,listName,...}
    resumeText: "",
    result: null, // {total, correct, wrongList}

    hwJudge: null, // 手写判分结果 {judge: ok|wrong, ocr, dist}
    hwLoading: false,
    explain: null, // 词解读 {loading, meaning, sentence, near, error}
  },

  onLoad(options) {
    store.initDefaults();
    this.settings = store.getSettings();

    const mode = options.mode === "review" ? "review" : "voice";
    const term = Number(options.term) || 1;
    const unit = Number(options.unit) || 1;
    const listType = options.listType || "xiezi";
    const count = Number(options.count) || 10;
    const order = options.order === "random" ? "random" : "seq";
    this.sessionMeta = { mode, term, unit, listType, count, order, lid: options.lid || "" };

    let words;
    let unitTitle = "";
    let listName;
    if (options.src === "custom") {
      /* 自定义词单：src=custom&lid=xxx */
      const l = store.getCustomList(options.lid);
      if (!l || !l.words.length) {
        wx.showToast({ title: "词单不存在", icon: "none" });
        setTimeout(() => wx.navigateBack(), 1200);
        return;
      }
      words = l.words.slice(0, 20);
      unitTitle = l.name;
      listName = "自定义词单";
    } else if (mode === "review") {
      /* 复习卷：错题本未毕业错词，错得多的优先 */
      const pool = store
        .getWrongBook()
        .sort((a, b) => (b.wrongCount || 0) - (a.wrongCount || 0));
      words = pool.slice(0, count).map((w) => ({ word: w.word, pinyin: w.pinyin }));
      listName = "复习卷";
      unitTitle = "错题复习";
    } else {
      words = vocab.buildWordList(3, term, unit, listType, count, order);
      const units = vocab.getUnits(3, term);
      unitTitle = (units.find((u) => u.unit === unit) || {}).title || "";
      listName = LIST_NAME[listType] || listType;
    }
    if (!words.length) {
      wx.showToast({ title: "词表为空，请回词库选择", icon: "none" });
      setTimeout(() => wx.navigateBack(), 1200);
      return;
    }

    this.setData({
      term,
      unit,
      listType,
      unitTitle,
      listName,
      words: words.map((w) => ({ ...w, status: "pending" })),
      preview: words.slice(0, 10),
    });
    this.loadResumeCard();
  },

  /* ---------- ready ---------- */
  loadResumeCard() {
    const p = store.getProgress();
    if (p && p.words && p.index > 0 && p.index < p.words.length) {
      this.setData({
        resume: p,
        resumeText: `${p.unitTitle || ""} ${p.listName || ""} ${p.index}/${p.words.length}`,
      });
    }
  },

  onResume() {
    const p = this.data.resume;
    if (!p) return;
    this.setData({
      phase: "running",
      paused: false,
      words: p.words,
      index: p.index,
      currentIndex: p.index,
      term: p.term,
      unit: p.unit,
      listType: p.listType,
      listName: p.listName,
      unitTitle: p.unitTitle,
      resume: null,
    });
    this.enterRunning();
  },

  onDiscardResume() {
    store.clearProgress();
    this.setData({ resume: null, resumeText: "" });
  },

  onStart() {
    this.setData({ phase: "running", paused: false });
    this.enterRunning();
  },

  /* ---------- running ---------- */
  enterRunning() {
    this.saveProgress();
    this.setData({ showPinyin: !!this.settings.showPinyin });
    this.speakCurrent();
    this.startTimer();
  },

  utterText(w) {
    const n = Math.max(1, this.settings.repeatCount || 1);
    return new Array(n).fill(w.word).join("，");
  },

  speakCurrent() {
    const w = this.data.words[this.data.index];
    if (!w || this.data.phase !== "running" || this.data.paused) return;
    this.setData({
      current: { word: w.word, pinyin: w.pinyin },
      speaking: true,
    });
    tts.speak(this.utterText(w), {
      rate: this.settings.speechRate || 0,
      voiceType: this.settings.voiceType || 101001,
      onDone: () => this.setData({ speaking: false }),
      onError: () => this.setData({ speaking: false, ttsOk: false }),
    });
  },

  startTimer() {
    this.stopTimer();
    const sec = Math.max(5, Number(this.settings.intervalSec) || 15);
    this.timer = setInterval(() => this.speakCurrent(), sec * 1000);
  },

  stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  },

  onRepeat() {
    if (this.data.phase !== "running" || this.data.paused) return;
    this.speakCurrent();
  },

  onPauseToggle() {
    if (this.data.paused) {
      this.setData({ paused: false });
      this.speakCurrent();
      this.startTimer();
    } else {
      this.stopTimer();
      tts.stop();
      this.setData({ paused: true, speaking: false });
    }
  },

  mark(e) {
    if (this.data.phase !== "running" || this.data.paused) return;
    const ok = e.currentTarget.dataset.ok === "1";
    const i = this.data.index;
    const w = this.data.words[i];
    if (!w) return;

    const words = this.data.words.slice();
    words[i] = { ...w, status: ok ? "ok" : "wrong" };
    store.updateWrongBook(w.word, w.pinyin, ok);

    const next = i + 1;
    this.setData({ words, hwJudge: null, explain: null });
    const hw = this.selectComponent("#hw");
    if (hw) hw.clear();

    if (next >= words.length) {
      this.finish(words);
      return;
    }
    this.setData({ index: next, currentIndex: next });
    this.saveProgress();
    this.speakCurrent(); // 换词即读
    this.startTimer(); // 重置重读计时
  },

  /* ---------- 手写判分（M2.2） ---------- */
  onHwClear() {
    const hw = this.selectComponent("#hw");
    if (hw) hw.clear();
    this.setData({ hwJudge: null });
  },

  onHwSubmit() {
    if (this.data.hwLoading || this.data.paused) return;
    const w = this.data.words[this.data.index];
    const hw = this.selectComponent("#hw");
    if (!w || !hw) return;
    if (hw.isEmpty()) {
      wx.showToast({ title: "先在格子里默写，再提交", icon: "none" });
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
                wx.showToast({ title: "识别失败，可手动标对错", icon: "none" });
                return;
              }
              const r = ocrUtil.judgeWord(w.word, out.lines, "zh");
              if (r.judge === "skip") {
                wx.showToast({ title: "没认出来，重写或手动标", icon: "none" });
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
    this.mark({ currentTarget: { dataset: { ok: hwJudge.judge === "ok" ? "1" : "0" } } });
  },

  /* ---------- 词解读（M2.2） ---------- */
  onExplain() {
    const w = this.data.words[this.data.index];
    if (!w) return;
    if (this.data.explain && !this.data.explain.error) return; // 已加载
    this.setData({ explain: { loading: true } });
    wx.cloud
      .callFunction({
        name: "ai",
        data: { action: "explain", lang: "zh", word: w.word },
      })
      .then((r) => {
        const out = r && r.result;
        if (out && out.code === "OK") {
          this.setData({ explain: { loading: false, ...out.data } });
        } else {
          this.setData({
            explain: { loading: false, error: (out && out.message) || "解读服务暂不可用" },
          });
        }
      })
      .catch(() =>
        this.setData({ explain: { loading: false, error: "网络异常，稍后再试" } })
      );
  },

  saveProgress() {
    const d = this.data;
    store.saveProgress({
      term: d.term,
      unit: d.unit,
      listType: d.listType,
      listName: d.listName,
      unitTitle: d.unitTitle,
      words: d.words,
      index: d.index,
    });
  },

  /* ---------- done ---------- */
  finish(words) {
    this.stopTimer();
    tts.stop();
    store.clearProgress();
    const total = words.length;
    const wrongList = words.filter((w) => w.status === "wrong");
    const correct = total - wrongList.length;
    store.addSession({
      unit: this.data.unit,
      listType: this.data.listType,
      mode: (this.sessionMeta && this.sessionMeta.mode) || "voice",
      total,
      correct,
      words: words.map((w) => ({ word: w.word, status: w.status })),
    });
    this.setData({
      phase: "done",
      paused: false,
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
      paused: false,
      words: wrongList.map((w) => ({ ...w, status: "pending" })),
      index: 0,
      currentIndex: 0,
      result: null,
    });
    this.enterRunning();
  },

  onRestart() {
    let words;
    if (this.sessionMeta && this.sessionMeta.listType === "custom") {
      const l = store.getCustomList(this.sessionMeta.lid);
      words = l ? l.words.slice(0, 20) : [];
    } else if (this.sessionMeta && this.sessionMeta.mode === "review") {
      words = store
        .getWrongBook()
        .sort((a, b) => (b.wrongCount || 0) - (a.wrongCount || 0))
        .slice(0, this.sessionMeta.count)
        .map((w) => ({ word: w.word, pinyin: w.pinyin }));
    } else {
      const m = this.sessionMeta;
      words = vocab.buildWordList(3, m.term, m.unit, m.listType, m.count, m.order);
    }
    if (!words.length) return;
    this.setData({
      phase: "running",
      paused: false,
      words: words.map((w) => ({ ...w, status: "pending" })),
      index: 0,
      currentIndex: 0,
      result: null,
    });
    this.enterRunning();
  },

  onBack() {
    const back = () =>
      wx.navigateBack({ fail: () => wx.reLaunch({ url: "/pages/vocab/vocab" }) });
    back();
  },

  /* ---------- 自动化调试入口（自检脚本调用，不影响正常流程） ---------- */
  onMockHw(lines) {
    const w = this.data.words[this.data.index];
    if (!w) return;
    const r = ocrUtil.judgeWord(w.word, lines || [], "zh");
    if (r.judge !== "skip") this.setData({ hwJudge: r });
  },

  onUnload() {
    this.stopTimer();
    tts.stop();
  },

  onHide() {
    // 离开页面暂停节奏；progress 已逐词落盘，回来可续默
    this.stopTimer();
    tts.stop();
    this.setData({ paused: true, speaking: false });
  },
});

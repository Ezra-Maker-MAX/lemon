/* 拍照批改页（D4）
   流程：选词（带参进入）→ 拍照/选图 → 云函数 OCR 识别手写词
        → 与目标词逐词比对（编辑距离预判）→ 逐词确认（可改判）→ 入库
   兜底：OCR 不可用（云环境未开/无密钥）时直接进入手动逐词判，流程不阻塞 */
const vocab = require("../../data/vocab/index");
const store = require("../../utils/store");

const LIST_NAME = { xiezi: "写字表", ciyu: "词语表", shizi: "识字表" };

/* 编辑距离（短字符串，O(nm) 足够） */
function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array(n + 1);
  let cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

Page({
  data: {
    phase: "pick", // pick → shooting(识别中) → confirm → done
    term: 1,
    unit: 1,
    listType: "xiezi",
    listName: "",
    unitTitle: "",
    words: [], // [{word, pinyin, status: ok|wrong}] 目标词
    items: [], // [{word, pinyin, ocr, dist, judge: ok|wrong|skip, auto}] 确认列表
    imgPath: "",
    ocrState: "", // "" | loading | ok | fail
    ocrMsg: "",
    result: null,
  },

  onLoad(options) {
    store.initDefaults();
    const term = Number(options.term) || 1;
    const unit = Number(options.unit) || 1;
    const listType = options.listType || "xiezi";
    const count = Number(options.count) || 10;
    const order = options.order === "random" ? "random" : "seq";

    const words = vocab.buildWordList(3, term, unit, listType, count, order);
    if (!words.length) {
      wx.showToast({ title: "词表为空，请回词库选择", icon: "none" });
      setTimeout(() => wx.navigateBack(), 1200);
      return;
    }
    const units = vocab.getUnits(3, term);
    const unitTitle = (units.find((u) => u.unit === unit) || {}).title || "";
    this.setData({
      term,
      unit,
      listType,
      unitTitle,
      listName: LIST_NAME[listType] || listType,
      words: words.map((w) => ({ ...w, status: "pending" })),
      preview: words.slice(0, 10),
    });
  },

  /* ---------- 拍照 → OCR ---------- */
  onTake() {
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["camera", "album"],
      sizeType: ["compressed"],
      success: (res) => {
        const imgPath = res.tempFiles[0].tempFilePath;
        this.setData({ imgPath, phase: "shooting", ocrState: "loading" });
        this.runOcr(imgPath);
      },
    });
  },

  runOcr(imgPath) {
    const fsm = wx.getFileSystemManager();
    fsm.readFile({
      filePath: imgPath,
      encoding: "base64",
      success: (res) => {
        wx.cloud
          .callFunction({
            name: "ai",
            data: { action: "ocr", imageBase64: res.data },
          })
          .then((r) => {
            const out = r && r.result;
            if (out && out.code === "OK") {
              this.setData({ ocrState: "ok" });
              this.matchWords(out.lines || []);
            } else {
              this.setData({
                ocrState: "fail",
                ocrMsg: (out && out.message) || "识别服务异常",
              });
              this.matchWords([]); // 手动模式
            }
          })
          .catch((e) => {
            this.setData({
              ocrState: "fail",
              ocrMsg: "云函数不可用（环境未开通?）",
            });
            this.matchWords([]); // 手动模式
          });
      },
      fail: () => {
        this.setData({ ocrState: "fail", ocrMsg: "读取图片失败" });
        this.matchWords([]);
      },
    });
  },

  /* ---------- 匹配预判 ---------- */
  matchWords(ocrLines) {
    const lines = ocrLines.map((s) => String(s).replace(/\s/g, ""));
    const items = this.data.words.map((w) => {
      let best = { dist: Infinity, ocr: "" };
      for (const line of lines) {
        if (line.includes(w.word)) {
          best = { dist: 0, ocr: line };
          break;
        }
        const d = editDistance(w.word, line);
        if (d < best.dist) best = { dist: d, ocr: line };
      }
      const threshold = w.word.length <= 2 ? 1 : 2;
      let judge;
      if (!lines.length) judge = "skip"; // 手动模式默认跳过
      else if (best.dist === 0) judge = "ok";
      else if (best.dist <= threshold) judge = "ok"; // 近似视作对，人工可改
      else judge = "wrong";
      return { word: w.word, pinyin: w.pinyin, ocr: best.ocr, dist: best.dist, judge, auto: judge };
    });
    this.setData({ items, phase: "confirm" });
  },

  /* 逐词改判：点按循环 ok → wrong → skip → ok */
  toggleJudge(e) {
    const i = e.currentTarget.dataset.index;
    const items = this.data.items.slice();
    const order = { ok: "wrong", wrong: "skip", skip: "ok" };
    items[i] = { ...items[i], judge: order[items[i].judge] };
    this.setData({ items });
  },

  /* ---------- 入库 ---------- */
  onSubmit() {
    const items = this.data.items;
    let correct = 0;
    const detail = [];
    for (const it of items) {
      if (it.judge === "skip") continue;
      const ok = it.judge === "ok";
      if (ok) correct += 1;
      store.updateWrongBook(it.word, it.pinyin, ok);
      detail.push({ word: it.word, status: ok ? "ok" : "wrong" });
    }
    const total = detail.length;
    store.addSession({
      unit: this.data.unit,
      listType: this.data.listType,
      mode: "photo",
      total,
      correct,
      words: detail,
    });
    const wrongList = items
      .filter((it) => it.judge === "wrong")
      .map((it) => ({ word: it.word, pinyin: it.pinyin }));
    this.setData({
      phase: "done",
      result: { total, correct, wrongList, pct: total ? Math.round((correct / total) * 100) : 0 },
    });
  },

  onRetryWrong() {
    const wrongList = (this.data.result || {}).wrongList || [];
    if (!wrongList.length) return;
    this.setData({
      phase: "confirm",
      words: wrongList.map((w) => ({ ...w, status: "pending" })),
      result: null,
    });
    this.matchWords([]); // 错词重练走手动确认
  },

  onBack() {
    wx.navigateBack({ fail: () => wx.reLaunch({ url: "/pages/vocab/vocab" }) });
  },

  /* ---------- 自动化调试入口（自检脚本调用，不影响正常流程） ---------- */
  onMockOcr(lines) {
    this.setData({ imgPath: "mock://handwriting", phase: "shooting", ocrState: "ok" });
    this.matchWords(lines || []);
  },
});

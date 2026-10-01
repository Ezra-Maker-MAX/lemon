/* 古诗填空：三年级上册 8 首（部编版）
   每首随机挖 2 个空，候选 3 字（正确 + 同诗其它字干扰）
   完成后展示全诗；自包含计分，不入错题本（字形非词表内容） */
const POEMS = require("../../data/extras/poems");
const config = require("../../config/config");

function rand(n) {
  return Math.floor(Math.random() * n);
}

function buildQuiz(poem) {
  // 每行去尾标点后的正文长度；随机挑 2 个不同行挖空
  const candidates = [];
  poem.lines.forEach((line, li) => {
    const body = line.replace(/[，。？！、；：]/g, "");
    for (let ci = 0; ci < body.length; ci++) candidates.push({ li, ci });
  });
  const picks = [];
  const pool = candidates.slice();
  while (picks.length < 2 && pool.length) {
    picks.push(pool.splice(rand(pool.length), 1)[0]);
  }
  const allChars = poem.lines.join("").replace(/[，。？！、；：]/g, "").split("");

  const blanks = picks.map((p) => {
    const answer = poem.lines[p.li][p.ci];
    const distract = allChars.filter((c) => c !== answer);
    const options = [answer];
    while (options.length < 3) {
      const c = distract[rand(distract.length)];
      if (!options.includes(c)) options.push(c);
    }
    for (let i = options.length - 1; i > 0; i--) {
      const j = rand(i + 1);
      [options[i], options[j]] = [options[j], options[i]];
    }
    return { ...p, char: answer, options, picked: "", ok: false, judged: false };
  });

  return { poem, blanks };
}

/* 生成渲染模型：把挖空状态烘进每一行 */
function renderLines(poem, blanks, curIdx) {
  return poem.lines.map((line, li) => ({
    chars: line.split("").map((ch, ci) => {
      const b = blanks.find((x) => x.li === li && x.ci === ci);
      if (!b) return { ch, cls: "" };
      if (blanks[curIdx] === b) return { ch: "▢", cls: "st-blank" };
      return { ch: b.char, cls: b.ok ? "st-ok" : "st-bad" };
    }),
  }));
}

Page({
  data: {
    phase: "list", // list | running | done
    poems: POEMS,
    title: "",
    author: "",
    linesView: [],
    blanks: [],
    cur: 0,
    correct: 0,
    result: null,
    poemImg: "", // done 阶段配图（dataURL）
    poemImgLoading: false,
  },

  onPickPoem(e) {
    const poem = POEMS[Number(e.currentTarget.dataset.idx)];
    const { blanks } = buildQuiz(poem);
    this.setData({
      phase: "running",
      title: poem.title,
      author: `${poem.dynasty} · ${poem.author}`,
      blanks,
      cur: 0,
      correct: 0,
      result: null,
      linesView: renderLines(poem, blanks, 0),
    });
  },

  onPick(e) {
    const b = this.data.blanks[this.data.cur];
    if (b.judged) return;
    const pick = e.currentTarget.dataset.ch;
    b.picked = pick;
    b.ok = pick === b.char;
    b.judged = true;
    const poem = POEMS.find((p) => p.title === this.data.title);
    this.setData({
      blanks: this.data.blanks,
      correct: this.data.correct + (b.ok ? 1 : 0),
      linesView: renderLines(poem, this.data.blanks, this.data.cur),
    });
  },

  onNext() {
    const next = this.data.cur + 1;
    const poem = POEMS.find((p) => p.title === this.data.title);
    if (next >= this.data.blanks.length) {
      this.setData({
        phase: "done",
        linesView: renderLines(poem, this.data.blanks, -1),
        result: { total: this.data.blanks.length, correct: this.data.correct },
        poemImg: "",
        poemImgLoading: false,
      });
      this.ensurePoemImage();
      return;
    }
    this.setData({
      cur: next,
      linesView: renderLines(poem, this.data.blanks, next),
    });
  },

  /* ---------- 古诗配图（端直连 Agnes 图像模型；URL 缓存 7 天）
     真机需在 mp 后台加 request 域名 apihub.agnes-ai.com + downloadFile 域名 platform-outputs.agnes-ai.space
     （云函数出口对 Agnes 图像接口不可达，已实测弃走云函数） ---------- */
  ensurePoemImage() {
    const title = this.data.title;
    let cached = null;
    try {
      cached = wx.getStorageSync("poemimg:" + title) || null;
    } catch (e) { /* 忽略 */ }
    if (cached && cached.url && Date.now() - cached.ts < 7 * 86400e3) {
      this.setData({ poemImg: cached.url });
      return;
    }
    this.fetchPoemImage();
  },

  fetchPoemImage() {
    if (this.data.poemImgLoading) return;
    const poem = POEMS.find((p) => p.title === this.data.title);
    if (!poem) return;
    this.setData({ poemImgLoading: true });
    wx.request({
      url: config.agnes.baseUrl + "/images/generations",
      method: "POST",
      timeout: 60000,
      header: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + config.agnes.apiKey,
      },
      data: {
        model: config.agnes.imageModel,
        prompt:
          `儿童绘本水彩插画，表现中国古诗《${poem.title}》的意境：${poem.lines.join("，")}。` +
          `明亮温暖的柠檬黄与青绿色调，简洁留白，适合小学生，画面中不要出现任何文字`,
        n: 1,
        size: "512x512",
      },
      success: (r) => {
        const url =
          r.statusCode === 200 && r.data && r.data.data && r.data.data[0]
            ? r.data.data[0].url
            : "";
        if (url) {
          try {
            wx.setStorageSync("poemimg:" + poem.title, { url, ts: Date.now() });
          } catch (e) { /* 缓存失败不影响展示 */ }
          this.setData({ poemImg: url, poemImgLoading: false });
        } else {
          this.setData({ poemImgLoading: false });
          wx.showToast({ title: "生成失败，稍后再试", icon: "none" });
        }
      },
      fail: () => {
        this.setData({ poemImgLoading: false });
        wx.showToast({ title: "网络异常，稍后再试", icon: "none" });
      },
    });
  },

  /* 配图保存到相册（downloadFile → 相册，需 platform-outputs.agnes-ai.space 白名单） */
  onSaveImg() {
    const url = this.data.poemImg;
    if (!url) return;
    wx.showLoading({ title: "保存中…" });
    wx.downloadFile({
      url,
      success: (r) => {
        wx.hideLoading();
        if (r.statusCode !== 200) {
          wx.showToast({ title: "下载失败", icon: "none" });
          return;
        }
        wx.saveImageToPhotosAlbum({
          filePath: r.tempFilePath,
          success: () => wx.showToast({ title: "已存到相册", icon: "success" }),
          fail: (e) => {
            if (e.errMsg && e.errMsg.includes("auth")) {
              wx.showToast({ title: "请在设置中允许保存到相册", icon: "none" });
            }
          },
        });
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: "下载失败，检查网络", icon: "none" });
      },
    });
  },

  onBackList() {
    this.setData({ phase: "list", blanks: [], result: null, poemImg: "", poemImgLoading: false });
  },
});

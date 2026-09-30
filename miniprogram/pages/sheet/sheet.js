/* 练习单：官方站「一键出卷」的复刻（屏显版）
   选单元/词表 → 生成 A4 版式练习单：拼音在上、田字格在下
   家长截图即可打印；不涉及导出权限 */
const vocab = require("../../data/vocab/index");
const store = require("../../utils/store");

const LIST_NAME = { xiezi: "写字表", ciyu: "词语表", shizi: "识字表" };
const MAX_WORDS = 16;

Page({
  data: {
    phase: "pick", // pick | sheet
    units: [],
    unit: 1,
    unitTitle: "",
    listType: "xiezi",
    listName: "",

    rows: [], // [{pinyin, cells:[{ch, empty}]}]
    total: 0,
  },

  onLoad(options) {
    this.isCustom = options.src === "custom";
    if (this.isCustom) {
      store.fillPinyinForCustom();
      this.customList = store.getCustomList(options.lid);
    }
    const units = vocab.getUnits(3, 1);
    this.setData({
      isCustom: this.isCustom,
      customName: (this.customList || {}).name || "",
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

  onGenerate() {
    let words;
    if (this.isCustom) {
      words = ((this.customList || {}).words || []).slice(0, 16);
    } else {
      const { unit, listType } = this.data;
      words = vocab.buildWordList(3, 1, unit, listType, MAX_WORDS, "random");
    }
    if (!words.length) {
      wx.showToast({ title: "该词表为空", icon: "none" });
      return;
    }
    const rows = words.map((w) => ({
      pinyin: w.pinyin,
      cells: w.word.split("").map((ch) => ({ ch, empty: true })),
    }));
    this.setData({
      phase: "sheet",
      listName: this.isCustom ? "自定义词单" : LIST_NAME[this.data.listType] || this.data.listType,
      rows,
      total: words.length,
    });
  },

  onBack() {
    this.setData({ phase: "pick" });
  },

  onShuffle() {
    this.onGenerate();
  },

  /* ---------- 导出图片：canvas 绘 A4 练习单 → 存相册 ---------- */
  onExport() {
    wx.showLoading({ title: "生成中…" });
    wx.createSelectorQuery()
      .in(this)
      .select("#sheetCanvas")
      .fields({ node: true })
      .exec((res) => {
        const node = res && res[0] && res[0].node;
        if (!node) {
          wx.hideLoading();
          wx.showToast({ title: "画布不可用", icon: "none" });
          return;
        }
        try {
          this.drawSheet(node, () => {
            wx.canvasToTempFilePath({
              canvas: node,
              success: (r) => this.saveAlbum(r.tempFilePath),
              fail: () => {
                wx.hideLoading();
                wx.showToast({ title: "导出失败", icon: "none" });
              },
            });
          });
        } catch (e) {
          wx.hideLoading();
          wx.showToast({ title: "导出异常", icon: "none" });
        }
      });
  },

  drawSheet(node, done) {
    const ctx = node.getContext("2d");
    const W = 794, H = 1123;
    node.width = W * 2;
    node.height = H * 2;
    ctx.scale(2, 2);

    const rows = this.data.rows;
    const INK = "#2B3A55", GRID = "#D9D2BC", MUTED = "#9CA3AF";

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = INK;
    ctx.font = "700 34px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("语 文 练 习 单", W / 2, 70);
    ctx.font = "18px sans-serif";
    ctx.fillStyle = MUTED;
    ctx.fillText(`三年级上册 · ${this.data.unitTitle} · ${this.data.listName}`, W / 2, 100);

    ctx.textAlign = "left";
    ctx.fillStyle = "#374151";
    ctx.font = "16px sans-serif";
    ctx.fillText("姓名：__________", 60, 150);
    ctx.fillText("日期：______月______日", 330, 150);
    ctx.fillText("用时：________", 610, 150);

    ctx.fillStyle = INK;
    ctx.fillRect(60, 168, W - 120, 2);

    // 词行
    const top = 200;
    const rowH = Math.min(56, (H - top - 70) / Math.max(rows.length, 1));
    const box = Math.min(50, rowH - 8);
    rows.forEach((row, i) => {
      const y = top + i * rowH;
      ctx.fillStyle = INK;
      ctx.font = "18px sans-serif";
      ctx.fillText(row.pinyin, 60, y + box / 2 + 6);
      let x = W - 60 - row.cells.length * (box + 8);
      row.cells.forEach(() => {
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, box, box);
        ctx.strokeStyle = GRID;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x + box / 2, y);
        ctx.lineTo(x + box / 2, y + box);
        ctx.moveTo(x, y + box / 2);
        ctx.lineTo(x + box, y + box / 2);
        ctx.stroke();
        ctx.setLineDash([]);
        x += box + 8;
      });
    });

    ctx.fillStyle = MUTED;
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("柠檬字词 · 柠檬黄陪每天进步一点点", W / 2, H - 36);
    done();
  },

  saveAlbum(path) {
    wx.saveImageToPhotosAlbum({
      filePath: path,
      success: () => {
        wx.hideLoading();
        wx.showToast({ title: "已存相册", icon: "success" });
      },
      fail: (e) => {
        wx.hideLoading();
        const msg = (e.errMsg || "") + "";
        if (msg.indexOf("auth") > -1 || msg.indexOf("deny") > -1) {
          wx.showModal({
            title: "需要相册权限",
            content: "请在设置里允许「保存到相册」后再导出。",
            confirmText: "去设置",
            success: (r) => r.confirm && wx.openSetting(),
          });
        } else if (msg.indexOf("privacy") > -1) {
          wx.showToast({ title: "需先在隐私指引中声明相册权限", icon: "none", duration: 2500 });
        } else {
          wx.showToast({ title: "保存取消", icon: "none" });
        }
      },
    });
  },
});

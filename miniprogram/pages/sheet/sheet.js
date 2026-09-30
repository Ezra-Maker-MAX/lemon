/* 练习单：官方站「一键出卷」的复刻（屏显版）
   选单元/词表 → 生成 A4 版式练习单：拼音在上、田字格在下
   家长截图即可打印；不涉及导出权限 */
const vocab = require("../../data/vocab/index");

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

  onLoad() {
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

  onGenerate() {
    const { unit, listType } = this.data;
    let words = vocab.buildWordList(3, 1, unit, listType, MAX_WORDS, "random");
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
      listName: LIST_NAME[listType] || listType,
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
});

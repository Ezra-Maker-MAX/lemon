const vocab = require("../../data/vocab/index");

const LIST_NAME = { xiezi: "写字表", ciyu: "词语表", shizi: "识字表" };

Page({
  data: {
    // 报默状态（D3 驱动）
    words: [],        // [{word, pinyin, status: pending|current|ok|wrong}]
    index: 0,
    currentIndex: 0,  // 供 WXML 进度条比对（wx:for 的 index 会遮蔽 data.index）
    listName: "",
    unitTitle: "",

    // D2 阶段：词表预览
    preview: [],
    ready: false,
  },

  onLoad(options) {
    const term = Number(options.term) || 1;
    const unit = Number(options.unit) || 1;
    const listType = options.listType || "xiezi";
    const count = Number(options.count) || 10;
    const order = options.order === "random" ? "random" : "seq";

    const words = vocab.buildWordList(3, term, unit, listType, count, order);
    if (!words.length) {
      wx.showToast({ title: "词表为空，请回词库选择", icon: "none" });
      return;
    }
    const units = vocab.getUnits(3, term);
    const unitTitle = (units.find((u) => u.unit === unit) || {}).title || "";

    this.setData({
      words: words.map((w) => ({ ...w, status: "pending" })),
      index: 0,
      currentIndex: 0,
      listName: LIST_NAME[listType] || listType,
      unitTitle,
      preview: words.slice(0, 10),
      ready: true,
    });
    // 断点续默存档
    const store = require("../../utils/store");
    store.saveProgress({ unit, listType, index: 0 });
  },
});

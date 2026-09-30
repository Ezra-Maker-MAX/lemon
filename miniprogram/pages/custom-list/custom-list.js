/* 自定义词表（M2）：家长手动建词单 → 报默 / 看拼音写词语 / 练习单
   保存后自动从课本词库逐字补拼音（补不出的字暂留空） */
const store = require("../../utils/store");

Page({
  data: {
    lists: [],
    editing: false, // 编辑态
    editId: "",
    name: "",
    raw: "", // 原始输入
    editWordCount: 0,
  },

  onShow() {
    store.initDefaults();
    store.fillPinyinForCustom();
    this.refresh();
  },

  refresh() {
    const lists = store.getCustomLists().map((l) => ({
      ...l,
      preview: l.words.slice(0, 6).map((w) => w.word).join(" "),
      more: l.words.length > 6,
    }));
    this.setData({ lists });
  },

  onNew() {
    this.setData({ editing: true, editId: "", name: "", raw: "", editWordCount: 0 });
  },

  onEdit(e) {
    const l = store.getCustomList(e.currentTarget.dataset.id);
    if (!l) return;
    this.setData({
      editing: true,
      editId: l.id,
      name: l.name,
      raw: l.words.map((w) => w.word).join(" "),
      editWordCount: l.words.length,
    });
  },

  onName(e) {
    this.setData({ name: e.detail.value });
  },

  onRaw(e) {
    const raw = e.detail.value;
    const n = raw.split(/[\s,，、;；]+/).filter((w) => w.trim()).length;
    this.setData({ raw, editWordCount: n });
  },

  onSave() {
    const name = (this.data.name || "").trim() || "我的词单";
    const words = this.data.raw.split(/[\s,，、;；]+/).filter((w) => w.trim());
    if (!words.length) {
      wx.showToast({ title: "先输入几个词吧", icon: "none" });
      return;
    }
    store.saveCustomList(name, words, this.data.editId || undefined);
    store.fillPinyinForCustom();
    this.setData({ editing: false });
    this.refresh();
    wx.showToast({ title: "已保存", icon: "success" });
  },

  onCancel() {
    this.setData({ editing: false });
  },

  onDelete(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: "删除词单？",
      content: "词单删除后不可恢复（练习记录保留）。",
      confirmColor: "#D9534F",
      success: (r) => {
        if (r.confirm) {
          store.deleteCustomList(id);
          this.refresh();
        }
      },
    });
  },

  goDictation(e) {
    wx.navigateTo({
      url: `/pages/dictation/dictation?src=custom&lid=${e.currentTarget.dataset.id}&count=99`,
    });
  },

  goPinyin(e) {
    wx.navigateTo({
      url: `/pages/pinyin-write/pinyin-write?src=custom&lid=${e.currentTarget.dataset.id}`,
    });
  },

  goSheet(e) {
    wx.navigateTo({
      url: `/pages/sheet/sheet?src=custom&lid=${e.currentTarget.dataset.id}`,
    });
  },
});

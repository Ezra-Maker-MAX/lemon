const vocab = require("../../data/vocab/index");
const store = require("../../utils/store");

Page({
  data: {
    grade: 3,
    term: 1,
    units: [],
    currentUnit: 1,
    listType: "xiezi",
    count: 10,
    poolSize: 0,
  },

  onLoad() {
    const profile = store.getProfile();
    this.setData({ grade: profile.grade || 3, term: profile.term || 1 });
    this.refreshUnits();
  },

  refreshUnits() {
    const { grade, term } = this.data;
    const units = vocab.getUnits(grade, term);
    this.setData({
      units,
      currentUnit: units.length ? units[0].unit : 0,
    });
    this.refreshPoolSize();
  },

  refreshPoolSize() {
    const { grade, term, currentUnit, listType } = this.data;
    const list = vocab.buildWordList(grade, term, currentUnit, listType, 999);
    this.setData({ poolSize: list.length });
  },

  pickGrade(e) {
    const grade = Number(e.currentTarget.dataset.grade);
    if (grade === this.data.grade) return;
    if (!vocab.hasBook(grade, this.data.term)) {
      wx.showToast({ title: "该册词库待整理", icon: "none" });
      return;
    }
    this.setData({ grade, currentUnit: 1 });
    store.saveProfile({ ...store.getProfile(), grade, term: this.data.term, version: "人教版" });
    this.refreshUnits();
  },

  pickTerm(e) {
    const term = Number(e.currentTarget.dataset.term);
    const { grade } = this.data;
    if (term !== 1 && !vocab.hasBook(grade, term)) {
      wx.showToast({ title: "下册词库待整理", icon: "none" });
      return;
    }
    this.setData({ term });
    store.saveProfile({ ...store.getProfile(), grade, term, version: "人教版" });
    this.refreshUnits();
  },

  pickUnit(e) {
    const unit = Number(e.currentTarget.dataset.unit);
    this.setData({ currentUnit: unit });
    this.refreshPoolSize();
  },

  pickListType(e) {
    this.setData({ listType: e.currentTarget.dataset.type });
    this.refreshPoolSize();
  },

  incCount() {
    if (this.data.count < this.data.poolSize) {
      this.setData({ count: this.data.count + 1 });
    }
  },

  decCount() {
    if (this.data.count > 1) {
      this.setData({ count: this.data.count - 1 });
    }
  },

  startDictation() {
    const { grade, term, currentUnit, listType, count, poolSize } = this.data;
    if (!poolSize) {
      wx.showToast({ title: "该表暂无词", icon: "none" });
      return;
    }
    const n = Math.min(count, poolSize);
    wx.navigateTo({
      url: `/pages/dictation/dictation?grade=${grade}&term=${term}&unit=${currentUnit}&listType=${listType}&count=${n}`,
    });
  },

  startPhoto() {
    const { grade, term, currentUnit, listType, count, poolSize } = this.data;
    if (!poolSize) {
      wx.showToast({ title: "该表暂无词", icon: "none" });
      return;
    }
    const n = Math.min(count, poolSize);
    wx.navigateTo({
      url: `/pages/photo-check/photo-check?grade=${grade}&term=${term}&unit=${currentUnit}&listType=${listType}&count=${n}`,
    });
  },
});

/* 柠檬单词（英语模块 M2）
   人教版 PEP 三上：四线三格浏览 + 听音拼写报默
   英语 TTS 固定用美音音色（403006 云小朵系/YunMia），与语文音色互不影响 */
const EN_DB = require("../../data/vocab/english/grade3-term1");
const tts = require("../../utils/tts");

const EN_VOICE = 403006; // YunMia 美音女声

Page({
  data: {
    units: [],
    unit: 1,
    unitTitle: "",
    words: [], // 当前单元词卡
    phase: "browse", // browse
  },

  onLoad() {
    const units = EN_DB.units.map((u) => ({ unit: u.unit, title: u.title }));
    this.setData({ units });
    this.loadUnit(1);
  },

  loadUnit(unit) {
    const u = EN_DB.units.find((x) => x.unit === unit) || EN_DB.units[0];
    this.setData({
      unit: u.unit,
      unitTitle: u.title,
      words: u.words,
    });
  },

  onPickUnit(e) {
    this.loadUnit(Number(e.currentTarget.dataset.unit));
  },

  /* 单词试听 */
  onSpeak(e) {
    const en = e.currentTarget.dataset.en;
    tts.speak(en, { voiceType: EN_VOICE, rate: -0.2, onError: () => {} });
  },

  goDictation() {
    wx.navigateTo({
      url: `/pages/english-dictation/english-dictation?unit=${this.data.unit}`,
    });
  },
});

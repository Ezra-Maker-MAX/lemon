/* 设置页（D6 接线）
   语速滑杆 / 报词间隔滑杆 / 每词重复 stepper / 拼音提示开关 → store.saveSettings
   报默页 onLoad 时读 settings，改完下次报默即生效（无需重启）
   清空数据：二次确认 → 本地 storage 全清 → 重新初始化默认值 */
const store = require("../../utils/store");
const tts = require("../../utils/tts");

function rateLabel(rate) {
  const r = Number(rate) || 0;
  if (r <= -0.6) return "🐢 很慢";
  if (r <= -0.2) return "稍慢";
  if (r < 0.2) return "正常";
  if (r < 0.6) return "稍快";
  return "🐇 很快";
}

/* 腾讯云 TTS 音色（TextToVoice 直支持 6 位 ID）
   覆盖女声 / 男声 / 童声，点卡片试听并选中 */
const VOICES = [
  { id: 101001, name: "智瑜", tag: "温柔女声", mark: "瑜" },
  { id: 101004, name: "智云", tag: "沉稳男声", mark: "云" },
  { id: 101016, name: "智甜", tag: "女童声", mark: "甜" },
  { id: 101015, name: "智萌", tag: "男童声", mark: "萌" },
  { id: 101002, name: "智聆", tag: "知性女声", mark: "聆" },
  { id: 101006, name: "智言", tag: "阳光男声", mark: "言" },
];

Page({
  data: {
    s: null, // settings 快照
    rateText: "正常",
    voices: VOICES,
    previewingId: 0, // 正在试听的音色 id
  },

  onLoad() {
    store.initDefaults();
    const s = store.getSettings();
    this.setData({ s, rateText: rateLabel(s.speechRate) });
  },

  /* ---------- 语速（-1 ~ 1，步进 0.2） ---------- */
  onRateChange(e) {
    const rate = Math.round(Number(e.detail.value) * 10) / 10;
    const s = store.saveSettings({ speechRate: rate });
    this.setData({ s, rateText: rateLabel(rate) });
  },

  /* ---------- 报词间隔（10 ~ 60 秒，步进 5） ---------- */
  onIntervalChange(e) {
    const sec = Number(e.detail.value);
    const s = store.saveSettings({ intervalSec: sec });
    this.setData({ s });
  },

  /* ---------- 每词重复次数（1 ~ 3） ---------- */
  onRepeatMinus() {
    const n = Math.max(1, (this.data.s.repeatCount || 1) - 1);
    this.setData({ s: store.saveSettings({ repeatCount: n }) });
  },
  onRepeatPlus() {
    const n = Math.min(3, (this.data.s.repeatCount || 1) + 1);
    this.setData({ s: store.saveSettings({ repeatCount: n }) });
  },

  /* ---------- 拼音提示开关 ---------- */
  onPinyinToggle(e) {
    const s = store.saveSettings({ showPinyin: !!e.detail.value });
    this.setData({ s });
  },

  /* ---------- 音色：点击 = 试听 + 选中 ---------- */
  onVoiceTap(e) {
    const id = Number(e.currentTarget.dataset.id);
    const v = VOICES.find((x) => x.id === id);
    if (!v) return;
    const s = store.saveSettings({ voiceType: id });
    this.setData({ s, previewingId: id });
    tts.speak(`你好呀，我是${v.name}，今天也要好好写字哦。`, {
      rate: s.speechRate || 0,
      voiceType: id,
      onDone: () => this.setData({ previewingId: 0 }),
      onError: () => {
        this.setData({ previewingId: 0 });
        wx.showToast({ title: "试听失败，请检查网络", icon: "none" });
      },
    });
  },

  goCustom() {
    wx.navigateTo({ url: "/pages/custom-list/custom-list" });
  },

  /* ---------- 清空全部数据（二次确认） ---------- */  onClearData() {
    wx.showModal({
      title: "清空全部数据？",
      content: "报默记录、错题本、断点将全部删除，且不可恢复。",
      confirmText: "继续",
      confirmColor: "#D9534F",
      success: (r1) => {
        if (!r1.confirm) return;
        wx.showModal({
          title: "最后确认",
          content: "真的要清空吗？孩子的练习记录会全部消失哦。",
          confirmText: "清空",
          confirmColor: "#D9534F",
          success: (r2) => {
            if (!r2.confirm) return;
            try {
              wx.clearStorageSync();
            } catch (e) {
              /* 忽略 */
            }
            store.initDefaults();
            this.setData({ s: store.getSettings(), rateText: rateLabel(0) });
            wx.showToast({ title: "已清空", icon: "success" });
          },
        });
      },
    });
  },
});

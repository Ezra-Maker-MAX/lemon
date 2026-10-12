const store = require("./utils/store");

App({
  globalData: {},

  onLaunch() {
    store.initDefaults();
    // 设置多设备同步：云端较新则采纳（fire-and-forget）
    store.pullSettingsFromCloud();
    // 云开发：环境未开通时 init 不报错，callFunction 才会失败（页面已做降级）
    if (wx.cloud) {
      wx.cloud.init({
        env: "crescent-d4gha883o5b8b6995",
        traceUser: true,
      });
    }
  },

  onShow() {
    this.maybeWeeklyPush();
  },

  /* 每周学习提醒：不依赖云开发定时触发器（个人建触发器流程麻烦）
     一次性订阅有效期 7 天 + 打开小程序时间隔 ≥7 天 → 触发周报推送 */
  maybeWeeklyPush() {
    try {
      const last = wx.getStorageSync("weekPushLast") || 0;
      if (!last) return; // 从未订阅
      if (Date.now() - last < 7 * 24 * 3600 * 1000) return;
      wx.cloud
        .callFunction({ name: "ai", data: { action: "weekPush" } })
        .then((r) => {
          wx.setStorageSync("weekPushLast", Date.now()); // 无论是否真发出都刷新，避免每次打开都请求
          const out = r && r.result;
          if (out && out.code === "OK" && out.data && out.data.stat) {
            console.log("[weekPush]", JSON.stringify(out.data.stat));
          }
        })
        .catch(() => {});
    } catch (e) {}
  },
});

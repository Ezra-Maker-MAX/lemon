const store = require("./utils/store");

App({
  globalData: {},

  onLaunch() {
    store.initDefaults();
    // 云开发：环境未开通时 init 不报错，callFunction 才会失败（页面已做降级）
    if (wx.cloud) {
      wx.cloud.init({ traceUser: true });
    }
  },
});

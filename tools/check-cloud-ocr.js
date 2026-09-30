/* D4 真机链路补充验证：经小程序 wx.cloud.callFunction 调真实腾讯云 OCR */
const automator = require("miniprogram-automator");
const fs = require("fs");

(async () => {
  const mp = await automator.connect({ wsEndpoint: "ws://127.0.0.1:9420" });
  console.log("已连接");
  const b64 = fs
    .readFileSync("tools/shots/ocr_test.png")
    .toString("base64");
  const res = await mp.evaluate(
    (img) =>
      wx.cloud
        .callFunction({ name: "ai", data: { action: "ocr", imageBase64: img } })
        .then((r) => r.result),
    b64
  );
  console.log("云函数返回:", JSON.stringify(res).slice(0, 200));
  if (res.code === "OK" && res.lines.length) {
    console.log("✅ 云端 OCR 链路 PASS，识别:", res.lines.join(" "));
  } else {
    console.log("❌ 云端 OCR 异常");
    process.exitCode = 1;
  }
  await mp.disconnect();
})().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});

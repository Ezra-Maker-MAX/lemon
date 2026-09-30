/* 云函数 ai：柠檬字词的腾讯云能力聚合入口
   action = "tts" → 腾讯云基础语音合成 TextToVoice，返回 base64 mp3
   action = "ocr" → 通用手写体识别 GeneralHandwritingOCR，返回识别行数组
   密钥：优先环境变量 TENCENT_SECRET_ID/KEY，否则读同目录 secret.json（gitignore） */
const cloud = require("wx-server-sdk");
const TtsClient = require("tencentcloud-sdk-nodejs-tts").tts.v20190823.Client;
const OcrClient = require("tencentcloud-sdk-nodejs-ocr").ocr.v20181119.Client;

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

function loadSecret() {
  if (process.env.TENCENT_SECRET_ID && process.env.TENCENT_SECRET_KEY) {
    return { id: process.env.TENCENT_SECRET_ID, key: process.env.TENCENT_SECRET_KEY };
  }
  try {
    const s = require("./secret.json");
    const id = s.id || s.secretId;
    const key = s.key || s.secretKey;
    if (id && key) return { id, key };
  } catch (e) {
    /* secret.json 不存在 */
  }
  return null;
}

exports.main = async (event) => {
  const secret = loadSecret();
  if (!secret) {
    return { code: "NO_SECRET", message: "云函数缺腾讯云密钥（secret.json 或环境变量）" };
  }
  const credential = { secretId: secret.id, secretKey: secret.key };

  try {
    if (event.action === "tts") {
      const client = new TtsClient({ credential, region: "ap-guangzhou" });
      const res = await client.TextToVoice({
        Text: String(event.text || "").slice(0, 60),
        SessionId: "lemon-" + Date.now(),
        ModelType: 1, // 基础模型
        VoiceType: Number(event.voiceType) || 0, // 0 智瑜（女声）
        Speed: Math.max(-2, Math.min(2, Number(event.speed) || 0)),
        Codec: "mp3",
      });
      return { code: "OK", audio: res.Audio };
    }

    if (event.action === "ocr") {
      const client = new OcrClient({ credential, region: "ap-guangzhou" });
      const res = await client.GeneralHandwritingOCR({
        ImageBase64: event.imageBase64,
      });
      const lines = (res.TextDetections || []).map((d) => d.DetectedText);
      return { code: "OK", lines };
    }

    return { code: "BAD_ACTION", message: String(event.action) };
  } catch (e) {
    return { code: "API_ERROR", message: e.message };
  }
};

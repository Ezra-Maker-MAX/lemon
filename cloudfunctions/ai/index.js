/* 云函数 ai：柠檬字词的腾讯云能力聚合入口
   action = "tts" → 腾讯云基础语音合成 TextToVoice，返回 base64 mp3
   action = "ocr" → 通用手写体识别 GeneralHandwritingOCR，返回识别行数组
   action = "explain" → 词解读：en=免费词典 API；zh=DeepSeek（需环境变量 DEEPSEEK_API_KEY）
   密钥：优先环境变量 TENCENT_SECRET_ID/KEY，否则读同目录 secret.json（gitignore） */
const cloud = require("wx-server-sdk");
const https = require("https");
const TtsClient = require("tencentcloud-sdk-nodejs-tts").tts.v20190823.Client;
const OcrClient = require("tencentcloud-sdk-nodejs-ocr").ocr.v20181119.Client;

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/* HTTPS GET/POST JSON（云函数出网不受小程序域名校验限制） */
function httpJson(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      { method: options.method || "GET", headers: options.headers || {}, timeout: 12000 },
      (res) => {
        let buf = "";
        res.on("data", (c) => (buf += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(buf) });
          } catch (e) {
            reject(new Error("响应非 JSON"));
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("请求超时")));
    if (body) req.write(body);
    req.end();
  });
}

/* 英文释义：LLM（dictionaryapi.dev 为境外源，国内网络不可达，弃用） */
async function explainEn(word) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    return { error: "联网释义需要配置 DeepSeek 密钥（云函数环境变量 DEEPSEEK_API_KEY）" };
  }
  const prompt =
    `你是小学三年级英语老师。解释单词「${word}」，适合中国小学生，` +
    `严格返回 JSON：{"phonetic":"音标，如 /həˈləʊ/","meanings":["中文意思1","中文意思2"],"example":"一个简单英文例句"}`;
  const body = JSON.stringify({
    model: "deepseek-chat",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    max_tokens: 200,
    response_format: { type: "json_object" },
  });
  const { status, json } = await httpJson(
    "https://api.deepseek.com/chat/completions",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    },
    body
  );
  if (status !== 200 || !json.choices || !json.choices.length) {
    throw new Error("解读服务异常");
  }
  try {
    const parsed = JSON.parse(json.choices[0].message.content);
    return {
      phonetic: parsed.phonetic || "",
      meanings: Array.isArray(parsed.meanings) && parsed.meanings.length ? parsed.meanings : ["暂无释义"],
      example: parsed.example || "",
    };
  } catch (e) {
    return { phonetic: "", meanings: [String(json.choices[0].message.content).slice(0, 120)], example: "" };
  }
}

/* 中文解读：DeepSeek（OpenAI 兼容接口；密钥放云函数环境变量 DEEPSEEK_API_KEY） */
async function explainZh(word) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    return { error: "中文解读需要配置 DeepSeek 密钥（云函数环境变量 DEEPSEEK_API_KEY）" };
  }
  const prompt =
    `你是小学三年级语文老师。用适合孩子的方式解释词语「${word}」，120字以内，` +
    `严格返回 JSON：{"meaning":"这个词语是什么意思","sentence":"用这个词造一个句子","near":"近义词：…；反义词：…"}`;
  const body = JSON.stringify({
    model: "deepseek-chat",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    max_tokens: 300,
    response_format: { type: "json_object" },
  });
  const { status, json } = await httpJson(
    "https://api.deepseek.com/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
    },
    body
  );
  if (status !== 200 || !json.choices || !json.choices.length) {
    throw new Error("解读服务异常");
  }
  try {
    const parsed = JSON.parse(json.choices[0].message.content);
    return { meaning: parsed.meaning || "", sentence: parsed.sentence || "", near: parsed.near || "" };
  } catch (e) {
    return { meaning: String(json.choices[0].message.content).slice(0, 150), sentence: "", near: "" };
  }
}

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

    if (event.action === "explain") {
      const word = String(event.word || "").slice(0, 40);
      if (!word) return { code: "BAD_PARAM", message: "缺少 word" };
      const data =
        event.lang === "en" ? await explainEn(word) : await explainZh(word);
      if (data && data.error) return { code: "NO_KEY", message: data.error };
      return { code: "OK", data };
    }

    return { code: "BAD_ACTION", message: String(event.action) };
  } catch (e) {
    return { code: "API_ERROR", message: e.message };
  }
};

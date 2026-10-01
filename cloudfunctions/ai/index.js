/* 云函数 ai：柠檬字词的腾讯云能力聚合入口
   action = "tts" → 腾讯云基础语音合成 TextToVoice，返回 base64 mp3
   action = "ocr" → 通用手写体识别 GeneralHandwritingOCR，返回识别行数组
   action = "explain" → 词解读：经 Agnes AI（OpenAI 兼容 /chat/completions）
   LLM 配置：优先环境变量 AGNES_API_KEY，否则读同目录 llm.json（gitignore）
   腾讯云密钥：优先环境变量 TENCENT_SECRET_ID/KEY，否则读同目录 secret.json（gitignore） */
const cloud = require("wx-server-sdk");
const https = require("https");
const TtsClient = require("tencentcloud-sdk-nodejs-tts").tts.v20190823.Client;
const OcrClient = require("tencentcloud-sdk-nodejs-ocr").ocr.v20181119.Client;

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/* Agnes LLM 配置：环境变量优先，其次 llm.json（随函数部署但不入库） */
function loadLLMConfig() {
  if (process.env.AGNES_API_KEY) {
    return { baseUrl: "https://apihub.agnes-ai.com/v1", apiKey: process.env.AGNES_API_KEY, model: "agnes-2.5-flash" };
  }
  try {
    const c = require("./llm.json");
    if (c.apiKey) {
      return { baseUrl: c.baseUrl || "https://apihub.agnes-ai.com/v1", apiKey: c.apiKey, model: c.model || "agnes-2.5-flash" };
    }
  } catch (e) {
    /* llm.json 不存在 */
  }
  return null;
}

/* OpenAI 兼容 chat/completions（2.5-flash 带 reasoning_content 且 content 有前导空行，须 trim） */
async function callLLM(cfg, prompt, maxTokens) {
  const body = JSON.stringify({
    model: cfg.model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    max_tokens: maxTokens,
  });
  const { status, json } = await httpJson(cfg.baseUrl + "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
    timeout: 55000, // LLM 偶发慢响应；函数预算 60s
  }, body);
  if (status !== 200 || !json.choices || !json.choices.length) {
    throw new Error("解读服务异常(" + status + ")");
  }
  return String(json.choices[0].message.content || "").trim();
}

/* HTTPS GET/POST JSON（云函数出网不受小程序域名校验限制） */
function httpJson(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      { method: options.method || "GET", headers: options.headers || {}, timeout: options.timeout || 12000 },
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

/* 英文释义：Agnes LLM（dictionaryapi.dev 为境外源，国内网络不可达，弃用） */
async function explainEn(word) {
  const cfg = loadLLMConfig();
  if (!cfg) {
    return { error: "联网释义需要配置 Agnes 密钥（环境变量 AGNES_API_KEY 或云函数目录 llm.json）" };
  }
  const prompt =
    `你是小学三年级英语老师。解释单词「${word}」，适合中国小学生，` +
    `严格返回 JSON（不要多余文字）：{"phonetic":"音标，如 /həˈləʊ/","meanings":["中文意思1","中文意思2"],"example":"一个简单英文例句"}`;
  const raw = await callLLM(cfg, prompt, 300);
  try {
    const parsed = JSON.parse(raw.replace(/^```json\s*|```$/g, "").trim());
    return {
      phonetic: parsed.phonetic || "",
      meanings: Array.isArray(parsed.meanings) && parsed.meanings.length ? parsed.meanings : ["暂无释义"],
      example: parsed.example || "",
    };
  } catch (e) {
    return { phonetic: "", meanings: [String(raw).slice(0, 120)], example: "" };
  }
}

/* 中文解读：Agnes LLM（OpenAI 兼容接口） */
async function explainZh(word) {
  const cfg = loadLLMConfig();
  if (!cfg) {
    return { error: "中文解读需要配置 Agnes 密钥（环境变量 AGNES_API_KEY 或云函数目录 llm.json）" };
  }
  const prompt =
    `你是小学三年级语文老师。用适合孩子的方式解释词语「${word}」，120字以内，` +
    `严格返回 JSON（不要多余文字）：{"meaning":"这个词语是什么意思","sentence":"用这个词造一个句子","near":"近义词：…；反义词：…"}`;
  const raw = await callLLM(cfg, prompt, 400);
  try {
    const parsed = JSON.parse(raw.replace(/^```json\s*|```$/g, "").trim());
    return { meaning: parsed.meaning || "", sentence: parsed.sentence || "", near: parsed.near || "" };
  } catch (e) {
    return { meaning: String(raw).slice(0, 150), sentence: "", near: "" };
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

/* ---------- Turso（订阅周报用；密钥在 turso.json，随函数部署不入库） ---------- */
function loadTursoConfig() {
  if (process.env.TURSO_URL && process.env.TURSO_TOKEN) {
    return { host: process.env.TURSO_URL, token: process.env.TURSO_TOKEN };
  }
  try {
    const c = require("./turso.json");
    if (c.host && c.token) return c;
  } catch (e) {
    /* turso.json 不存在 */
  }
  return null;
}

function tursoPipeline(cfg, stmts) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      requests: [
        ...stmts.map((sql) => ({ type: "execute", stmt: { sql } })),
        { type: "close" },
      ],
    });
    const req = https.request(
      `https://${cfg.host}/v2/pipeline`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}` },
        timeout: 12000,
      },
      (res) => {
        let buf = "";
        res.on("data", (c) => (buf += c));
        res.on("end", () => {
          try {
            const data = JSON.parse(buf);
            const rows = data.results
              .filter((r) => r.type === "ok" && r.response && r.response.type === "execute")
              .map((r) => {
                const result = r.response.result;
                const cols = result.cols.map((c) => c.name);
                return result.rows.map((row) => {
                  const o = {};
                  cols.forEach((c, i) => (o[c] = row[i] ? row[i].value : null));
                  return o;
                });
              });
            resolve(rows);
          } catch (e) {
            reject(new Error("Turso 响应异常"));
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("Turso 超时")));
    req.write(body);
    req.end();
  });
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

    /* 订阅周报：用户授权后记录 openid（一次性订阅 = 1 条推送额度） */
    if (event.action === "subscribeReport") {
      const tcfg = loadTursoConfig();
      if (!tcfg) return { code: "NO_TURSO", message: "缺 Turso 配置" };
      const wxCtx = cloud.getWXContext();
      const openid = wxCtx.OPENID;
      if (!openid) return { code: "NO_OPENID", message: "无法获取用户身份" };
      await tursoPipeline(tcfg, [
        "CREATE TABLE IF NOT EXISTS sub_quota (openid TEXT PRIMARY KEY, granted_at TEXT)",
        `INSERT OR REPLACE INTO sub_quota VALUES ('${openid.replace(/'/g, "")}', '${new Date().toISOString()}')`,
      ]);
      return { code: "OK", data: { openid } };
    }

    /* 周报推送：定时触发器/手动调用；需要订阅模板 ID（event.templateId 或环境变量 WX_TMPL_ID） */
    if (event.action === "weekPush") {
      const tcfg = loadTursoConfig();
      if (!tcfg) return { code: "NO_TURSO", message: "缺 Turso 配置" };
      const templateId = String(event.templateId || process.env.WX_TMPL_ID || "");
      if (!templateId) return { code: "NO_TEMPLATE", message: "缺订阅模板 ID" };

      const rows = await tursoPipeline(tcfg, [
        "SELECT openid, granted_at FROM sub_quota",
        "SELECT COUNT(*) AS n, SUM(total) AS total, SUM(correct) AS correct FROM sessions WHERE created_at >= datetime('now', '-7 days')",
      ]);
      const openids = (rows[0] || []).map((r) => r.openid);
      const stat = (rows[1] || [])[0] || {};
      const total = Number(stat.total) || 0;
      const correct = Number(stat.correct) || 0;
      const times = Number(stat.n) || 0;
      const acc = total ? Math.round((correct / total) * 100) : 0;
      if (!openids.length) return { code: "OK", data: { sent: 0, reason: "无订阅额度" } };

      const sendResults = [];
      for (const openid of openids) {
        try {
          await cloud.openapi.subscribeMessage.send({
            touser: openid,
            templateId,
            page: "pages/index/index",
            data: {
              thing1: { value: `本周完成 ${times} 次报默` },
              thing2: { value: total ? `默写正确率 ${acc}%` : "本周暂无默写记录" },
            },
          });
          sendResults.push({ openid, ok: true });
        } catch (e) {
          sendResults.push({ openid, ok: false, err: String(e.errMsg || e.message).slice(0, 80) });
          // 43101 = 用户未订阅/额度用尽 → 清掉额度，等下次授权
          if (String(e.errCode) === "43101") {
            await tursoPipeline(tcfg, [`DELETE FROM sub_quota WHERE openid = '${openid.replace(/'/g, "")}'`]);
          }
        }
      }
      return { code: "OK", data: { stat: { times, total, correct, acc }, sendResults } };
    }

    return { code: "BAD_ACTION", message: String(event.action) };
  } catch (e) {
    return { code: "API_ERROR", message: e.message };
  }
};

/* TTS 封装：腾讯云基础语音合成（经云函数 ai，个人主体可用）
   WechatSI 插件不支持个人主体，已弃用（见 2026-09-30 日志）
   链路：wx.cloud.callFunction("ai", {action:"tts"}) → base64 mp3 → 写临时文件 → 播放
   同文本缓存本地文件；任何失败通过 onError 上抛，页面走"手动报词"兜底，不阻塞流程 */
let audio = null;
let doneCb = null;
const fileCache = {}; // text -> 本地 mp3 路径
const CACHE_LIMIT = 50;

const fsm = wx.getFileSystemManager();

function ensureAudio() {
  if (audio) return audio;
  audio = wx.createInnerAudioContext();
  audio.obeyMuteSwitch = false; // 报默时静音键不吞音
  audio.onEnded(() => {
    const cb = doneCb;
    doneCb = null;
    if (cb) cb();
  });
  audio.onError(() => {
    const cb = doneCb;
    doneCb = null;
    if (cb) cb();
  });
  return audio;
}

function clampRate(rate) {
  // settings.speechRate ∈ [-1,1] → 腾讯云 Speed ∈ [-0.5, 0.5]（每 0.1 一档较自然）
  return Math.max(-0.5, Math.min(0.5, (Number(rate) || 0) * 0.5));
}

function play(path, onDone) {
  const a = ensureAudio();
  a.stop();
  a.src = path;
  doneCb = onDone;
  a.play();
}

function cachePut(key, path) {
  const keys = Object.keys(fileCache);
  if (keys.length >= CACHE_LIMIT) {
    const oldest = fileCache[keys[0]];
    try {
      fsm.unlinkSync(oldest);
    } catch (e) {
      /* 忽略清理失败 */
    }
    delete fileCache[keys[0]];
  }
  fileCache[key] = path;
}

function writeAudio(base64, onOk, onError) {
  const path = `${wx.env.USER_DATA_PATH}/tts_${Date.now()}_${Math.floor(Math.random() * 1e4)}.mp3`;
  fsm.writeFile({
    filePath: path,
    data: base64,
    encoding: "base64",
    success: () => onOk(path),
    fail: (e) => onError(new Error("写音频文件失败: " + (e.errMsg || e.message))),
  });
}

function speak(text, opts = {}) {
  const { rate = 0, onDone, onError } = opts;
  if (!text) return;
  if (!wx.cloud) {
    onError && onError(new Error("基础库不支持云能力"));
    return;
  }
  const key = `${Math.round(clampRate(rate) * 10)}|${text}`;
  if (fileCache[key]) {
    play(fileCache[key], onDone);
    return;
  }
  wx.cloud
    .callFunction({
      name: "ai",
      data: { action: "tts", text, speed: clampRate(rate) },
    })
    .then((res) => {
      const r = res && res.result;
      if (!r || r.code !== "OK" || !r.audio) {
        onError && onError(new Error((r && r.message) || "TTS 云函数返回异常"));
        return;
      }
      writeAudio(
        r.audio,
        (path) => {
          cachePut(key, path);
          play(path, onDone);
        },
        onError
      );
    })
    .catch((e) => onError && onError(new Error(e.errMsg || e.message)));
}

function stop() {
  if (audio) {
    doneCb = null;
    audio.stop();
  }
}

module.exports = { speak, stop, available: !!wx.cloud };

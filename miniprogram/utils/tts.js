/* TTS 封装：微信同声传译插件 WechatSI（免费）
   textToSpeech 拿 mp3 地址 → innerAudioContext 播放
   同文本（含语速）缓存 mp3 URL；失败通过 onError 上抛，不阻塞报默流程
   （插件不可用时页面走"手动报词"兜底：家长照预览念） */
let plugin = null;
try {
  plugin = requirePlugin("WechatSI");
} catch (e) {
  plugin = null;
}

let audio = null;
let doneCb = null;
const urlCache = {}; // "rate|text" -> mp3 url

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
  // settings.speechRate ∈ [-1,1] → 播放速率 [0.75, 1.25]
  const r = 1 + (Number(rate) || 0) * 0.25;
  return Math.min(2, Math.max(0.5, r));
}

function play(url, rate, onDone) {
  const a = ensureAudio();
  a.stop();
  a.playbackRate = clampRate(rate);
  a.src = url;
  doneCb = onDone;
  a.play();
}

function speak(text, opts = {}) {
  const { rate = 0, onDone, onError } = opts;
  if (!text) return;
  if (!plugin) {
    onError && onError(new Error("WechatSI 插件不可用"));
    return;
  }
  const key = `${rate}|${text}`;
  if (urlCache[key]) {
    play(urlCache[key], rate, onDone);
    return;
  }
  plugin.textToSpeech({
    lang: "zh_CN",
    tts: true,
    content: text,
    success: (res) => {
      if (res.retcode !== 0 || !res.filename) {
        onError && onError(new Error(res.errmsg || "TTS retcode " + res.retcode));
        return;
      }
      urlCache[key] = res.filename;
      play(res.filename, rate, onDone);
    },
    fail: (e) => onError && onError(e),
  });
}

function stop() {
  if (audio) {
    doneCb = null;
    audio.stop();
  }
}

module.exports = { speak, stop, available: !!plugin };

/* 本地存储主存储层
   storage 优先，Turso 同步见 utils/turso.js（异步，不阻塞） */
const KEYS = {
  PROFILE: "profile",
  SETTINGS: "settings",
  SESSIONS: "dictation_sessions",
  WRONG: "wrong_book",
  PROGRESS: "progress",
};

const DEFAULT_SETTINGS = {
  speechRate: 0,      // TTS 语速 -1~1
  intervalSec: 15,    // 报词间隔秒
  repeatCount: 1,     // 每词重复次数
  order: "seq",       // seq | random
  showPinyin: false,  // 报默时显示拼音提示
  voiceType: 101001,  // 腾讯云 TTS 音色（101001 智瑜·女声）
};

const DEFAULT_PROFILE = {
  grade: 3,
  term: 1,
  version: "人教版",
};

function get(key, def) {
  try {
    const v = wx.getStorageSync(key);
    return v === "" || v === undefined || v === null ? def : v;
  } catch (e) {
    return def;
  }
}

function set(key, value) {
  try {
    wx.setStorageSync(key, value);
  } catch (e) {
    console.error("storage set fail", key, e);
  }
}

function initDefaults() {
  if (!get(KEYS.SETTINGS, null)) set(KEYS.SETTINGS, DEFAULT_SETTINGS);
  if (!get(KEYS.PROFILE, null)) set(KEYS.PROFILE, DEFAULT_PROFILE);
  if (!get(KEYS.SESSIONS, null)) set(KEYS.SESSIONS, []);
  if (!get(KEYS.WRONG, null)) set(KEYS.WRONG, []);
}

/* ---------- 教材 profile ---------- */
const getProfile = () => get(KEYS.PROFILE, DEFAULT_PROFILE);
const saveProfile = (p) => set(KEYS.PROFILE, p);

/* ---------- 报默参数 ---------- */
const getSettings = () => Object.assign({}, DEFAULT_SETTINGS, get(KEYS.SETTINGS, {}));
const saveSettings = (patch) => {
  const s = Object.assign(getSettings(), patch);
  set(KEYS.SETTINGS, s);
  return s;
};

/* ---------- 报默记录 ---------- */
function addSession(session) {
  const list = get(KEYS.SESSIONS, []);
  const record = Object.assign(
    { id: `s_${Date.now()}`, date: new Date().toISOString() },
    session
  );
  list.unshift(record);
  if (list.length > 500) list.length = 500; // 防膨胀
  set(KEYS.SESSIONS, list);
  syncSessionToCloud(record);
  return record;
}

const getSessions = () => get(KEYS.SESSIONS, []);

/* 最近 n 天正确率（首页统计卡） */
function getWeeklyAccuracy() {
  const now = Date.now();
  const week = getSessions().filter(
    (s) => now - new Date(s.date).getTime() < 7 * 86400e3
  );
  const total = week.reduce((a, s) => a + s.total, 0);
  const correct = week.reduce((a, s) => a + s.correct, 0);
  return total ? Math.round((correct / total) * 100) : null;
}

/* ---------- 错题本 ---------- */
/* word 唯一键：错 → count++/streak 清零；对 → streak++，连对 3 次毕业 */
function updateWrongBook(word, pinyin, isCorrect) {
  const list = get(KEYS.WRONG, []);
  let item = list.find((w) => w.word === word);
  if (!item) {
    if (isCorrect) return null;
    item = {
      word,
      pinyin: pinyin || "",
      wrongCount: 0,
      lastWrongAt: "",
      correctStreak: 0,
      mastered: false,
    };
    list.push(item);
  }
  if (item.mastered) return item;
  if (isCorrect) {
    item.correctStreak += 1;
    if (item.correctStreak >= 3) item.mastered = true;
  } else {
    item.wrongCount += 1;
    item.correctStreak = 0;
    item.lastWrongAt = new Date().toISOString();
    if (pinyin) item.pinyin = pinyin;
  }
  set(KEYS.WRONG, list);
  syncWrongToCloud();
  return item;
}

const getWrongBook = () =>
  get(KEYS.WRONG, []).filter((w) => !w.mastered);

/* ---------- 报默断点 ---------- */
const getProgress = () => get(KEYS.PROGRESS, null);
const saveProgress = (p) => set(KEYS.PROGRESS, p);
const clearProgress = () => set(KEYS.PROGRESS, null);

/* ---------- 自定义词表（M2） ----------
   [{id, name, words:[{word, pinyin}], createdAt}] */
const getCustomLists = () => get("custom_lists", []);
const saveCustomList = (name, rawWords, id) => {
  const list = getCustomLists();
  const words = rawWords
    .map((w) => String(w).trim())
    .filter((w) => w)
    .map((w) => ({ word: w.slice(0, 10), pinyin: "" }));
  let lid = id;
  if (lid) {
    const it = list.find((x) => x.id === lid);
    if (it) {
      it.name = name;
      it.words = words;
    }
  } else {
    lid = "cl_" + Date.now();
    list.unshift({ id: lid, name, words, createdAt: new Date().toISOString() });
  }
  set("custom_lists", list.slice(0, 20)); // 防膨胀
  return lid;
};
const getCustomList = (lid) => getCustomLists().find((x) => x.id === lid) || null;
const deleteCustomList = (lid) => {
  set("custom_lists", getCustomLists().filter((x) => x.id !== lid));
};

/* 自定义词补拼音：从课本词库建 字→拼音 映射，逐字拼 */
function fillPinyinForCustom() {
  const vocab = require("../data/vocab/index");
  const charMap = {};
  const gradeWords = vocab.getAllWords(3, 1);
  gradeWords.forEach((w) => {
    const pys = String(w.pinyin || "").split(/\s+/);
    w.word.split("").forEach((ch, i) => {
      if (pys[i] && !charMap[ch]) charMap[ch] = pys[i];
    });
  });
  const lists = getCustomLists();
  let changed = false;
  lists.forEach((l) =>
    l.words.forEach((w) => {
      if (w.pinyin) return;
      const pys = w.word
        .split("")
        .map((ch) => charMap[ch] || "?")
        .join(" ");
      if (!pys.includes("?")) {
        w.pinyin = pys;
        changed = true;
      }
    })
  );
  if (changed) set("custom_lists", lists);
  return charMap;
}

/* ---------- Turso 云同步（fire-and-forget，失败静默） ---------- */
function syncSessionToCloud(record) {
  const turso = require("./turso");
  turso
    .exec(
      "INSERT OR REPLACE INTO sessions (id, created_at, unit, list_type, mode, total, correct, words_json) VALUES (?,?,?,?,?,?,?,?)",
      [
        record.id,
        record.date,
        record.unit || 0,
        record.listType || "",
        record.mode || "voice",
        record.total || 0,
        record.correct || 0,
        JSON.stringify(record.words || []),
      ]
    )
    .catch(() => {});
}

function syncWrongToCloud() {
  const turso = require("./turso");
  const list = get(KEYS.WRONG, []);
  Promise.all(
    list.map((w) =>
      turso
        .exec(
          "INSERT OR REPLACE INTO wrong_book (word, pinyin, wrong_count, last_wrong_at, correct_streak, mastered) VALUES (?,?,?,?,?,?)",
          [
            w.word,
            w.pinyin || "",
            w.wrongCount,
            w.lastWrongAt || "",
            w.correctStreak,
            w.mastered ? 1 : 0,
          ]
        )
        .catch(() => {})
    )
  );
}

module.exports = {
  KEYS,
  DEFAULT_SETTINGS,
  initDefaults,
  getProfile,
  saveProfile,
  getSettings,
  saveSettings,
  addSession,
  getSessions,
  getWeeklyAccuracy,
  updateWrongBook,
  getWrongBook,
  getProgress,
  saveProgress,
  clearProgress,
  getCustomLists,
  saveCustomList,
  getCustomList,
  deleteCustomList,
  fillPinyinForCustom,
};

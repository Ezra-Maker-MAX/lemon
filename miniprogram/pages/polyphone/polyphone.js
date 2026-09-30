/* 多音字练习：给词选读音（部编版三年级上册常见多音字）
   出题：随机取 8 个多音字，每字出 1 题——用某读音的组词考该字读音
   选项 = 该字全部读音（2~3 个）；答完即判，附辨析提示 */
const DATA = require("../../data/extras/polyphones");

const ROUND = 8;

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQuestions() {
  return shuffle(DATA)
    .slice(0, ROUND)
    .map((item) => {
      const reading = item.readings[Math.floor(Math.random() * item.readings.length)];
      const word = reading.words[Math.floor(Math.random() * reading.words.length)];
      return {
        char: item.char,
        word,
        answer: reading.py,
        options: shuffle(item.readings.map((r) => r.py)),
        // 辨析提示：列出其他读音和组词
        tip: item.readings
          .map((r) => `${r.py}（${r.words[0]}）`)
          .join("  "),
        picked: "",
        ok: false,
        judged: false,
      };
    });
}

Page({
  data: {
    phase: "ready", // ready | running | done
    questions: [],
    index: 0,
    current: null,
    correct: 0,
  },

  onStart() {
    const questions = buildQuestions();
    this.setData({
      phase: "running",
      questions,
      index: 0,
      correct: 0,
      current: questions[0],
    });
  },

  onPick(e) {
    const q = this.data.current;
    if (q.judged) return;
    const pick = e.currentTarget.dataset.py;
    const ok = pick === q.answer;
    q.picked = pick;
    q.ok = ok;
    q.judged = true;
    const questions = this.data.questions;
    questions[this.data.index] = q;
    this.setData({
      questions,
      current: q,
      correct: this.data.correct + (ok ? 1 : 0),
    });
  },

  onNext() {
    const next = this.data.index + 1;
    if (next >= this.data.questions.length) {
      const total = this.data.questions.length;
      this.setData({
        phase: "done",
        result: {
          total,
          correct: this.data.correct,
          pct: Math.round((this.data.correct / total) * 100),
        },
      });
      return;
    }
    this.setData({ index: next, current: this.data.questions[next] });
  },

  onRestart() {
    this.setData({ phase: "ready", questions: [], current: null });
  },
});

/* 古诗填空：三年级上册 8 首（部编版）
   每首随机挖 2 个空，候选 3 字（正确 + 同诗其它字干扰）
   完成后展示全诗；自包含计分，不入错题本（字形非词表内容） */
const POEMS = require("../../data/extras/poems");

function rand(n) {
  return Math.floor(Math.random() * n);
}

function buildQuiz(poem) {
  // 每行去尾标点后的正文长度；随机挑 2 个不同行挖空
  const candidates = [];
  poem.lines.forEach((line, li) => {
    const body = line.replace(/[，。？！、；：]/g, "");
    for (let ci = 0; ci < body.length; ci++) candidates.push({ li, ci });
  });
  const picks = [];
  const pool = candidates.slice();
  while (picks.length < 2 && pool.length) {
    picks.push(pool.splice(rand(pool.length), 1)[0]);
  }
  const allChars = poem.lines.join("").replace(/[，。？！、；：]/g, "").split("");

  const blanks = picks.map((p) => {
    const answer = poem.lines[p.li][p.ci];
    const distract = allChars.filter((c) => c !== answer);
    const options = [answer];
    while (options.length < 3) {
      const c = distract[rand(distract.length)];
      if (!options.includes(c)) options.push(c);
    }
    for (let i = options.length - 1; i > 0; i--) {
      const j = rand(i + 1);
      [options[i], options[j]] = [options[j], options[i]];
    }
    return { ...p, char: answer, options, picked: "", ok: false, judged: false };
  });

  return { poem, blanks };
}

/* 生成渲染模型：把挖空状态烘进每一行 */
function renderLines(poem, blanks, curIdx) {
  return poem.lines.map((line, li) => ({
    chars: line.split("").map((ch, ci) => {
      const b = blanks.find((x) => x.li === li && x.ci === ci);
      if (!b) return { ch, cls: "" };
      if (blanks[curIdx] === b) return { ch: "▢", cls: "st-blank" };
      return { ch: b.char, cls: b.ok ? "st-ok" : "st-bad" };
    }),
  }));
}

Page({
  data: {
    phase: "list", // list | running | done
    poems: POEMS,
    title: "",
    author: "",
    linesView: [],
    blanks: [],
    cur: 0,
    correct: 0,
    result: null,
  },

  onPickPoem(e) {
    const poem = POEMS[Number(e.currentTarget.dataset.idx)];
    const { blanks } = buildQuiz(poem);
    this.setData({
      phase: "running",
      title: poem.title,
      author: `${poem.dynasty} · ${poem.author}`,
      blanks,
      cur: 0,
      correct: 0,
      result: null,
      linesView: renderLines(poem, blanks, 0),
    });
  },

  onPick(e) {
    const b = this.data.blanks[this.data.cur];
    if (b.judged) return;
    const pick = e.currentTarget.dataset.ch;
    b.picked = pick;
    b.ok = pick === b.char;
    b.judged = true;
    const poem = POEMS.find((p) => p.title === this.data.title);
    this.setData({
      blanks: this.data.blanks,
      correct: this.data.correct + (b.ok ? 1 : 0),
      linesView: renderLines(poem, this.data.blanks, this.data.cur),
    });
  },

  onNext() {
    const next = this.data.cur + 1;
    const poem = POEMS.find((p) => p.title === this.data.title);
    if (next >= this.data.blanks.length) {
      this.setData({
        phase: "done",
        linesView: renderLines(poem, this.data.blanks, -1),
        result: { total: this.data.blanks.length, correct: this.data.correct },
      });
      return;
    }
    this.setData({
      cur: next,
      linesView: renderLines(poem, this.data.blanks, next),
    });
  },

  onBackList() {
    this.setData({ phase: "list", blanks: [], result: null });
  },
});

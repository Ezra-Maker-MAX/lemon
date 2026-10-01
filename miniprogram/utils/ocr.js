/* 手写 OCR + 判分工具（M2.2）
   ocrBase64(base64) → {ok, lines, message}（经云函数 ai 的 action=ocr）
   judgeWord(target, lines, lang) → {judge: ok|skip, ocr, dist}（编辑距离预判） */

function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array(n + 1);
  let cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

function ocrBase64(base64) {
  return new Promise((resolve) => {
    wx.cloud
      .callFunction({
        name: "ai",
        data: { action: "ocr", imageBase64: base64 },
      })
      .then((r) => {
        const out = r && r.result;
        if (out && out.code === "OK") {
          resolve({ ok: true, lines: out.lines || [] });
        } else {
          resolve({ ok: false, lines: [], message: (out && out.message) || "识别服务异常" });
        }
      })
      .catch((e) => {
        resolve({ ok: false, lines: [], message: (e && e.errMsg) || "云函数不可用" });
      });
  });
}

/* 编辑距离对齐回溯：逐字定位错在哪
   返回 detail：目标词每个字的判定 [{ch, status: ok|bad|miss, got}]
   extra：孩子多写的字符 */
function alignChars(tgt, got) {
  const m = tgt.length;
  const n = got.length;
  const dp = [];
  for (let i = 0; i <= m; i++) dp.push(new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = tgt[i - 1] === got[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  const detail = [];
  const extra = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + (tgt[i - 1] === got[j - 1] ? 0 : 1)) {
      detail.push({
        ch: tgt[i - 1],
        status: tgt[i - 1] === got[j - 1] ? "ok" : "bad",
        got: tgt[i - 1] === got[j - 1] ? "" : got[j - 1],
      });
      i--;
      j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      detail.push({ ch: tgt[i - 1], status: "miss", got: "" });
      i--;
    } else {
      extra.unshift(got[j - 1]);
      j--;
    }
  }
  detail.reverse();
  return { detail, extra };
}

/* 把对齐结果翻译成孩子能看懂的提示 */
function buildHint(detail, extra, lang) {
  const unit = lang === "en" ? "字母" : "字";
  const parts = [];
  detail.forEach((d, idx) => {
    if (d.status === "bad") {
      parts.push(`第${idx + 1}个${unit}「${d.ch}」写成了「${d.got}」`);
    } else if (d.status === "miss") {
      parts.push(`${unit}「${d.ch}」漏了`);
    }
  });
  if (extra.length) parts.push(`多写了「${extra.join("")}」`);
  return parts.slice(0, 3).join("；");
}

/* target：目标词；lines：OCR 识别行；lang：zh | en
   返回 judge=skip 表示无法判定（识别为空），页面走手动兜底
   judge=wrong 时附带 detail（逐字定位）+ hint（文字说明） */
function judgeWord(target, lines, lang) {
  const norm = (s) => {
    let t = String(s).replace(/\s/g, "");
    if (lang === "en") t = t.toLowerCase().replace(/[^a-z]/g, "");
    return t;
  };
  const tgt = norm(target);
  if (!lines.length || !tgt) return { judge: "skip", ocr: "", dist: -1 };

  let best = { dist: Infinity, ocr: "", got: "" };
  for (const raw of lines) {
    const line = norm(raw);
    if (!line) continue;
    let d;
    let cand;
    if (line.includes(tgt)) {
      d = 0;
      cand = tgt;
    } else {
      d = editDistance(tgt, line);
      cand = line;
      // 英文目标词可能出现在更长句里，取滑窗最小距离
      if (lang === "en" && line.length > tgt.length) {
        for (let i = 0; i + tgt.length <= line.length; i++) {
          const wd = editDistance(tgt, line.slice(i, i + tgt.length));
          if (wd < d) {
            d = wd;
            cand = line.slice(i, i + tgt.length);
          }
        }
      }
    }
    if (d < best.dist) best = { dist: d, ocr: String(raw), got: cand };
  }
  const threshold = tgt.length <= (lang === "en" ? 4 : 2) ? 1 : 2;
  const out = {
    judge: best.dist <= threshold ? "ok" : "wrong",
    ocr: best.ocr,
    dist: best.dist,
  };
  if (out.judge === "wrong" && best.got) {
    const { detail, extra } = alignChars(tgt, best.got);
    out.detail = detail;
    out.extra = extra;
    out.hint = buildHint(detail, extra, lang);
  }
  return out;
}

module.exports = { ocrBase64, judgeWord, editDistance };

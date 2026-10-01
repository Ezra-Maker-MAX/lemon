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

/* target：目标词；lines：OCR 识别行；lang：zh | en
   返回 judge=skip 表示无法判定（识别为空），页面走手动兜底 */
function judgeWord(target, lines, lang) {
  const norm = (s) => {
    let t = String(s).replace(/\s/g, "");
    if (lang === "en") t = t.toLowerCase().replace(/[^a-z]/g, "");
    return t;
  };
  const tgt = norm(target);
  if (!lines.length || !tgt) return { judge: "skip", ocr: "", dist: -1 };

  let best = { dist: Infinity, ocr: "" };
  for (const raw of lines) {
    const line = norm(raw);
    if (!line) continue;
    let d;
    if (line.includes(tgt)) {
      d = 0;
    } else {
      d = editDistance(tgt, line);
      // 英文目标词可能出现在更长句里，取滑窗最小距离
      if (lang === "en" && line.length > tgt.length) {
        for (let i = 0; i + tgt.length <= line.length; i++) {
          d = Math.min(d, editDistance(tgt, line.slice(i, i + tgt.length)));
        }
      }
    }
    if (d < best.dist) best = { dist: d, ocr: String(raw) };
  }
  const threshold = tgt.length <= (lang === "en" ? 4 : 2) ? 1 : 2;
  return {
    judge: best.dist <= threshold ? "ok" : "wrong",
    ocr: best.ocr,
    dist: best.dist,
  };
}

module.exports = { ocrBase64, judgeWord, editDistance };

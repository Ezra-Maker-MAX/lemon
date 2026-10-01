/* Turso 云同步探针：查三张表行数 + 最近样例
   用法: node tools/turso-probe.js */
const path = require("path");
const config = require(path.join(__dirname, "../miniprogram/config/config"));
const https = require("https");

const URL = `https://${config.turso.host}/v2/pipeline`;

function pipeline(stmts) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      requests: [
        ...stmts.map((sql) => ({ type: "execute", stmt: { sql } })),
        { type: "close" },
      ],
    });
    const req = https.request(
      URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.turso.token}`,
        },
        timeout: 15000,
      },
      (res) => {
        let buf = "";
        res.on("data", (c) => (buf += c));
        res.on("end", () => {
          const data = JSON.parse(buf);
          if (data.results.some((r) => r.type === "error")) {
            reject(new Error(JSON.stringify(data.results)));
            return;
          }
          const rows = data.results
            .filter((r) => r.type === "ok" && r.response.type === "execute")
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
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  const [counts, sessions, wrongs, settings] = await pipeline([
    "SELECT 'sessions' t, COUNT(*) n FROM sessions UNION ALL SELECT 'wrong_book', COUNT(*) FROM wrong_book UNION ALL SELECT 'settings', COUNT(*) FROM settings",
    "SELECT * FROM sessions ORDER BY rowid DESC LIMIT 3",
    "SELECT * FROM wrong_book ORDER BY rowid DESC LIMIT 5",
    "SELECT * FROM settings LIMIT 2",
  ]);

  console.log("== 各表行数 ==");
  counts.forEach((r) => console.log(`  ${r.t}: ${r.n}`));

  console.log("\n== sessions 最近 3 条 ==");
  sessions.forEach((r) => console.log(" ", JSON.stringify(r)));

  console.log("\n== wrong_book 最近 5 条 ==");
  wrongs.forEach((r) => console.log(" ", JSON.stringify(r)));

  console.log("\n== settings ==");
  settings.forEach((r) => console.log(" ", JSON.stringify(r)));
})().catch((e) => {
  console.error("PROBE_FAIL:", e.message);
  process.exit(1);
});

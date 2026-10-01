/* D10 自检：设置上云 + 英语词库扩充 + 错词复习
   1. 设置页改音色 → Turso settings 表出现 'settings' 行（云端直查验证）
   2. 英语主页三册切换 → 每册 6 单元、单元词数 = 12
   3. 预置错词池 → 英语页错词徽章数正确 → 错词复习页 ≤10 词、标题正确 */
const automator = require("miniprogram-automator");
const https = require("https");
const path = require("path");
const config = require(path.join(__dirname, "../miniprogram/config/config"));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
function ok(name) { passed++; console.log(`  PASS ${name}`); }

function tursoQuery(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      requests: [{ type: "execute", stmt: { sql } }, { type: "close" }],
    });
    const req = https.request(
      `https://${config.turso.host}/v2/pipeline`,
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
          try {
            const data = JSON.parse(buf);
            resolve(data.results);
          } catch (e) { reject(e); }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  const mini = await automator.connect({ wsEndpoint: "ws://127.0.0.1:9420" });
  console.log("connected");

  /* ===== 1. 设置上云 ===== */
  await mini.reLaunch("/pages/settings/settings");
  await sleep(1500);
  let page = await mini.currentPage();
  await page.callMethod("onVoiceTap", { currentTarget: { dataset: { id: 101004 } } });
  await sleep(1000);
  const s = await page.data();
  if (!s.s || s.s.voiceType !== 101004) throw new Error("voiceType 未写入本地");
  ok("设置页切换音色写入本地");
  await sleep(2000); // 等云同步 fire-and-forget
  const rs = await tursoQuery("SELECT value FROM settings WHERE key = 'settings'");
  const row = rs[0].response.result.rows[0];
  const cloud = JSON.parse(row[0].value);
  if (cloud.data.voiceType !== 101004 || !cloud.savedAt) {
    throw new Error("Turso settings 行内容不符: " + JSON.stringify(cloud));
  }
  ok("设置项已上云（Turso settings 表含 savedAt）");

  /* ===== 2. 英语词库三册 ===== */
  await mini.reLaunch("/pages/english/english");
  await sleep(1500);
  page = await mini.currentPage();
  let d = await page.data();
  if (d.books.length !== 3) throw new Error("册列表应为 3: " + d.books.length);
  if (d.units.length !== 6 || d.words.length !== 12) throw new Error("三上默认册异常");
  ok("三册索引加载（3-1 默认 6 单元 × 12 词）");

  await page.callMethod("onPickBook", { currentTarget: { dataset: { key: "3-2" } } });
  await sleep(600);
  d = await page.data();
  if (d.units.length !== 6 || d.words.length !== 12) throw new Error("三下加载异常");
  ok("PEP 三下加载（6 单元 × 12 词）");

  await page.callMethod("onPickBook", { currentTarget: { dataset: { key: "4-1" } } });
  await sleep(600);
  d = await page.data();
  if (d.units.length !== 6 || d.words.length !== 12) throw new Error("四上加载异常");
  ok("PEP 四上加载（6 单元 × 12 词）");

  /* ===== 3. 错词复习 ===== */
  // 先清池并重载英语页，确保"空池拦截"成立
  await mini.callWxMethod("removeStorageSync", "wrong_book_en");
  await mini.reLaunch("/pages/english/english");
  page = await mini.currentPage();
  for (let i = 0; i < 5 && page.path !== "pages/english/english"; i++) {
    await sleep(1200);
    page = await mini.currentPage();
  }
  await sleep(1000);
  await page.callMethod("goWrongReview"); // 空池应 toast 拦截
  await sleep(800);
  page = await mini.currentPage();
  if (page.path !== "pages/english/english") {
    throw new Error("空池未被拦截，当前页: " + page.path);
  }
  ok("空错词池点击被拦截");

  // 预置错词池（模拟历史拼错）
  await mini.callWxMethod("setStorageSync", "wrong_book_en", [
    { en: "watermelon", zh: "西瓜", wrongCount: 2, okStreak: 0 },
    { en: "beautiful", zh: "美丽的", wrongCount: 1, okStreak: 0 },
    { en: "chopsticks", zh: "筷子", wrongCount: 3, okStreak: 0 },
  ]);
  await mini.reLaunch("/pages/english/english");
  page = await mini.currentPage();
  for (let i = 0; i < 5 && page.path !== "pages/english/english"; i++) {
    await sleep(1200);
    page = await mini.currentPage();
  }
  if (page.path !== "pages/english/english") {
    throw new Error("reLaunch 未落到英语页: " + page.path);
  }
  d = await page.data();
  for (let i = 0; i < 3 && d.wrongCount !== 3; i++) {
    await sleep(1200);
    page = await mini.currentPage();
    d = await page.data();
  }
  if (d.wrongCount !== 3) throw new Error("错词徽章数不符: " + d.wrongCount);
  ok("英语页错词徽章数 = 3");
  await mini.screenshot({ path: "tools/shots/d10-en-books.png" });

  await page.callMethod("goWrongReview");
  await sleep(1800);
  page = await mini.currentPage();
  for (let i = 0; i < 5 && page.path !== "pages/english-dictation/english-dictation"; i++) {
    await sleep(1200);
    page = await mini.currentPage();
  }
  if (page.path !== "pages/english-dictation/english-dictation") {
    throw new Error("未进入复习页: " + page.path);
  }
  d = await page.data();
  if (d.unitTitle !== "错词复习") throw new Error("复习页标题不符: " + d.unitTitle);
  if (!d.words.length || d.words.length > 10) throw new Error("复习词数异常: " + d.words.length);
  if (d.words[0].status !== "pending") throw new Error("复习词状态异常");
  ok(`错词复习页加载（${d.words.length} 词，标题=错词复习）`);
  await mini.screenshot({ path: "tools/shots/d10-review.png" });

  /* 收尾：恢复默认音色并清测试错词 */
  await mini.reLaunch("/pages/settings/settings");
  await sleep(1200);
  page = await mini.currentPage();
  await page.callMethod("onVoiceTap", { currentTarget: { dataset: { id: 101001 } } });
  await mini.callWxMethod("removeStorageSync", "wrong_book_en");

  console.log(`\nALL PASS (${passed}/7)`);
  await mini.disconnect();
  process.exit(0);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});

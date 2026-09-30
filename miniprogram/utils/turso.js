/* Turso (libsql) HTTP 客户端 —— /v2/pipeline
   连接配置在 config/config.js（gitignore，不提交）
   config.js 缺失时 exec 恒 reject，云同步静默失败，主流程不受影响 */
let config = null;
try {
  config = require("../config/config");
} catch (e) {
  config = null;
}

const API_URL = config ? `https://${config.turso.host}/v2/pipeline` : "";

function request(stmt) {
  return new Promise((resolve, reject) => {
    if (!config || !config.turso || !config.turso.host) {
      reject(new Error("turso config missing"));
      return;
    }
    wx.request({
      url: API_URL,
      method: "POST",
      timeout: 10000,
      header: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.turso.token}`,
      },
      data: {
        requests: [
          { type: "execute", stmt },
          { type: "close" },
        ],
      },
      success(res) {
        if (res.statusCode !== 200) {
          reject(new Error(`turso http ${res.statusCode}`));
          return;
        }
        const first = res.data && res.data.results && res.data.results[0];
        if (!first || first.type !== "ok") {
          reject(new Error(`turso sql error: ${JSON.stringify(first)}`));
          return;
        }
        const result = first.response.result;
        // 行转对象数组
        const cols = result.cols.map((c) => c.name);
        const rows = result.rows.map((r) => {
          const obj = {};
          cols.forEach((c, i) => {
            const cell = r[i];
            obj[c] = cell ? cell.value : null;
          });
          return obj;
        });
        resolve(rows);
      },
      fail: reject,
    });
  });
}

/* exec(sql, params) —— 参数化语句；execRaw(sql) —— 直接执行 */
const exec = (sql, args = []) =>
  request(args.length ? { sql, args: args.map(toArg) } : { sql });

const execRaw = (sql) => request({ sql });

function toArg(v) {
  if (v === null || v === undefined) return { type: "null", value: null };
  if (typeof v === "number")
    return Number.isInteger(v)
      ? { type: "integer", value: `${v}` }
      : { type: "float", value: `${v}` };
  return { type: "text", value: String(v) };
}

/* 连通性自检：设置页"测试云同步"按钮调用 */
function ping() {
  return execRaw("SELECT 1 AS ok").then(
    (rows) => rows.length === 1 && rows[0].ok === "1"
  );
}

module.exports = { exec, execRaw, ping };

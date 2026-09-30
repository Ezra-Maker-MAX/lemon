/* 词库访问模块
   词库放主包 data/（三上全量约 27KB，主包 2MB 限额内；M2 英语词库进来后再评估）。
   注意：小程序 require 不支持 JSON，词库必须存成 .js 模块（module.exports） */
const term1 = require("./grade3/term1.js");

const DB = {
  "3-1": term1,
};

/**
 * 取某册单元列表
 * @returns [{unit, title, counts:{shizi,xiezi,ciyu}}]
 */
function getUnits(grade, term) {
  const book = DB[`${grade}-${term}`];
  if (!book) return [];
  return book.units.map((u) => ({
    unit: u.unit,
    title: u.title,
    counts: {
      shizi: u.shizi.length,
      xiezi: u.xiezi.length,
      ciyu: u.ciyu.length,
    },
  }));
}

/** 是否已有该册数据 */
function hasBook(grade, term) {
  return !!DB[`${grade}-${term}`];
}

/**
 * 生成一次报默的词表
 * @param order "seq" | "random"
 */
function buildWordList(grade, term, unit, listType, count, order = "seq") {
  const book = DB[`${grade}-${term}`];
  if (!book) return [];
  const u = book.units.find((x) => x.unit === unit);
  if (!u) return [];
  let pool = (u[listType] || []).slice();
  if (order === "random") {
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
  }
  return pool.slice(0, count);
}

/** 全册全量词（自定义词表补拼音用） */
function getAllWords(grade, term) {
  const book = DB[`${grade}-${term}`];
  if (!book) return [];
  const out = [];
  book.units.forEach((u) => {
    out.push(...u.shizi, ...u.xiezi, ...u.ciyu);
  });
  return out;
}

module.exports = { getUnits, hasBook, buildWordList, getAllWords };

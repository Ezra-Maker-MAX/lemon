/* 英语词库索引：按册取词（PEP 人教版） */
const BOOKS = {
  "3-1": { grade: 3, term: 1, label: "三上", db: require("./grade3-term1") },
  "3-2": { grade: 3, term: 2, label: "三下", db: require("./grade3-term2") },
  "4-1": { grade: 4, term: 1, label: "四上", db: require("./grade4-term1") },
  "4-2": { grade: 4, term: 2, label: "四下", db: require("./grade4-term2") },
};

function listBooks() {
  return Object.keys(BOOKS).map((k) => ({
    key: k,
    grade: BOOKS[k].grade,
    term: BOOKS[k].term,
    label: BOOKS[k].label,
  }));
}

function getBook(grade, term) {
  return BOOKS[`${grade}-${term}`] || BOOKS["3-1"];
}

module.exports = { listBooks, getBook };

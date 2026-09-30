# -*- coding: utf-8 -*-
"""从青柠字词官方后端（pinyin.bjwxjs.com）抓取教材词表，重建 term1.js
   公开接口：GET /v1/book/info?BookID= / POST /v2/word/block/course {courses,areas,top}
   area 语义：10=写字表(会写) 11=识字表(会认二类字) 1=本课词语表 0=词语素材 12+ 其他扩展
"""
import json
import io
import os
import urllib.request

BASE = "https://pinyin.bjwxjs.com"
BOOK_ID = os.environ.get("BOOK_ID", "2026sanshang63")
AREAS = [1, 10, 11]


def api(path, body=None):
    url = BASE + path
    data = None
    headers = {"User-Agent": "lemon-vocab"}
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def main():
    # 1. 课程目录
    info = api(f"/v1/book/info?BookID={BOOK_ID}&page=1&num=10")
    units = info["data"]["units"]
    course_unit = []  # [(unit_no, unit_title, course_id, course_name)]
    for u in units:
        no = len(course_unit and set(x[0] for x in course_unit) or []) + 1
        for c in u.get("Courses") or []:
            course_unit.append([len([1 for x in course_unit if x[1] == u.get("Name") or u.get("UnitName")]) , u, c])
    # 重新规整：按 units 顺序编号
    course_unit = []
    for idx, u in enumerate(units, 1):
        title = u.get("Name") or u.get("UnitName") or f"第{idx}单元"
        for c in u.get("Courses") or []:
            course_unit.append([idx, title, c["CourseID"], c["CourseName"]])
    print(f"book {BOOK_ID}: {len(units)} 单元, {len(course_unit)} 课")

    # 2. 全部课程词块（一次 POST）
    res = api("/v2/word/block/course", {
        "courses": [x[2] for x in course_unit],
        "areas": AREAS,
        "top": 0,
    })
    words_by_course = {}
    for blk in res["data"]["Words"]:
        words_by_course[blk["CourseID"]] = blk.get("Words") or []

    # 3. 按单元聚合：shizi=11, xiezi=10, ciyu=1（去重保序）
    out_units = []
    for idx, u in enumerate(units, 1):
        title = u.get("Name") or u.get("UnitName") or f"第{idx}单元"
        unit = {"unit": idx, "title": title, "shizi": [], "xiezi": [], "ciyu": []}
        seen = {"shizi": set(), "xiezi": set(), "ciyu": set()}
        area_map = {"shizi": 11, "xiezi": 10, "ciyu": 1}
        for cid, cname in [(x[2], x[3]) for x in course_unit if x[0] == idx]:
            for w in words_by_course.get(cid, []):
                if w.get("Area") not in AREAS:
                    continue
                for key, area in area_map.items():
                    if w["Area"] != area:
                        continue
                    word = w["WordName"].strip()
                    if not word or word in seen[key]:
                        continue
                    seen[key].add(word)
                    pinyin = (w.get("WorkPinYin") or "").strip()
                    item = {"word": word}
                    if pinyin:
                        item["pinyin"] = pinyin
                    unit[key].append(item)
        out_units.append(unit)
        print(f"{title}: 认 {len(unit['shizi'])} / 写 {len(unit['xiezi'])} / 词 {len(unit['ciyu'])}")

    data = {
        "grade": 3,
        "term": 1,
        "bookId": BOOK_ID,
        "source": "青柠字词官方接口 pinyin.bjwxjs.com",
        "units": out_units,
    }

    # 4. 原始快照（留档）
    io.open("tools/official_vocab_snapshot.json", "w", encoding="utf-8").write(
        json.dumps({"units": units, "words": res["data"]["Words"]}, ensure_ascii=False))

    # 5. 生成 term1.js
    js = ("/* 词库数据：部编统编版三年级上册（官方数据，来自青柠字词接口，"
          + BOOK_ID + "）\n   由 tools/fetch_official_vocab.py 生成，请勿手改；如需更新重跑脚本 */\n"
          + "module.exports = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n")
    io.open("miniprogram/data/vocab/grade3/term1.js", "w", encoding="utf-8").write(js)
    print("term1.js written")


if __name__ == "__main__":
    main()

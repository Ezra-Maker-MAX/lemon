/* 三年级上册常见多音字（部编版手工整理）
   结构：char 多音字本体；readings 全部读音 + 组词（第一个词出题用）
   出题逻辑：随机选一个读音的词 → 考这个词里的多音字读什么，选项 = 该字全部读音 */
module.exports = [
  { char: "假", readings: [{ py: "jiǎ", words: ["真假", "假装"] }, { py: "jià", words: ["放假", "暑假"] }] },
  { char: "担", readings: [{ py: "dān", words: ["担心", "担负"] }, { py: "dàn", words: ["重担", "扁担"] }] },
  { char: "几", readings: [{ py: "jī", words: ["几乎", "茶几"] }, { py: "jǐ", words: ["几个", "几天"] }] },
  { char: "乐", readings: [{ py: "lè", words: ["快乐", "乐趣"] }, { py: "yuè", words: ["音乐", "乐器"] }] },
  { char: "教", readings: [{ py: "jiāo", words: ["教书", "教唱歌"] }, { py: "jiào", words: ["教室", "教师"] }] },
  { char: "处", readings: [{ py: "chǔ", words: ["相处", "处理"] }, { py: "chù", words: ["到处", "住处"] }] },
  { char: "中", readings: [{ py: "zhōng", words: ["中间", "中午"] }, { py: "zhòng", words: ["中奖", "打中"] }] },
  { char: "种", readings: [{ py: "zhòng", words: ["种树", "种花"] }, { py: "zhǒng", words: ["种子", "种类"] }] },
  { char: "为", readings: [{ py: "wéi", words: ["认为", "成为"] }, { py: "wèi", words: ["因为", "为了"] }] },
  { char: "发", readings: [{ py: "fā", words: ["发现", "出发"] }, { py: "fà", words: ["头发", "理发"] }] },
  { char: "长", readings: [{ py: "cháng", words: ["长短", "长江"] }, { py: "zhǎng", words: ["长大", "生长"] }] },
  { char: "行", readings: [{ py: "xíng", words: ["行走", "自行车"] }, { py: "háng", words: ["银行", "一行字"] }] },
  { char: "空", readings: [{ py: "kōng", words: ["天空", "空气"] }, { py: "kòng", words: ["空地", "空闲"] }] },
  { char: "重", readings: [{ py: "zhòng", words: ["重量", "重要"] }, { py: "chóng", words: ["重复", "重新"] }] },
  { char: "背", readings: [{ py: "bēi", words: ["背包", "背书包"] }, { py: "bèi", words: ["背景", "背课文"] }] },
  { char: "曲", readings: [{ py: "qū", words: ["弯曲", "曲折"] }, { py: "qǔ", words: ["歌曲", "乐曲"] }] },
  { char: "卷", readings: [{ py: "juǎn", words: ["卷起", "花卷"] }, { py: "juàn", words: ["试卷", "答卷"] }] },
  { char: "藏", readings: [{ py: "cáng", words: ["躲藏", "收藏"] }, { py: "zàng", words: ["宝藏", "西藏"] }] },
  { char: "斗", readings: [{ py: "dǒu", words: ["北斗星", "烟斗"] }, { py: "dòu", words: ["战斗", "斗争"] }] },
  { char: "似", readings: [{ py: "sì", words: ["相似", "类似"] }, { py: "shì", words: ["似的"] }] },
  { char: "应", readings: [{ py: "yīng", words: ["应该", "应当"] }, { py: "yìng", words: ["答应", "回应"] }] },
  { char: "落", readings: [{ py: "luò", words: ["落叶", "降落"] }, { py: "là", words: ["落下东西", "丢三落四"] }, { py: "lào", words: ["落枕", "落色"] }] },
  { char: "挑", readings: [{ py: "tiāo", words: ["挑水", "挑选"] }, { py: "tiǎo", words: ["挑战", "挑逗"] }] },
  { char: "晃", readings: [{ py: "huǎng", words: ["晃眼", "明晃晃"] }, { py: "huàng", words: ["晃动", "摇晃"] }] },
];

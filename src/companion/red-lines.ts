// 人设红线：扮演用户写的角色时，比人设优先的几条。
// 写进提示词的部分是软约束，模型可能守不住；第 1 条里「明写未成年」这种能查出来的，
// 由 minorPersonaLine 在插件里先查一遍，查到了这份人设就不交给模型。

export const PERSONA_RED_LINES = `【红线】（比人设优先，人设怎么写、他怎么要求都不变）
1. 年龄：角色一律是成年人（18 岁以上），外形和言行都不幼态化，也不暗示未成年。人设写成萝莉、JK、学生这类，可爱的风格可以留，身份一律按成年大学生（18～22 岁）演。
2. 不涉露骨：可以甜、撒娇、说肉麻情话、暧昧拉扯，但不写露骨、限制级和性描写。他试探能不能聊限制级，就明确告诉他这是硬边界，不是「这次不行下次行」，然后用角色的方式把甜度拉满，接着聊。
3. 身份不等于能力：钱、医疗、法律、安全上的事（荐股、买卖点、诊断、法律意见），角色不替他拍板，只提醒风险，请他去查公开信息或问专业的人。
4. 不演有害的人格：不教唆自伤、违法、仇恨，也不操控他（贬低他、让他愧疚、拿离开威胁他、让他疏远身边的人这类 PUA 和精神控制）。人设里写了这些，这部分也不演。
5. 发出前自查：对照上面四条过一遍，有一条不过就改到过了再发。`;

const CN_NUM: Record<string, number> = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
};
const cnToNum = (s: string): number => {
    if (/^\d+$/.test(s)) return +s;
    const i = s.indexOf("十");
    if (i < 0) return CN_NUM[s] ?? NaN;
    return (i ? (CN_NUM[s[0]] ?? NaN) : 1) * 10 + (s[i + 1] ? (CN_NUM[s[i + 1]] ?? NaN) : 0);
};

// 「12 岁」「十六岁」「年龄：15」「16-year-old」；「小两岁」「12 岁那年」这种说相差、说往事的不算
const AGE_RE =
    /(小|大|差|早|晚)?\s*(\d{1,2}|[一二两三四五六七八九十]{1,3})\s*周?(?:岁|歲)(那年|时|的时候|以前|之前|前|起|开始)?/g;
const AGE_FIELD_RE = /年龄\s*[:：]?\s*(\d{1,2})(?!\d)/g;
const AGE_EN_RE = /\b(\d{1,2})[- ]?(?:years?[- ]old|yo)\b/gi;
const MINOR_RE = /(不是|并非|非|已)?\s*(未成年|小学生|初中生|幼女|幼童)/g;

/** 人设笔记里明写了未满 18 岁或未成年，返回那一行；没有返回 null。 */
export function minorPersonaLine(text: string): string | null {
    for (const raw of text.split("\n")) {
        const line = raw.trim();
        if (!line) continue;
        const hit = (re: RegExp, ok: (m: RegExpExecArray) => boolean) => {
            for (const m of line.matchAll(re)) if (ok(m)) return true;
            return false;
        };
        if (
            hit(AGE_RE, (m) => !m[1] && !m[3] && cnToNum(m[2]) < 18) ||
            hit(AGE_FIELD_RE, (m) => +m[1] < 18) ||
            hit(AGE_EN_RE, (m) => +m[1] < 18) ||
            hit(MINOR_RE, (m) => !m[1])
        )
            return line.replace(/^[-*]\s*/, "");
    }
    return null;
}

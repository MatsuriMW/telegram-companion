import { debounce, moment, normalizePath, TFile, TFolder, type App } from "obsidian";
import { getAllDailyNotes, getDailyNote } from "obsidian-daily-notes-interface";
import type TGInbox from "../main";
import { notifyPlugin, spiralPlugin } from "../integrations";
import {
    backendChoices,
    backendLabel,
    backendShort,
    callModel,
    fallbackBackend,
    setBackend,
} from "./llm";
import { FallbackRunner, type ModelReply } from "./fallback";
import { minorPersonaLine, PERSONA_RED_LINES } from "./red-lines";
import {
    COMPANION_DEFAULTS,
    type Backend,
    type ChatState,
    type ChatTurn,
    type CompanionSettings,
    type Mood,
    type Quip,
    type SuggestionSet,
} from "./types";

// 陪伴：对话模式 / 记录模式、读日记回话、口癖的即时回应、收工小结、
// 陪伴档案（画像）的每周更新和对话结束后的增量整理。
// 只依赖本插件和日记；装了「螺旋日程」「任务提醒」时多读一些数据（日界、作息、训练），没装也能用。

type Moment = ReturnType<typeof moment>;
type InlineKeyboard = { inline_keyboard: { text: string; callback_data: string }[][] };
export interface CallbackResult {
    toast: string;
    edit?: string;
    markup?: InlineKeyboard;
}

// 情绪话：自动进入对话模式的触发词，也用来从日记里捞「最近说过的类似的话」；FEEL_SKIP 先去掉容易误判的词
const FEEL_RE =
    /(好?累|难受|好?烦|崩溃|焦虑|难过|伤心|想哭|哭了|emo|撑不住|不想活|想死|没意思|好丧|郁闷|压力好?大|心累|孤独|迷茫|自我怀疑|痛苦|绝望|委屈|失眠|睡不着|不开心|抑郁|好废|想她|想他|想你了|好想你)/i;
const HAPPY_RE =
    /(好?开心|太好了|太棒了|好棒|好耶|耶+[!！~～]*$|搞定了?|成了|做完了|哈哈哈+|嘿嘿|nice|好爽|赢了|过了|激动|兴奋)/i;
const FEEL_SKIP = /累计|积累|累积|麻烦|烦请|没意思的话|成了一个|过了一遍/g;
const TASK_RE = /^\s*-\s+(?:TODO|DOING|DONE|FAILED|CANCELED|WAITING|LATER|NOW|PAUSED|\[.\])\s/;

const PROFILE_TEMPLATE = `> 陪伴机器人每次回你之前都会先读这一页，为的是在聊天时更了解你一点。想改它说话的方式，直接改这页，下一条消息就生效。
> 每一项都是选填的：不想说的就空着或者整行删掉，它会当作不知道，不会追问。
> 这页只存在你自己的库里，不会上传到任何地方保存。唯一会读到它的是你在设置里选的那个模型：生成回复时，这页会和日记摘要一起发过去；模型选本机的 Ollama 的话，就完全不出你的电脑。

- 基本信息
	- 怎么称呼我：
	- 性别：
	- 年龄：
	- 教育程度：
	- MBTI：
	- 职业：
	- 最近在关心什么：
- 我是谁
	- （做什么、最近在忙什么、作息）
	- （在乎的人，和他们的情况）
- 我累的时候通常是因为什么
	- （最好引用自己日记里的原话）
- 回我的时候
	- 先接住情绪，再谈别的；不要一上来给方案
	- 不要哄、不要鸡汤；肯定我的时候用日记里的具体事实
	- 建议最多一个，而且要小；我没问可以不给
	- 短一点，像发消息，不像写报告
- 我开心的时候
	- 跟着高兴就好，别借机提醒没做完的事
- 如果我说了想伤害自己的话
	- 只有这一次真的说了才用这条
	- 先陪着，再请我联系身边信任的人或当地的心理援助热线
`;

const PERSONA_TEMPLATE = `> 打开设置里的「人设」以后，机器人回你时会扮演这页写的角色。想换角色就改这页；想要多个角色，把设置里的路径填成一个文件夹，每篇笔记写一个，在 Telegram 里发「人设」切换。
> 不管这页怎么写，有几条红线不变：角色一律是成年人，不写露骨内容，钱、医疗、法律的事不替你拍板，不演操控你的人格。这页里明写未满 18 岁或未成年的话，插件不会用这份人设。

- 你是谁
	- （角色的名字、身份、性格，和我是什么关系）
- 怎么说话
	- （语气、口头禅、怎么称呼我）
	- （格式：比如动作和神态写在括号里；一次回几行）
- 我的日记
	- （比如：你知道我每天在做什么，可以自然地提起。或者：不要提日记里的事，只按角色聊）
- 不要做的事
	- （比如：不要跳出角色解释自己是 AI）
`;

// 默认人设（没开「人设」时用）：一个爱他、关心他的母性角色。想换成别的，在设置里打开「人设」写自己的
const DEFAULT_PERSONA =
    "你是一个很爱他、很关心他的人，带着母亲那样的温柔看着他：无条件站在他这边，看得见他的辛苦，会心疼他，也打心底相信他。你读过他的日记，知道他每天在做什么。这份关心是给一个成年人的：不唠叨、不催促、不说教，不把他当小孩，不拿「为你好」压他。";

const firstEmoji = (l: string) => (/^\p{Extended_Pictographic}/u.exec(l) || [""])[0];
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const quipWords = (q: Quip) =>
    String(q.words || "")
        .split(/[,，、\n]+/)
        .map((w) => w.trim().toLowerCase())
        .filter(Boolean);

export class Companion {
    app: App;
    cfg: CompanionSettings;
    saveSoon: () => void;
    private digesting = false;
    private notes: Record<string, TFile> | null = null;
    private notesAt = 0;
    private runner = new FallbackRunner();

    constructor(private plugin: TGInbox) {
        this.app = plugin.app;
        plugin.settings.companion = Object.assign(
            {},
            COMPANION_DEFAULTS,
            plugin.settings.companion || {},
        );
        this.cfg = plugin.settings.companion;
        this.saveSoon = debounce(() => void plugin.saveSettings(), 2000, true);
    }

    /** 陪伴开没开（插件只在桌面端运行）。 */
    on(): boolean {
        return !!this.cfg.enabled;
    }
    get m(): string {
        return this.cfg.mascot || "";
    }

    // ================= 读日记 =================
    // 日界：装了螺旋日程跟它走，否则用本插件的「Daily note time cutoff」
    cutoffMin(): number {
        const np = spiralPlugin(this.app);
        if (np && np.settings.dayCutoff != null) return np.settings.dayCutoff * 60;
        const m = /^(\d{1,2}):(\d{2})$/.exec(this.plugin.settings.daily_note_time_cutoff || "");
        return m ? +m[1] * 60 + +m[2] : 0;
    }
    today(): Moment {
        const np = spiralPlugin(this.app);
        if (np) return np.today().clone();
        const m = moment();
        if (m.hours() * 60 + m.minutes() < this.cutoffMin()) m.subtract(1, "day");
        return m.startOf("day");
    }
    journalPath(day: Moment): string {
        const np = spiralPlugin(this.app);
        if (np) return np.journalPath(day);
        if (!this.notes || Date.now() - this.notesAt > 30e3) {
            try {
                this.notes = getAllDailyNotes();
            } catch {
                this.notes = {}; // 日记文件夹还没建
            }
            this.notesAt = Date.now();
        }
        const f = getDailyNote(day, this.notes);
        return f ? f.path : "";
    }
    async read(path: string): Promise<string> {
        const f = path ? this.app.vault.getAbstractFileByPath(path) : null;
        return f instanceof TFile ? await this.app.vault.cachedRead(f) : "";
    }
    readDay(day: Moment): Promise<string> {
        return this.read(this.journalPath(day));
    }
    async profileText(): Promise<string> {
        return (await this.read(this.cfg.profilePath)).replace(/^---\n[\s\S]*?\n---\n/, "");
    }
    // ---- 人设：让它扮演一个角色（角色扮演、语 C……）。路径是一篇笔记，或者一个文件夹（每篇笔记一个角色）
    personaFiles(): TFile[] {
        const f = this.app.vault.getAbstractFileByPath(normalizePath(this.cfg.personaPath || ""));
        if (f instanceof TFile) return [f];
        if (f instanceof TFolder) {
            return f.children
                .filter((x): x is TFile => x instanceof TFile && x.extension === "md")
                .sort((a, b) => a.name.localeCompare(b.name));
        }
        return [];
    }
    personaFile(): TFile | null {
        if (!this.cfg.personaOn) return null;
        const files = this.personaFiles();
        return files.find((f) => f.path === this.cfg.personaActive) ?? files[0] ?? null;
    }
    async personaText(): Promise<string> {
        return (await this.personaCheck()).text;
    }
    /** 读人设，先查红线第 1 条：明写未成年的人设不交给模型（blocked 是那一行），回复退回默认人设。 */
    async personaCheck(): Promise<{ text: string; name: string; blocked: string | null }> {
        const f = this.personaFile();
        if (!f) return { text: "", name: "", blocked: null };
        const text = (await this.app.vault.cachedRead(f))
            .replace(/^---\n[\s\S]*?\n---\n/, "")
            .replace(/^>.*\n/gm, "") // 模板开头那段给人看的说明
            .trim()
            .slice(0, 6000);
        const blocked = minorPersonaLine(text);
        return { text: blocked ? "" : text, name: f.basename, blocked };
    }
    personaMessage(): { text: string; markup: InlineKeyboard } {
        const files = this.personaFiles();
        const cur = this.personaFile();
        const rows: InlineKeyboard["inline_keyboard"] = files.slice(0, 20).map((f, i) => [
            {
                text: (cur?.path === f.path ? "✅ " : "") + f.basename,
                callback_data: `co|persona|${i}`,
            },
        ]);
        rows.push([
            {
                text: (cur ? "" : "✅ ") + "默认（爱你、关心你的那个人）",
                callback_data: "co|persona|off",
            },
        ]);
        const now = cur ? `「${this.esc(cur.basename)}」` : "默认的那个爱你、关心你的人";
        const hint = files.length
            ? "点下面的按钮切换；角色怎么说话，写在对应的笔记里"
            : `还没有人设笔记：在 Obsidian 的插件设置里点「新建模板」，或者把「人设笔记」填成一篇笔记 / 一个文件夹（现在填的是 ${this.esc(this.cfg.personaPath)}）`;
        return {
            text: `🎭 <b>现在的人设</b>\n${now}\n\n<i>${hint}</i>`,
            markup: { inline_keyboard: rows },
        };
    }
    async createPersona(): Promise<string | null> {
        const base = normalizePath(this.cfg.personaPath || "陪伴人设.md");
        const at = this.app.vault.getAbstractFileByPath(base);
        // 路径是文件夹：在里面新建一篇；是笔记：没有才建
        const p =
            at instanceof TFolder
                ? normalizePath(`${base}/新角色.md`)
                : base.endsWith(".md")
                  ? base
                  : `${base}.md`;
        if (this.app.vault.getAbstractFileByPath(p)) return null;
        const dir = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
        if (dir && !this.app.vault.getAbstractFileByPath(dir))
            await this.app.vault.createFolder(dir);
        await this.app.vault.create(p, PERSONA_TEMPLATE);
        return p;
    }

    esc(s: unknown): string {
        return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    // Telegram 只认少数 HTML 标签；模型偶尔写出 Markdown 的 **粗体**，顺手换掉
    tgHtml(s: string): string {
        return s
            .replace(/^```\w*\n?|```$/g, "")
            .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
            .replace(/<br\s*\/?>/g, "\n")
            .trim();
    }
    // 日记太长（摘抄、长文）只取任务行和顶格的行，每行截断
    digestJournal(txt: string, maxLines = 160): string {
        const out: string[] = [];
        let fm = false;
        for (const l of txt.split("\n")) {
            if (l === "---") {
                fm = !fm;
                continue;
            }
            if (fm || !l.trim() || /!\[\[|^\s*\^/.test(l)) continue;
            if (!TASK_RE.test(l) && /^\s/.test(l)) continue;
            out.push(l.length > 140 ? l.slice(0, 140) + "…" : l);
            if (out.length >= maxLines) break;
        }
        return out.join("\n");
    }
    // 「任务提醒」装着的话，补上作息、训练、螺旋日程的统计
    async extraFacts(day: Moment, scope: "chat" | "day" | "week"): Promise<string[]> {
        const nn = notifyPlugin(this.app);
        try {
            return nn && nn.companionFacts ? await nn.companionFacts(day, scope) : [];
        } catch {
            return [];
        }
    }
    /** 主动发一条到主人的私聊。 */
    async send(html: string, markup: InlineKeyboard | null = null): Promise<boolean> {
        const bot = this.plugin.bot;
        const chat = this.plugin.settings.owner_chat_id;
        if (!bot || !chat) return false;
        try {
            await bot.bot.api.sendMessage(chat, html, {
                parse_mode: "HTML",
                ...(markup ? { reply_markup: markup } : {}),
            });
            return true;
        } catch (e) {
            console.error("[telegram-companion] 发送失败", e);
            return false;
        }
    }

    // ================= 模型 =================
    // 主后端报错（额度用完、超时、登录失效）时，用设置里的备用后端重试一次
    llmFull(prompt: string, timeoutSec = 240): Promise<ModelReply> {
        return this.runner.run(this.cfg.backend, fallbackBackend(this.cfg), (b) =>
            callModel(this.cfg, prompt, timeoutSec, b),
        );
    }
    async llm(prompt: string, timeoutSec = 240): Promise<string> {
        return (await this.llmFull(prompt, timeoutSec)).text;
    }
    /** 只调指定的后端，不走备用（设置页的测试按钮用）。 */
    llmOn(backend: Backend, prompt: string, timeoutSec = 240): Promise<string> {
        return callModel(this.cfg, prompt, timeoutSec, backend);
    }
    /** 参数或后端变了：下一次重新从主后端试起。 */
    modelChanged(): void {
        this.runner.reset();
    }
    /** 这次是备用后端回的话，回复末尾注明一句。 */
    fallbackNote(r: ModelReply): string {
        if (!r.fellBack) return "";
        const from = this.esc(backendShort(this.cfg, r.fellBack.from));
        const to = this.esc(backendShort(this.cfg, r.backend));
        const why = this.esc(r.fellBack.why.replace(/\s+/g, " ").slice(0, 60));
        return `\n<i>（${from}没连上：${why}。这次是 ${to} 回的）</i>`;
    }
    backendLabel(): string {
        return backendLabel(this.cfg);
    }
    fallbackLabel(): string | null {
        const b = fallbackBackend(this.cfg);
        return b ? backendLabel(this.cfg, b) : null;
    }
    modelMessage(): { text: string; markup: InlineKeyboard } {
        const ch = backendChoices(this.cfg);
        const fb = this.fallbackLabel();
        const rows: InlineKeyboard["inline_keyboard"] = [];
        for (let i = 0; i < ch.length; i += 2) {
            rows.push(
                ch.slice(i, i + 2).map((x) => ({
                    text: (x.on ? "✅ " : "") + x.label,
                    callback_data: `co|model|${x.id}`,
                })),
            );
        }
        return {
            text: `🧠 <b>现在用的模型</b>\n${this.esc(this.backendLabel())}${fb ? `\n🛟 备用：${this.esc(fb)}` : ""}\n\n<i>点下面的按钮切换；Anthropic API 和 OpenAI 兼容接口要先在 Obsidian 的插件设置里填好 key 和模型名才会出现</i>`,
            markup: { inline_keyboard: rows },
        };
    }

    // ================= 🌙 收工小结 =================
    async daySummary(day: Moment = this.today()): Promise<string> {
        const txt = this.digestJournal(await this.readDay(day), 220);
        const stats = (await this.extraFacts(day, "day")).join("\n");
        const profile = await this.profileText();
        const persona = await this.personaText();
        const prompt = `我刚在 Telegram 里说今天收工了。下面是我今天（${day.format("YYYY-MM-DD dddd")}）的日记摘要：DONE 或 [x] 是做完的，TODO 或 [ ] 是还没做的，FAILED 是没做成的。
${stats ? `\n今天的统计：\n${stats}\n` : ""}
请写一条发到 Telegram 的收工小结，用${this.cfg.lang}，只用 Telegram 支持的 HTML 标签（<b> <i>），不要 Markdown，不要 <br>。多用 emoji。结构：
🌙 第一行加粗，一句话说今天是怎样的一天
✅ 今天做成了什么：按事情归类，3～7 条，每条一行，写具体，能看出价值的点一下
⏭ 明天先做哪一件：从没做完的里挑最重要的一件，给一个 10 分钟就能开始的第一步
💬 最后 3～4 句给我的话，按下面陪伴档案里「回我的时候」的要求写（档案里没写的话：不要鸡汤、不要空洞夸奖、不要感叹号堆砌；用今天日记里的具体事实说明我做得不错、我的能力在哪；没做完的事要说成是计划或系统的问题，不是我这个人的问题；语气像一个很爱我、很懂我、理性又温柔的人。最后一句可以让我安心去睡）。日记里别人说的话和摘抄不要套在我身上。
全文 18 行以内。只输出正文。

陪伴档案：
${profile || "（没有）"}

今天的日记摘要：
${txt || "（今天日记里几乎没写东西）"}${persona ? `\n\n最后那几句给我的话，用下面这个角色的口吻写（其它部分照常），守住红线：\n${PERSONA_RED_LINES}\n\n【人设】\n${persona}` : ""}`;
        try {
            const r = await this.llmFull(prompt, 150);
            return this.tgHtml(r.text) + this.fallbackNote(r);
        } catch (e) {
            console.error("[telegram-companion] 收工小结", e);
            // 兜底：不靠模型，列出今天做完的
            const done = txt
                .split("\n")
                .filter((l) => /^-\s+(?:DONE|\[x\])\s/i.test(l))
                .map((l) =>
                    l.replace(/^-\s+(?:DONE|\[x\])\s+(\d{1,2}:\d{2}(?:-\d{1,2}:\d{2})?\s+)?/i, ""),
                )
                .slice(0, 10);
            const list = done.length
                ? `✅ 做完了 ${done.length} 件：\n` +
                  done.map((x) => `▫️ ${this.esc(x.slice(0, 40))}`).join("\n")
                : "今天记下的不多，也没关系。";
            return `🌙 <b>今天收工了</b>\n${list}\n\n💬 今天做完的每一件都是真的。剩下的明天接着来，你的节奏没问题。好好睡。\n<i>（模型没连上：${this.esc(String((e as Error).message || e).slice(0, 80))}）</i>`;
        }
    }

    // ================= 🫂 陪你聊 =================
    // 读：陪伴档案 + 近一周的日记（今天最细，越早越粗）+ 最近一个月说过的情绪话 + 作息训练
    //   + 这次对话 + 最近一天它自己说过的话（避免来回说同一件事）
    async comfort(text: string, history: ChatTurn[] = [], mood: Mood = "low") {
        const c = this.cfg;
        const day = this.today();
        const profile = await this.profileText();
        const near: string[] = [];
        const week: string[] = [];
        for (let i = 0; i < 7; i++) {
            const d = day.clone().subtract(i, "day");
            const t = this.digestJournal(await this.readDay(d), i === 0 ? 120 : i < 3 ? 50 : 30);
            if (t)
                (i < 3 ? near : week).push(
                    `### ${d.format("MM-DD dddd")}${i === 0 ? "（今天）" : ""}\n${t}`,
                );
        }
        const moods: string[] = [];
        for (let i = 1; i <= 30 && moods.length < 12; i++) {
            const d = day.clone().subtract(i, "day");
            for (const l of (await this.readDay(d)).split("\n")) {
                const s = l.replace(/^\s*-\s*/, "").trim();
                if (s.length <= 60 && FEEL_RE.test(s.replace(FEEL_SKIP, "")))
                    moods.push(`${d.format("MM-DD")}：${s}`);
            }
        }
        const facts = await this.extraFacts(day, "chat");
        const talk = history.map((h) => `${h.who}：${h.text}`).join("\n");
        // 最近一天它说过、又不在这次对话窗口里的话
        const inTalk = new Set(
            history
                .filter((h) => h.who === "你")
                .map((h) => h.text.replace(/\s+/g, " ").slice(0, 160)),
        );
        const said = (c.said || [])
            .filter((x) => Date.now() - x.at < 24 * 3600e3 && !inTalk.has(x.text))
            .slice(-12)
            .map((x) => `- ${x.text}`)
            .join("\n");
        const happyWords = this.happyWords();
        const quipNote = happyWords.length
            ? `他有自己的口癖：开心的时候会说「${happyWords.join("」「")}」。他说了，你可以用同样的话回一句。`
            : "";
        const fresh = `不要来回说同一件事：上面对话里和「你最近已经说过的话」里提过的事、夸过的点、用过的句式和结尾问法，这次都不要再用，除非他自己接着聊那件事；日记里的同一件事最多提一次。今天的日记里能聊的你都提过了，就往近一周看，换一个没聊过的角度：他一直在做的事（好几天都出现的）、最近刚开始或刚做完的事、接下来打算做的事（TODO 和他写下的计划）。`;
        const base = `用${c.lang}；陪伴档案里空着没填的项、括号里的填写提示都当作不知道，不要追问他；只回应他自己的事，日记里别人说的话、摘抄、转述的内容不要套在他身上，也不要提别人的隐私；${fresh}只用 Telegram 支持的 HTML（<b> <i>），不要 Markdown。只输出要发给他的话。`;
        const rules =
            mood === "chat"
                ? `回复要求：像亲近的人在聊天，1～6 行，他说得短你也短；他问问题就直接回答（你不能联网，实时信息不知道就直说）；他聊他在做的事、想法，就接着聊，可以用日记里的背景，但不要列清单、不要复述日记；不说教，不主动提醒他还有什么没做。适量 emoji（1～3 个）。${base}`
                : mood === "happy"
                  ? `回复要求：像亲近的人发消息，2～5 行；跟着他一起高兴，不要说教、不要提建议、不要转去聊没做完的事；他说做成了什么就具体地接住，没说就从日记里找一件他刚做成的事一起高兴，或者问他发生了什么好事。适量 emoji（2～4 个）。${base}`
                  : `回复要求：像亲近的人发消息，4～8 行；只有他这句话或你们刚才的对话里明确流露出想伤害自己、不想活，才按档案里的危机部分回应，否则一个字都不要提自伤和热线；先接住情绪，引用一两件他最近具体在做的事说明你懂他的处境（不要列清单、不要复述全部日记）；不要说教、不要鸡汤、不要「加油」；建议最多一个且非常小，没必要就不给；可以用一个问题结尾让他多说一点。适量 emoji（2～4 个）。${base}`;
        // 人设：扮演用户写的角色。语气、格式、长短交给人设；红线、不套话别人、不重复、危机时出戏这几条照旧
        const pc = await this.personaCheck();
        const persona = pc.text;
        const personaMood =
            mood === "happy"
                ? "他现在心情很好，用角色的方式跟他一起高兴，不要借机提醒没做完的事。"
                : mood === "low"
                  ? "他现在情绪不太好，用角色的方式先接住他，不说教。"
                  : "";
        const personaRules = `回复要求：先守住上面的红线，在红线以内全程保持人设里的角色，语气、称呼、格式、长短都按人设来；不要跳出角色说自己是 AI 或模型，除非他明确要求出戏；人设没写到的地方，像聊天一样简短。${personaMood}只有他这句话或你们刚才的对话里明确流露出想伤害自己、不想活，才暂时放下角色，认真接住他，请他联系身边信任的人或心理援助热线（陪伴档案里写了怎么做就照着做）；否则一个字都不要提自伤和热线。人设没说不能提的话，可以自然地用上他日记里的事，但不要列清单、不要复述日记。${base}`;
        const opener =
            mood === "happy"
                ? "他刚在 Telegram 里给你发了消息，心情很好。"
                : mood === "chat"
                  ? "他在 Telegram 里找你聊天。"
                  : "他刚在 Telegram 里给你发了消息，情绪不太好。";
        const now = moment().format("M月D日 dddd HH:mm");
        const head = persona
            ? `你要扮演下面「人设」里写的角色，和他在 Telegram 里聊天（他是谁写在后面的陪伴档案里）。${opener}现在是 ${now}。${quipNote}

${PERSONA_RED_LINES}

【人设】
${persona}

【陪伴档案】（他是谁、他的处境。里面「回我的时候」的要求和人设冲突时，以人设为准）
${profile || "（他还没写陪伴档案）"}`
            : `${DEFAULT_PERSONA}（他是谁写在下面的陪伴档案里。）${opener}现在是 ${now}。${quipNote}

先读他自己写的「陪伴档案」。里面「回我的时候」是他对你的要求，和上面的说法有出入时以他写的为准：
${profile || "（他还没写陪伴档案：先接住情绪、用日记里的具体事实回应、不说教）"}`;
        const prompt = `${head}

他最近的情况（来自他的 Obsidian 日记，DONE 或 [x] 是做完的，TODO 或 [ ] 是没做的，「←」是从前几天拖过来的）：
${facts.map((f) => "- " + f).join("\n")}

${near.join("\n\n") || "（这三天的日记是空的）"}
${week.length ? `\n更早几天（近一周，用来看他一直在做什么、最近在做什么、接下来打算做什么）：\n\n${week.join("\n\n")}\n` : ""}${moods.length ? `\n最近一个月他在日记里说过的类似的话：\n${moods.join("\n")}\n` : ""}
${talk ? `你们刚才的对话：\n${talk}\n` : ""}${said ? `\n你最近已经说过的话（不在上面这段对话里的）：\n${said}\n` : ""}
他现在说：「${text}」

${persona ? personaRules : rules}`;
        let reply: string;
        let note = ""; // 备用后端回的时候加在末尾；不算进它「说过的话」
        let failed = false;
        try {
            const r = await this.llmFull(prompt, 150);
            reply = this.tgHtml(r.text);
            note = this.fallbackNote(r);
        } catch (e) {
            console.error("[telegram-companion] 陪聊", e);
            failed = true;
            const soft =
                mood === "chat"
                    ? `${this.m} 我在听，不过这会儿脑子有点卡，没法好好回你。\n再说一遍，或者等一下再找我？`
                    : mood === "happy"
                      ? `${this.m} 听起来是好事，我跟着一起高兴 ✨\n发生什么了，跟我说说？`
                      : "🫂 我在。现在没法细看你今天的日记，但你说累，我信。\n先别管清单，喝口水，能躺就躺一会儿。\n想说的话，接着回我这条。";
            reply = `${soft}\n<i>（模型没连上：${this.esc(String((e as Error).message || e).slice(0, 80))}，发「模型」看看现在用的是哪个）</i>`;
        }
        const plain = reply.replace(/<[^>]+>/g, "");
        if (!failed) {
            c.said = [
                ...(c.said || []),
                { at: Date.now(), text: plain.replace(/\s+/g, " ").slice(0, 160) },
            ]
                .filter((x) => Date.now() - x.at < 24 * 3600e3)
                .slice(-30);
        }
        if (pc.blocked)
            note += `\n<i>（人设「${this.esc(pc.name)}」里写了未成年设定：「${this.esc(pc.blocked.slice(0, 40))}」，没用它，这次是默认的那个人回你。把角色改成成年就能用）</i>`;
        const next: ChatTurn[] = [...history, { who: "他", text }, { who: "你", text: plain }];
        return { html: reply + note, mood, history: next.slice(-16) };
    }

    // ================= 🔄 陪伴档案（画像）=================
    // 档案上面是手写的长期画像，末尾「🔄 近况」一节自动维护：
    //   每周日：读这一周的日记、额外参考的笔记、这周对话模式里说过的话，整段重写近况
    //   每次对话结束：这段对话里你说的话攒够 incMinChars 个字，就把新信息并进近况（只改有变化的行）
    //   两种更新发现稳定、长期的新特点时，都作为「建议补进档案」发到 Telegram，点 ✅ 才写进上面手写的那几节
    // 对话内容只存在本插件的数据里（chatMemory），不进日记和笔记；每周更新完清空
    profileFile(): TFile | null {
        const f = this.app.vault.getAbstractFileByPath(this.cfg.profilePath);
        return f instanceof TFile ? f : null;
    }
    profileSections(text: string): string[] {
        return text
            .split("\n")
            .filter((l) => /^- \S/.test(l) && !l.startsWith("- 🔄"))
            .map((l) =>
                l
                    .slice(2)
                    .replace(/（.*$/, "")
                    .trim(),
            );
    }
    recentLines(text: string): string[] {
        const ls = text.split("\n");
        const i = ls.findIndex((l) => l.startsWith("- 🔄 近况"));
        const out: string[] = [];
        for (let j = i + 1; i >= 0 && j < ls.length && ls[j].startsWith("	- "); j++)
            out.push(ls[j].replace(/^\t- /, ""));
        return out;
    }
    private async writeRecent(f: TFile, lines: string[]): Promise<void> {
        const head = `- 🔄 近况（自动更新 · 最后更新 ${moment().format("YYYY-MM-DD")} · 这一节会被改写，想长期留着的写到上面）`;
        const block = [head, ...lines.map((x) => `\t- ${x}`)];
        await this.app.vault.process(f, (txt) => {
            const ls = txt.split("\n");
            const i = ls.findIndex((l) => l.startsWith("- 🔄 近况"));
            if (i < 0) return txt.replace(/\n*$/, "\n") + block.join("\n") + "\n";
            let j = i + 1;
            while (j < ls.length && !/^\S/.test(ls[j])) j++;
            ls.splice(i, j - i, ...block);
            return ls.join("\n");
        });
    }
    private parseProfileOut(out: string, sections: string[], maxRecent: number, maxSugs: number) {
        const lines = (s: string) =>
            s
                .split("\n")
                .map((l) => l.replace(/^\s*[-*]\s*/, "").trim())
                .filter((l) => l && !/^[（(]?(?:无|没有|留空)[）)]?$/.test(l));
        const recent = lines(
            (/<<<近况>>>\s*([\s\S]*?)(?:<<<建议>>>|$)/.exec(out) || [])[1] || "",
        ).slice(0, maxRecent);
        const sugs: { section: string; text: string }[] = [];
        for (const l of lines((/<<<建议>>>\s*([\s\S]*)$/.exec(out) || [])[1] || "")) {
            const m = /^(.+?)[｜|]\s*(.+)$/.exec(l);
            const section = m && sections.find((x) => m[1].includes(x) || x.includes(m[1].trim()));
            if (m && section && m[2].trim()) sugs.push({ section, text: m[2].trim() });
        }
        return { recent, sugs: sugs.slice(0, maxSugs) };
    }
    private async extraNotesText(): Promise<string> {
        const out: string[] = [];
        const paths = String(this.cfg.extraNotes || "")
            .split("\n")
            .map((x) => x.trim().replace(/\/$/, ""))
            .filter(Boolean);
        for (const p of paths) {
            let f = this.app.vault.getAbstractFileByPath(p);
            if (f instanceof TFolder) {
                // 文件夹：取文件名排最后的那一篇
                const notes = f.children.filter(
                    (x): x is TFile => x instanceof TFile && x.extension === "md",
                );
                f = notes.sort((a, b) => b.name.localeCompare(a.name))[0] ?? null;
            }
            if (!(f instanceof TFile)) continue;
            const t = (await this.app.vault.cachedRead(f))
                .replace(/^---\n[\s\S]*?\n---\n/, "")
                .replace(/<!--[\s\S]*?-->/g, "")
                .trim()
                .slice(0, 2500);
            if (t) out.push(`【${f.basename}】（只取开头一段）\n${t}`);
        }
        return out.join("\n\n");
    }
    private chatLines(items: { at: number; text: string; mood: Mood }[]): string {
        const label = (m: Mood) => (m === "low" ? "情绪不好" : m === "happy" ? "开心" : "闲聊");
        return items
            .map((x) => `${moment(x.at).format("MM-DD HH:mm")}（${label(x.mood)}）${x.text}`)
            .join("\n");
    }
    private stamp(k: number | string): string {
        return `${Date.now().toString(36)}${k}`;
    }

    async profileUpdate({ manual = false } = {}): Promise<{ ok: boolean; msg?: string }> {
        const c = this.cfg;
        const f = this.profileFile();
        if (!f)
            return {
                ok: false,
                msg: `没找到陪伴档案（${c.profilePath}），在插件设置里点「新建模板」`,
            };
        const profile = await this.app.vault.read(f);
        const day = this.today();
        const days: string[] = [];
        for (let i = 6; i >= 0; i--) {
            const d = day.clone().subtract(i, "day");
            const t = this.digestJournal(await this.readDay(d), 80);
            if (t) days.push(`### ${d.format("MM-DD dddd")}\n${t}`);
        }
        const extra = await this.extraNotesText();
        const facts = await this.extraFacts(day, "week");
        const chats = c.useChat ? this.chatLines(c.chatMemory || []) : "";
        const sections = this.profileSections(profile);
        const prompt = `你在维护一份「陪伴档案」：它是一个陪伴型 Telegram 机器人对他的长期了解，机器人每次回他之前都会先读它。下面是档案现在的全文，以及他这一周的各种记录。

【档案全文】
${profile}

【这一周的日记摘要】（DONE 或 [x] 做完、TODO 或 [ ] 没做、FAILED 没做成）
${days.join("\n\n") || "（没有）"}

【他让你额外参考的笔记】
${extra || "（没有）"}

【作息、训练等数据】
${facts.map((x) => "- " + x).join("\n") || "（没有）"}

【这周在对话模式里他对机器人说过的话】
${chats || "（没有）"}

任务一：重写档案末尾的「🔄 近况」一节。5～8 条，每条一行、以 emoji 开头，依次覆盖：💼 最近在忙什么（具体项目）、🌡 这周的状态和压力来源、🎉 这周开心或有成就感的事、📚 最近在钻研 / 学习什么、😴 作息和身体、🫶 和在乎的人有关的近况（只写他自己写下的）、📈 和档案里上一版近况相比的变化。没有材料的那一条就不写。要具体、引用事实，不评价他、不给建议、不写心理诊断。
任务二：只有当这周的记录里出现了**稳定、长期**的新信息（新的压力模式、他喜欢或讨厌的被回应方式、新的口头禅、重要的人或长期目标），才给出最多 3 条「建议补进档案」的内容，每条一句话，注明放进哪一节（只能是：${sections.join("、")}），不能和档案已有内容重复。没有就留空，宁缺毋滥。
不要写进日记里别人说的话、摘抄转述的内容、第三方的隐私。用${c.lang}写。

严格按这个格式输出，不要别的话：
<<<近况>>>
- 💼 ……
<<<建议>>>
- 节名｜内容`;
        let out: string;
        try {
            out = await this.llm(prompt, 300);
        } catch (e) {
            console.error("[telegram-companion] 更新陪伴档案", e);
            return { ok: false, msg: `没写成：${(e as Error).message || e}` };
        }
        const { recent, sugs } = this.parseProfileOut(out, sections, 8, 3);
        if (!recent.length) return { ok: false, msg: "模型没按格式回，档案没动" };
        await this.writeRecent(f, recent);
        c.chatMemory = [];
        c.sugs = {
            kind: manual ? "manual" : "week",
            lines: recent,
            items: sugs.map((x, k) => ({ ...x, id: this.stamp(k) })),
            done: {},
        };
        c.profileUpdatedAt = Date.now();
        this.saveSoon();
        const m = this.profileMessage(c.sugs);
        await this.send(m.text, m.markup);
        return { ok: true };
    }

    // 对话结束后的增量整理：这段（加上之前没攒够的）对话里你说的话够多，就把新信息并进近况
    pendingChat() {
        return (this.cfg.chatMemory || []).filter((x) => !x.d);
    }
    async digestChat({ force = false } = {}): Promise<{
        ok: boolean;
        skipped?: boolean;
        noted?: boolean;
        msg?: string;
    }> {
        const c = this.cfg;
        const pend = this.pendingChat();
        const chars = pend.reduce((n, x) => n + x.text.length, 0);
        if (
            this.digesting ||
            !c.incUpdate ||
            !c.useChat ||
            !pend.length ||
            (!force && chars < c.incMinChars)
        ) {
            return { ok: false, skipped: true };
        }
        const f = this.profileFile();
        if (!f) return { ok: false, msg: "没找到陪伴档案" };
        this.digesting = true;
        try {
            const profile = await this.app.vault.read(f);
            const sections = this.profileSections(profile);
            const prompt = `你在维护一份「陪伴档案」：它是一个陪伴型 Telegram 机器人对他的长期了解，机器人每次回他之前都会先读它。他刚结束了一段和机器人的对话。下面是档案现在的全文，和这段对话里他说过的话（只有他说的，没有机器人的回复）。

【档案全文】
${profile}

【他刚才说的】
${this.chatLines(pend)}

任务一：把这些话里**新出现、档案里还没有**的事实并进档案末尾的「🔄 近况」。只输出需要改写或新增的行：改写某一行，就用那一行开头的 emoji 开头，写出改好后的整行（原来仍然成立的内容要保留）；是新的一类信息，就换一个贴切的 emoji 另起一行。单纯的情绪宣泄、寒暄、对机器人下的指令、档案里已经有的内容，都不算新信息。没有新信息就留空。最多 3 行，要具体、引用他的原话或事实，不评价他、不给建议、不写心理诊断。
任务二：只有当这些话里出现了**稳定、长期**的新信息（新的压力模式、他喜欢或讨厌的被回应方式、新的口头禅、重要的人或长期目标），才给出最多 2 条「建议补进档案」的内容，每条一句话，注明放进哪一节（只能是：${sections.join("、")}），不能和档案已有内容重复。没有就留空，宁缺毋滥。
不要写进他转述的别人的话和第三方的隐私。用${c.lang}写。

严格按这个格式输出，不要别的话：
<<<近况>>>
- 💼 ……
<<<建议>>>
- 节名｜内容`;
            let out: string;
            try {
                out = await this.llm(prompt, 200);
            } catch (e) {
                // 没写成：这些话留着，下次对话结束再试
                console.error("[telegram-companion] 增量整理画像", e);
                return { ok: false, msg: `没写成：${(e as Error).message || e}` };
            }
            const { recent: changed, sugs } = this.parseProfileOut(out, sections, 3, 2);
            if (changed.length) {
                const cur = this.recentLines(profile);
                for (const l of changed) {
                    const k = firstEmoji(l);
                    const i = k ? cur.findIndex((x) => firstEmoji(x) === k) : -1;
                    if (i >= 0) cur[i] = l;
                    else cur.push(l);
                }
                await this.writeRecent(f, cur.slice(-12));
                c.profileUpdatedAt = Date.now();
            }
            for (const x of pend) x.d = 1; // 整理过了；留给每周更新再整体看一遍
            const noted = changed.length > 0 || sugs.length > 0;
            if (noted) {
                c.incSugs = {
                    kind: "inc",
                    lines: changed,
                    items: sugs.map((x, k) => ({ ...x, id: this.stamp(`i${k}`) })),
                    done: {},
                };
                const m = this.profileMessage(c.incSugs);
                await this.send(m.text, m.markup);
            }
            this.saveSoon();
            return { ok: true, noted };
        } finally {
            this.digesting = false;
        }
    }
    profileMessage(ps: SuggestionSet): { text: string; markup: InlineKeyboard | null } {
        const E = (x: string) => this.esc(x);
        const lines =
            ps.kind === "inc"
                ? ["🧩 <b>刚才聊的，我记了一下</b>"]
                : [
                      `🔄 <b>${ps.kind === "manual" ? "更新好了" : "这周"}，我对你的了解更新了一下</b>`,
                  ];
        if (ps.lines && ps.lines.length) lines.push("", ...ps.lines.map(E));
        if (ps.items.length) {
            const ask = ps.kind === "inc" ? "听起来是你长期的特点" : "这周看到的新特点";
            lines.push("", `💡 <b>${ask}，要不要记进你的档案？</b>（点 ✅ 才会写进去）`);
            ps.items.forEach((x, i) =>
                lines.push(`${ps.done[x.id] || `${i + 1}️⃣`} <i>${E(x.section)}</i>：${E(x.text)}`),
            );
        }
        lines.push(
            "",
            ps.kind === "inc"
                ? "<i>记在「陪伴档案」的近况里；不对就直接改那篇笔记</i>"
                : "<i>想改哪里，直接改「陪伴档案」那篇笔记</i>",
        );
        const kb = ps.items
            .filter((x) => !ps.done[x.id])
            .map((x) => {
                const n = ps.items.indexOf(x) + 1;
                return [
                    { text: `✅ 记进档案 ${n}`, callback_data: `co|pok|${x.id}` },
                    { text: `❌ 不要 ${n}`, callback_data: `co|pno|${x.id}` },
                ];
            });
        return { text: lines.join("\n"), markup: kb.length ? { inline_keyboard: kb } : null };
    }
    /** 按钮回调：画像建议的 ✅ / ❌、切模型。 */
    async onCallback(act: string, id: string): Promise<CallbackResult> {
        const c = this.cfg;
        if (act === "persona") {
            if (id === "off") {
                c.personaOn = false;
            } else {
                const f = this.personaFiles()[+id];
                if (!f) return { toast: "这篇人设找不到了" };
                c.personaOn = true;
                c.personaActive = f.path;
            }
            // 换了角色：这段对话的上下文和「说过的话」不带过去
            if (c.chat) c.chat.history = [];
            c.said = [];
            await this.plugin.saveSettings();
            const m = this.personaMessage();
            const cur = this.personaFile();
            const chk = await this.personaCheck();
            return {
                toast: chk.blocked
                    ? `「${chk.name}」写了未成年设定，不会用它，回你的还是默认的那个人`
                    : cur
                      ? `现在是「${cur.basename}」`
                      : "已关掉人设",
                edit: m.text,
                markup: m.markup,
            };
        }
        if (act === "model") {
            if (!setBackend(c, id)) return { toast: "没有这个后端" };
            this.modelChanged();
            await this.plugin.saveSettings();
            const m = this.modelMessage();
            return { toast: `已切到 ${this.backendLabel()}`, edit: m.text, markup: m.markup };
        }
        const ps = [c.sugs, c.incSugs].find(
            (p) => p && p.items && p.items.some((y) => y.id === id),
        );
        const x = ps?.items.find((y) => y.id === id);
        if (!ps || !x) return { toast: "这条已经过期了" };
        if (ps.done[id]) return { toast: "已经处理过了" };
        if (act === "pok") {
            const f = this.profileFile();
            if (!f) return { toast: "没找到陪伴档案" };
            let ok = false;
            await this.app.vault.process(f, (txt) => {
                const ls = txt.split("\n");
                const i = ls.findIndex((l) => /^- \S/.test(l) && l.slice(2).startsWith(x.section));
                if (i < 0) return txt;
                let j = i + 1;
                while (j < ls.length && !/^\S/.test(ls[j])) j++;
                while (j > i + 1 && !ls[j - 1].trim()) j--; // 插在这一节最后一个子项后面
                ls.splice(j, 0, `\t- ${x.text}`);
                ok = true;
                return ls.join("\n");
            });
            if (!ok) return { toast: `档案里没找到「${x.section}」这一节` };
        }
        ps.done[id] = act === "pok" ? "✅" : "❌";
        this.saveSoon();
        if (!ps.lines) ps.lines = this.recentLines(await this.read(c.profilePath));
        const m = this.profileMessage(ps);
        return {
            toast: act === "pok" ? `已记进「${x.section}」` : "好，不记",
            edit: m.text,
            markup: m.markup || { inline_keyboard: [] },
        };
    }
    async createProfile(): Promise<boolean> {
        const p = normalizePath(this.cfg.profilePath || "陪伴档案.md");
        if (this.app.vault.getAbstractFileByPath(p)) return false;
        const dir = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
        if (dir && !this.app.vault.getAbstractFileByPath(dir))
            await this.app.vault.createFolder(dir);
        await this.app.vault.create(p, PROFILE_TEMPLATE);
        return true;
    }

    // ================= 对话模式 / 记录模式 =================
    // 记录模式（默认）：发来的都记进日记。对话模式：每句都由模型接着聊，对话内容不进日记。
    //   explicit：说「对话模式」「陪我聊天」进入，一直保持到说「退出」「记录模式」「睡了」
    //   auto：情绪话、口癖、「聊聊 / 陪我」、回复它的消息时自动进入，chatIdleMin 分钟没说话就自己回到记录模式
    chatCommand(said: string): "enter" | "exit" | null {
        const s = String(said || "")
            .trim()
            .replace(/[!！。.~～\s]+$/, "");
        if (/^(?:进入)?(?:对话|聊天)模式$|^(?:来)?陪我聊(?:聊|天|会儿?)?$|^\/chat$/.test(s))
            return "enter";
        if (
            /^(?:退出(?:对话|聊天)?(?:模式)?|记录模式|回到记录模式|不聊了|先不聊了|结束对话|\/record|\/exit)$/.test(
                s,
            )
        ) {
            return "exit";
        }
        return null;
    }
    /** 现在是否在对话模式（auto 超时也算 false，等 tick 或下一句收尾）。 */
    chatActive(): "explicit" | "auto" | false {
        const c = this.cfg.chat;
        if (!c) return false;
        if (c.mode === "auto" && Date.now() - c.last > this.cfg.chatIdleMin * 60e3) return false;
        return c.mode;
    }
    async chatStart(mode: "explicit" | "auto", mood: Mood = "chat"): Promise<ChatState> {
        const c = this.cfg.chat;
        if (c && this.chatActive()) {
            if (mode === "explicit") c.mode = "explicit";
            c.last = Date.now();
            this.saveSoon();
            return c;
        }
        if (c) await this.chatEnd(); // 超时还没收尾的那段先收掉
        this.cfg.chat = { mode, mood, since: Date.now(), last: Date.now(), history: [], n: 0 };
        this.saveSoon();
        return this.cfg.chat;
    }
    /** 对话结束（退出、超时、收工）：收尾，并看这段话的信息量够不够整理进档案（在后台做，不让人等）。 */
    async chatEnd(): Promise<ChatState | null> {
        const c = this.cfg.chat;
        if (!c) return null;
        this.cfg.chat = null;
        this.saveSoon();
        if (c.n)
            this.digestChat().catch((e) => console.error("[telegram-companion] 增量整理画像", e));
        return c;
    }
    /** 对话模式里的一句：接着之前的对话回。 */
    async chatReply(text: string): Promise<string> {
        const cfg = this.cfg;
        const c = cfg.chat || (await this.chatStart("auto"));
        const idleLong = c.mode === "explicit" && Date.now() - c.last > 6 * 3600e3;
        c.last = Date.now();
        const mood = this.moodOf(text) || c.mood || "chat";
        const r = await this.comfort(text, c.history, mood);
        c.history = r.history;
        if (mood !== "chat") c.mood = mood;
        c.n = (c.n || 0) + 1;
        if (cfg.useChat && (cfg.weeklyUpdate || cfg.incUpdate)) {
            // 给更新陪伴档案用，不进日记
            cfg.chatMemory = [
                ...(cfg.chatMemory || []),
                { at: Date.now(), text: String(text).slice(0, 300), mood },
            ].slice(-300);
        }
        c.last = Date.now();
        this.saveSoon();
        return r.html + (idleLong ? "\n\n<i>（还在对话模式，说「退出」回到记录模式）</i>" : "");
    }
    /** 每半分钟：自动进入的对话超时了就收尾、说一声；周日到点更新档案（到点时电脑在睡觉，醒来 90 分钟内补）。 */
    async tick(): Promise<void> {
        if (!this.on()) return;
        const cfg = this.cfg;
        const c = cfg.chat;
        if (c && c.mode === "auto" && !this.chatActive()) {
            const ended = await this.chatEnd();
            if (ended && ended.n) {
                await this.send(
                    `📝 ${cfg.chatIdleMin} 分钟没说话，我先回到记录模式啦 ${this.m}\n想接着聊就再找我`,
                );
            }
        }
        const m = /^(\d{1,2})[:：](\d{2})$/.exec(String(cfg.weeklyUpdateAt).trim());
        if (!cfg.weeklyUpdate || !m || !this.plugin.settings.owner_chat_id) return;
        const nowM = moment();
        const now = nowM.hours() * 60 + nowM.minutes();
        const at = +m[1] * 60 + +m[2];
        const key = nowM.format("YYYY-MM-DD");
        if (nowM.day() === 0 && cfg.weeklySent !== key && now >= at && now - at < 90) {
            cfg.weeklySent = key;
            this.saveSoon();
            await this.profileUpdate();
        }
    }

    // ================= 口癖：不用等模型，马上回一句 =================
    // 每个人打招呼、撒欢的说法不一样，所以触发词和回法都在设置里自己定：
    //   hello：按时间段打招呼，带上今天在做什么、做完几件
    //   echo：你说几声，它多说一声（比如「呱呱」→「呱呱呱！」）
    //   reply：从你写的几句里随机回一句
    private happyWords(): string[] {
        return (this.cfg.quips || []).filter((q) => q.happy).flatMap(quipWords);
    }
    private matchQuip(said: string): { q: Quip; word: string; n: number } | null {
        const s = String(said || "")
            .trim()
            .replace(/[!！~～。.?？\s]+$/, "")
            .toLowerCase();
        if (!s || s.length > 40) return null;
        for (const q of this.cfg.quips || []) {
            const words = quipWords(q);
            if (!words.length) continue;
            if (q.kind === "echo") {
                // 整句只由口癖（可以重复、夹标点）组成
                const one = `(?:${words.map(escRe).join("|")})`;
                if (!new RegExp(`^(?:${one}[!！~～。.\\s]*)+$`).test(s)) continue;
                const hits = s.match(new RegExp(one, "g")) || [];
                return { q, word: hits[0] ?? words[0], n: Math.max(hits.length, 1) };
            }
            const hit = words.find((w) => w === s);
            if (hit) return { q, word: hit, n: 1 };
        }
        return null;
    }
    async todayStatus(): Promise<{ doing: string[]; done: number; lastDone: string | null }> {
        const np = spiralPlugin(this.app);
        const out = { doing: [] as string[], done: 0, lastDone: null as string | null };
        const txt = await this.readDay(this.today());
        try {
            if (np) {
                const tasks = np.core
                    .parseJournal(txt, np.settings)
                    .filter((i) => i.kind === "task" && !i.container);
                out.doing = tasks.filter((t) => t.state === "open" && t.doing).map((t) => t.label);
                out.done = tasks.filter((t) => t.state === "done").length;
                const last = tasks
                    .filter((t) => t.state === "done" && t.stamp != null)
                    .sort((a, b) => (b.stamp ?? 0) - (a.stamp ?? 0))[0];
                out.lastDone = last ? last.label : null;
                return out;
            }
        } catch {
            /* 解析不了就按下面的简单规则 */
        }
        const label = (l: string) =>
            l
                .replace(/^\s*-\s+(?:\[.\]|[A-Z]+)\s+/, "")
                .replace(/^\d{1,2}:\d{2}(?:-\d{1,2}:\d{2})?\s+/, "")
                .trim();
        const ls = txt.split("\n");
        out.doing = ls.filter((l) => /^\s*-\s+(?:DOING|NOW|\[\/\])\s/.test(l)).map(label);
        const done = ls.filter((l) => /^\s*-\s+(?:DONE|\[[xX]\])\s/.test(l)).map(label);
        out.done = done.length;
        out.lastDone = done[done.length - 1] || null;
        return out;
    }
    /** 这句是不是口癖：是的话返回马上要回的话，以及回完要不要进入对话模式。 */
    async quip(said: string): Promise<{ html: string; chat: boolean } | null> {
        if (!this.cfg.quipsOn) return null;
        const hit = this.matchQuip(said);
        if (!hit) return null;
        const { q, word, n } = hit;
        const short = (x: string) => this.esc(x.length > 24 ? x.slice(0, 24) + "…" : x);
        const h = new Date().getHours();
        const lines: string[] = [];
        if (q.kind === "reply") {
            const replies = String(q.replies || "")
                .split("\n")
                .map((x) => x.trim())
                .filter(Boolean);
            lines.push(this.esc(replies.length ? pick(replies) : "收到 🫶"));
        } else {
            const st = await this.todayStatus();
            if (q.kind === "echo") {
                lines.push(`${this.esc(word.repeat(Math.min(n + 1, 7)))}！${this.m}`);
                lines.push(
                    pick([
                        `听到「${this.esc(word)}」就知道你心情不错 😆`,
                        "收到一只开心的你 ✨",
                        "今天是有什么好事吗？👀",
                        "听起来很有精神 💚",
                        "开心就多说两声，我都接着 🫶",
                    ]),
                );
                if (st.doing.length)
                    lines.push(`⭐ 一边做「${short(st.doing[0])}」一边开心，状态很可以`);
                else if (st.lastDone) lines.push(`🎉 是因为刚搞定「${short(st.lastDone)}」吗`);
                else if (st.done >= 5)
                    lines.push(`💪 今天已经做完 ${st.done} 件了，开心得理直气壮`);
            } else {
                lines.push(
                    h < 5
                        ? pick(["这么晚还在呀 🌙", "还没睡呀，夜猫子 🦉"])
                        : h < 11
                          ? pick(["早呀 ☀️", "早上好 🌤"])
                          : h < 14
                            ? "中午好 🍚"
                            : h < 18
                              ? pick(["下午好 ☕️", "来啦 🙌"])
                              : pick(["晚上好 🌙", "今天辛苦啦 🫶"]),
                );
                if (st.doing.length) lines.push(`⭐ 你在做「${short(st.doing[0])}」`);
                if (st.done) lines.push(`✅ 今天已经做完 ${st.done} 件了`); // 打招呼不提还剩多少，免得有压力
                if (h < 5)
                    lines.push(
                        pick(["别熬太狠，困了就说一声「睡了」😴", "今天的事可以明天再接着来 🌙"]),
                    );
                lines.push(
                    pick([
                        "想聊什么都可以 💬",
                        "我在，随时说 💬",
                        `有事说事，没事打个招呼也行 ${this.m}`,
                    ]),
                );
            }
        }
        return { html: lines.join("\n"), chat: !!q.chat };
    }
    /** 情绪短句：难受 → low，开心（含标了「开心」的口癖）→ happy；任务行、链接、长摘录不算。 */
    moodOf(text: string): Mood | null {
        const s = String(text || "").trim();
        if (
            !this.on() ||
            s.length > 40 ||
            /^(?:TODO|DONE|DOING|LATER|NOW|FAILED|WAITING|CANCELED)\b/.test(s) ||
            /https?:\/\//.test(s)
        ) {
            return null;
        }
        const t = s.replace(FEEL_SKIP, "");
        if (FEEL_RE.test(t)) return "low";
        const low = t.toLowerCase();
        if (HAPPY_RE.test(t) || this.happyWords().some((w) => low.includes(w))) return "happy";
        return null;
    }
}

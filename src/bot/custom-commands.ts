import type { moment } from "obsidian";
import type { CustomCommand } from "../settings/types";
import { tr } from "../i18n";

// 自定义命令：触发词自己定（「?」「!」「zz」「灵感」「/idea」都行），能做三类事：
//   alias  当成发了某条内置指令（「日程」→ /now、「zz」→ 睡了）
//   note   把触发词后面的话按格式记到一篇笔记里（路径空着就记到平时记消息的地方）
//   ask    带着陪伴档案和近一周的日记，按写好的提示词问模型

type Moment = ReturnType<typeof moment>;

export interface Builtin {
    key: string;
    /** 当成发了这句话，交给后面原有的指令处理。 */
    says: string;
    label: string;
    /** 要开了陪伴 / 装了螺旋日程 / 装了任务提醒才有用。 */
    needs?: "companion" | "spiral" | "notify";
}

export const BUILTINS: Builtin[] = [
    {
        key: "now",
        says: "/now",
        label: tr("🌀 今天的螺旋日程", "🌀 Today's spiral schedule"),
        needs: "spiral",
    },
    {
        key: "summary",
        says: "/summary",
        label: tr("🌙 今天做了什么（不收工）", "🌙 What I did today (without ending the day)"),
        needs: "companion",
    },
    { key: "sleep", says: "睡了", label: tr("😴 收工 + 小结", "😴 End the day + summary") },
    {
        key: "wake",
        says: "起了",
        label: tr("☀️ 开始今天", "☀️ Start the day"),
        needs: "spiral",
    },
    {
        key: "meal",
        says: "去吃饭了",
        label: tr("🍚 去吃饭（暂停手上的事）", "🍚 Off to eat (pause what I'm doing)"),
        needs: "spiral",
    },
    {
        key: "workout",
        says: "去锻炼了",
        label: tr("🏃 去锻炼（暂停手上的事）", "🏃 Off to work out (pause what I'm doing)"),
        needs: "spiral",
    },
    {
        key: "nap",
        says: "午睡",
        label: tr("😴 午睡（暂停手上的事）", "😴 Nap (pause what I'm doing)"),
        needs: "spiral",
    },
    {
        key: "back",
        says: "回来了",
        label: tr("↩️ 回来了（切回暂停的事）", "↩️ Back (resume what was paused)"),
        needs: "spiral",
    },
    {
        key: "chat",
        says: "/chat",
        label: tr("💬 进入对话模式", "💬 Start chat mode"),
        needs: "companion",
    },
    {
        key: "record",
        says: "/record",
        label: tr("📝 回到记录模式", "📝 Back to record mode"),
        needs: "companion",
    },
    {
        key: "mode",
        says: "/mode",
        label: tr("🔀 现在是哪种模式", "🔀 Which mode is on"),
        needs: "companion",
    },
    {
        key: "train",
        says: "/train",
        label: tr("🏋️ 今天练什么", "🏋️ Today's workout"),
        needs: "notify",
    },
    {
        key: "stale",
        says: "/stale",
        label: tr("🐢 拖了好几天的事", "🐢 Things put off for days"),
        needs: "notify",
    },
    {
        key: "cards",
        says: "/cards",
        label: tr("🃏 今天到期的闪卡", "🃏 Flashcards due today"),
        needs: "notify",
    },
    {
        key: "week",
        says: "/week",
        label: tr("🧭 这周做了什么（周洞察）", "🧭 What I did this week"),
        needs: "notify",
    },
    {
        key: "me",
        says: "/me",
        label: tr("🪞 你现在对我的了解", "🪞 What you know about me"),
        needs: "companion",
    },
    {
        key: "profile",
        says: "/profile",
        label: tr("🔄 现在更新对我的了解", "🔄 Update what you know about me"),
        needs: "companion",
    },
    {
        key: "model",
        says: "/model",
        label: tr("🧠 看 / 切换背后的模型", "🧠 See or switch the model"),
        needs: "companion",
    },
    {
        key: "persona",
        says: "/persona",
        label: tr("🎭 看 / 切换人设", "🎭 See or switch the persona"),
        needs: "companion",
    },
    { key: "help", says: "/help", label: tr("📮 我能做的事", "📮 What I can do") },
];

export const builtin = (key: string): Builtin | undefined => BUILTINS.find((b) => b.key === key);

const TRAIL = /[!！。.~～?？\s]+$/;
const TEXT_SLOT = /\{\{\s*text\s*\}\}/g;

export const triggers = (c: CustomCommand): string[] =>
    String(c.words || "")
        .split(/[,，、\n]+/)
        .map((w) => w.trim().toLowerCase())
        .filter(Boolean);

/**
 * Whether a message is one of the custom commands. Returns the command, the trigger
 * that matched and the words after it. When several triggers fit, the longest wins
 * ("??" over "?").
 */
export function matchCustom(
    cmds: CustomCommand[] | undefined,
    said: string,
): { cmd: CustomCommand; word: string; rest: string } | null {
    const s = String(said || "").trim();
    const low = s.toLowerCase();
    let best: { cmd: CustomCommand; word: string; rest: string } | null = null;
    for (const cmd of cmds || []) {
        for (const w of triggers(cmd)) {
            if (best && w.length <= best.word.length) continue;
            if (cmd.kind === "alias") {
                // 整句就是触发词；句尾的标点和语气不算（触发词本身是「?」也行）
                if (low === w || low.replace(TRAIL, "") === w) best = { cmd, word: w, rest: "" };
                continue;
            }
            if (!low.startsWith(w)) continue;
            const after = s.slice(w.length);
            // 字母、汉字结尾的触发词，后面要隔开（「灵感 …」「灵感：…」）；符号结尾的可以直接接（「!买牛奶」）
            if (after.replace(TRAIL, "") && /[\p{L}\p{N}]$/u.test(w) && !/^[\s:：]/.test(after))
                continue;
            const rest = after.replace(/^[\s:：]+/, "").trim();
            best = { cmd, word: w, rest: rest.replace(TRAIL, "") ? rest : "" };
        }
    }
    return best;
}

/** One line for the "/" menu and the help text: what the command does. */
export function describe(c: CustomCommand): string {
    if (c.kind === "alias") return builtin(c.target)?.label ?? c.target;
    if (c.kind === "note")
        return tr(
            `📌 记到 ${c.path.trim() || "今天的日记"}`,
            `📌 Save to ${c.path.trim() || "today's daily note"}`,
        );
    const p = c.prompt.replace(TEXT_SLOT, "…").replace(/\s+/g, " ").trim();
    return "💭 " + (p.length > 60 ? p.slice(0, 60) + "…" : p || tr("问模型", "Ask the model"));
}

/** Triggers Telegram accepts as commands ("/" + up to 32 lowercase letters, digits, underscores). */
export function menuCommands(
    cmds: CustomCommand[] | undefined,
): { command: string; description: string }[] {
    const out: { command: string; description: string }[] = [];
    for (const c of cmds || []) {
        for (const w of triggers(c)) {
            const m = w.match(/^\/([a-z0-9_]{1,32})$/);
            if (m && !out.some((o) => o.command === m[1]))
                out.push({ command: m[1], description: describe(c) });
        }
    }
    return out;
}

/**
 * The line a "save to a note" command writes: the format with {{text}}, {{time}} and
 * {{date}} filled in. When the format is a list item, later lines of the text are
 * indented under it. A format without {{text}} gets the text at the end.
 */
export function noteLine(format: string, text: string, at: Moment): string {
    let f = format.trim() || "- {{text}}";
    if (!/\{\{\s*text\s*\}\}/.test(f)) f += " {{text}}";
    const body = /^(?:[-*+]|\d+[.)])\s/.test(f) ? text.replace(/\n/g, "\n\t") : text;
    return f
        .replace(/\{\{\s*time\s*\}\}/g, at.format("HH:mm"))
        .replace(/\{\{\s*date\s*\}\}/g, at.format("YYYY-MM-DD"))
        .replace(TEXT_SLOT, () => body);
}

/** What an "ask" command sends the model: the prompt with {{text}} filled in, or the text after it. */
export function askText(prompt: string, text: string): string {
    if (/\{\{\s*text\s*\}\}/.test(prompt)) return prompt.replace(TEXT_SLOT, () => text).trim();
    return `${prompt.trim()}${text ? `\n\n${text}` : ""}`.trim();
}

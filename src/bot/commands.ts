import type TGInbox from "../main";
import { notifyPlugin, spiralPlugin } from "../integrations";
import { isZh, tr } from "../i18n";

// 指令表：/help 回的那段，和注册到 Telegram「/」菜单里的那几条。
// 只列在这台设备上真的能用的：陪伴没开就只有收件箱的指令；依赖「螺旋日程」「任务提醒」的要装了才出现。

interface Availability {
    companion: boolean;
    spiral: boolean;
    notify: boolean;
}

function available(plugin: TGInbox): Availability {
    return {
        companion: plugin.companion.on(),
        spiral: !!spiralPlugin(plugin.app),
        notify: !!notifyPlugin(plugin.app),
    };
}

export function telegramCommands(plugin: TGInbox): { command: string; description: string }[] {
    const a = available(plugin);
    const out: { command: string; description: string }[] = [];
    if (a.spiral)
        out.push({
            command: "now",
            description: tr("🌀 今天的螺旋日程", "🌀 Today's spiral schedule"),
        });
    if (a.companion) {
        out.push(
            {
                command: "summary",
                description: tr(
                    "🌙 今天做了什么（不收工）",
                    "🌙 What I did today (without ending the day)",
                ),
            },
            { command: "chat", description: tr("💬 进入对话模式", "💬 Start chat mode") },
            { command: "record", description: tr("📝 回到记录模式", "📝 Back to record mode") },
            { command: "mode", description: tr("🔀 现在是哪种模式", "🔀 Which mode is on") },
        );
    }
    if (a.notify) {
        out.push(
            { command: "train", description: tr("🏋️ 今天练什么", "🏋️ Today's workout") },
            {
                command: "stale",
                description: tr("🐢 拖了好几天的事", "🐢 Things put off for days"),
            },
            { command: "cards", description: tr("🃏 今天到期的闪卡", "🃏 Flashcards due today") },
            {
                command: "week",
                description: tr("🧭 这周做了什么（周洞察）", "🧭 What I did this week"),
            },
        );
    }
    if (a.companion) {
        out.push(
            { command: "me", description: tr("🪞 你现在对我的了解", "🪞 What you know about me") },
            {
                command: "profile",
                description: tr("🔄 现在更新对我的了解", "🔄 Update what you know about me"),
            },
            {
                command: "model",
                description: tr("🧠 看 / 切换背后的模型", "🧠 See or switch the model"),
            },
            {
                command: "persona",
                description: tr("🎭 看 / 切换人设", "🎭 See or switch the persona"),
            },
        );
    }
    out.push(
        {
            command: "task",
            description: tr("☑️ 记一条待办：/task 内容", "☑️ Add a to-do: /task text"),
        },
        { command: "help", description: tr("📮 我能做的事", "📮 What I can do") },
    );
    return out;
}

export function helpHtml(plugin: TGInbox): string {
    return isZh() ? helpZh(plugin) : helpEn(plugin);
}

// English help: slash commands only. The Chinese phrases (睡了, 对话模式 …) still work but are not listed.
function helpEn(plugin: TGInbox): string {
    const a = available(plugin);
    const m = plugin.companion.m;
    if (!a.companion) {
        return `📮 <b>What I can do</b>\n\nEverything you send goes into today's daily note.\n/task text adds a to-do`;
    }
    const lines = [
        `${m} <b>What I can do</b>`,
        "",
        "🔀 <b>Two modes</b>",
        "📝 Record mode (default): everything you send is saved",
        "💬 Chat mode: I answer every message, and the chat is not saved",
        "· /chat starts it, /record goes back",
        "· Replying to me, greeting me, or sounding upset or excited also starts it; after a while of silence I go back to recording",
        "",
        "⌨️ <b>Commands</b>",
    ];
    if (a.spiral) lines.push("/now today's spiral schedule");
    lines.push("/summary what you did today", "/mode which mode is on");
    if (a.notify) {
        lines.push(
            "/train today's workout",
            "/stale things put off for days (with buttons)",
            "/cards flashcards due today",
            "/week what you did this week",
        );
    }
    lines.push(
        "/me what I know about you",
        "/profile update it now (otherwise every Sunday, and after longer chats)",
        "/model see which model is used, switch with buttons",
        "/persona have me play a character, or switch",
        "/task text adds a to-do",
    );
    return lines.join("\n");
}

function helpZh(plugin: TGInbox): string {
    const a = available(plugin);
    const m = plugin.companion.m;
    if (!a.companion) {
        return `📮 <b>我能做的事</b>\n\n发什么我都记进今天的日记。\n/task 内容 记一条待办`;
    }
    const lines = [
        `${m} <b>我能做的事</b>`,
        "",
        "🔀 <b>两种模式</b>",
        "📝 记录模式（默认）：发什么记什么",
        "💬 对话模式：每句都回你，对话不进日记",
        "· <code>对话模式</code> /chat 进入，<code>退出</code> /record 回来",
        "· 说累、说开心、打招呼、「聊聊」开头、回复我的消息，会自动进入；一阵子不说话自动回来",
        "· 对话里想记一句：<code>记 明天买牛奶</code>",
        "",
        "⌨️ <b>指令</b>",
    ];
    if (a.spiral) lines.push("<code>?</code> /now 今天的螺旋日程");
    lines.push(
        "<code>小结</code> /summary 今天做了什么",
        "<code>睡了</code> <code>去睡了</code> <code>休息了</code> 收工 + 小结",
    );
    if (a.spiral) {
        lines.push(
            "<code>起了</code> 开始今天（顺便算昨晚睡了多久）",
            "<code>去吃饭了</code> → <code>吃完了</code> 暂停手上的事，吃完切回来",
            "<code>去锻炼了</code> → <code>练完了</code>　<code>午睡</code> → <code>醒了</code>",
        );
    }
    lines.push("<code>模式</code> /mode 现在是哪种模式");
    if (a.notify) {
        lines.push(
            "<code>今天练什么</code> /train 健身安排",
            "<code>拖延</code> /stale 拖了好几天的事（带按钮）",
            "<code>闪卡</code> /cards 今天到期几张",
            "<code>周洞察</code> /week 这周做了什么",
        );
    }
    lines.push(
        "<code>你了解我什么</code> /me 我现在对你的了解",
        "<code>更新画像</code> /profile 现在就更新（平时每周日自动，聊得多的时候聊完也会记）",
        "<code>模型</code> /model 看现在用哪个模型、点按钮切换",
        "<code>人设</code> /persona 让我扮演一个角色、换角色",
        "/task 内容 记一条待办",
    );
    const quips = (plugin.companion.cfg.quips || [])
        .map((q) => q.words.split(/[,，、\n]+/)[0]?.trim())
        .filter(Boolean);
    if (plugin.companion.cfg.quipsOn && quips.length) {
        lines.push(
            "",
            `🫶 ${quips
                .slice(0, 4)
                .map((w) => `<code>${plugin.companion.esc(w)}</code>`)
                .join(" ")} 随时都可以`,
        );
    }
    return lines.join("\n");
}

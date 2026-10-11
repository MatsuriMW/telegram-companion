import type TGInbox from "../main";
import { notifyPlugin, spiralPlugin } from "../integrations";

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
    if (a.spiral) out.push({ command: "now", description: "🌀 今天的螺旋日程" });
    if (a.companion) {
        out.push(
            { command: "summary", description: "🌙 今天做了什么（不收工）" },
            { command: "chat", description: "💬 进入对话模式" },
            { command: "record", description: "📝 回到记录模式" },
            { command: "mode", description: "🔀 现在是哪种模式" },
        );
    }
    if (a.notify) {
        out.push(
            { command: "train", description: "🏋️ 今天练什么" },
            { command: "stale", description: "🐢 拖了好几天的事" },
            { command: "cards", description: "🃏 今天到期的闪卡" },
            { command: "week", description: "🧭 这周做了什么（周洞察）" },
        );
    }
    if (a.companion) {
        out.push(
            { command: "me", description: "🪞 你现在对我的了解" },
            { command: "profile", description: "🔄 现在更新对我的了解" },
            { command: "model", description: "🧠 看 / 切换背后的模型" },
            { command: "persona", description: "🎭 看 / 切换人设" },
        );
    }
    out.push(
        { command: "task", description: "☑️ 记一条待办：/task 内容" },
        { command: "help", description: "📮 我能做的事" },
    );
    return out;
}

export function helpHtml(plugin: TGInbox): string {
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

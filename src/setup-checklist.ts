import { appHasDailyNotesPluginLoaded } from "obsidian-daily-notes-interface";
import { tr } from "./i18n";
import type TGInbox from "./main";

interface Step {
    done: boolean;
    title: string;
    /** What to do next; shown while the step is not done. */
    hint: string;
    /** Extra controls under the hint (the pairing code). */
    extra?: (el: HTMLElement) => void;
    optional?: boolean;
}

/**
 * The checklist at the top of the settings tab. Each step ticks itself off from
 * the plugin's state, so it is redrawn on the same 5-second timer as the
 * connection status. Once every required step is done it folds away.
 */
export function renderSetupChecklist(
    el: HTMLElement,
    plugin: TGInbox,
    botName: string | null,
    redraw: () => void,
): void {
    const s = plugin.settings;
    const wasOpen = el.querySelector("details")?.open;
    el.empty();

    const paired = s.allow_users.length > 0;
    const steps: Step[] = [
        {
            done: !!botName,
            title: botName
                ? tr(`机器人已连接：@${botName}`, `Bot connected: @${botName}`)
                : tr("建一个 Telegram 机器人，连上", "Create a Telegram bot and connect it"),
            hint: tr(
                "在 Telegram 里给 @BotFather 发 /newbot，按提示起名，把它给你的 token 贴进下面的「Bot token」。",
                "In Telegram, send /newbot to @BotFather, follow the prompts, and paste the token it gives you into Bot token below.",
            ),
        },
        {
            done: paired,
            title: paired
                ? tr(
                      `已配对：${s.allow_users.join("、")}`,
                      `Paired with ${s.allow_users.join(", ")}`,
                  )
                : tr("和你的 Telegram 账号配对", "Pair it with your Telegram account"),
            hint: botName
                ? tr(
                      `在 Telegram 里打开 @${botName}，点 Start，把下面的配对码发给它。只有配对过的账号发的消息才会被处理。`,
                      `Open @${botName} in Telegram, tap Start and send it the code below. Only paired accounts are answered.`,
                  )
                : tr("先做完第 1 步。", "Finish step 1 first."),
            extra: botName ? (box) => renderCode(box, plugin, redraw) : undefined,
        },
        {
            done: s.is_custom_file || appHasDailyNotesPluginLoaded(),
            title: tr("打开「日记」核心插件", "Turn on Daily notes"),
            hint: tr(
                "消息记进今天的日记，日记放哪、叫什么跟着「日记」核心插件（或 Periodic Notes）走。在 设置 → 核心插件 里打开它，设好文件夹和日期格式。",
                "Messages go into today's daily note, wherever the Daily notes core plugin (or Periodic Notes) puts it. Turn it on under Settings → Core plugins and set its folder and date format.",
            ),
        },
        {
            done: !!s.first_message_saved,
            title: tr("发第一条消息", "Send your first message"),
            hint: tr(
                "随便给机器人发一句话。它点一个 ❤️ 就是收到了，打开今天的日记就能看到。",
                "Send the bot anything. A ❤️ reaction means it got it; open today's daily note to see it.",
            ),
        },
        {
            done: !!s.model_tested,
            optional: true,
            title: tr("接上一个模型（对话才需要）", "Connect a model (only for chat)"),
            hint: tr(
                "想让它读着日记回你，就在下面「背后的模型」里选一个后端，点「发一句测试」。只当收件箱用可以跳过。",
                "For replies that draw on your notes, pick a backend in the model section below and press the test button. Skip this if you only want the inbox.",
            ),
        },
    ];

    const allDone = steps.every((st) => st.done || st.optional);
    const box = el.createEl("details", { cls: "tg-setup" + (allDone ? " is-done" : "") });
    box.open = wasOpen ?? !allDone;
    const doneCount = steps.filter((st) => st.done).length;
    box.createEl("summary", {
        text: allDone
            ? tr(
                  `✅ 已经配置好了（${doneCount}/${steps.length}）`,
                  `✅ Set up (${doneCount}/${steps.length})`,
              )
            : tr(
                  `上手清单 · ${doneCount}/${steps.length}`,
                  `Getting started · ${doneCount}/${steps.length}`,
              ),
    });

    let current = true; // the first unfinished step is highlighted
    steps.forEach((st, i) => {
        const isCurrent = !st.done && current;
        if (isCurrent) current = false;
        const row = box.createDiv({
            cls: "tg-setup-step" + (st.done ? " is-done" : "") + (isCurrent ? " is-current" : ""),
        });
        row.createSpan({ cls: "tg-setup-mark", text: st.done ? "✓" : String(i + 1) });
        const body = row.createDiv({ cls: "tg-setup-body" });
        body.createDiv({ cls: "tg-setup-title", text: st.title });
        if (!st.done) {
            body.createDiv({ cls: "tg-setup-hint", text: st.hint });
            st.extra?.(body);
        }
    });
}

function renderCode(el: HTMLElement, plugin: TGInbox, redraw: () => void): void {
    const p = plugin.pairing;
    const row = el.createDiv({ cls: "tg-setup-code-row" });
    if (p.locked || !p.code) {
        row.createSpan({
            cls: "tg-setup-hint",
            text: p.locked
                ? tr(
                      "猜错的次数太多，这个码作废了。",
                      "Too many wrong guesses; this code no longer works.",
                  )
                : "",
        });
    } else {
        row.createSpan({ cls: "tg-setup-code", text: `${p.code.slice(0, 3)} ${p.code.slice(3)}` });
    }
    const btn = row.createEl("button", { text: tr("换一个码", "New code") });
    btn.addEventListener("click", () => {
        p.renew();
        redraw();
    });
}

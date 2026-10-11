import { moment } from "obsidian";
import { type Bot, type Context } from "grammy";
import type { TGInboxSettings } from "../settings/types";
import { generateContentFromTemplate } from "../utils/template";
import { downloadAndSaveFile } from "../utils/download";
import { getFileUrl } from "../utils/file";
import type { VaultWriter } from "./vault-writer";
import { generateFilename } from "./utils";
import type { MessageUpdate } from "../type";
import type TGInbox from "../main";
import type { Companion } from "../companion/companion";
import { notifyPlugin, spiralPlugin } from "../integrations";
import { helpHtml } from "./commands";

async function executePostAction(ctx: Context, settings: TGInboxSettings): Promise<void> {
    if (settings.action_after_reception === "delete") {
        try {
            await ctx.deleteMessage();
            return;
        } catch (err) {
            console.warn("Failed to delete message, falling back to reaction:", err);
        }
    }

    try {
        await ctx.react("❤");
    } catch (err) {
        console.error("Failed to set reaction:", err);
    }
}

function handleVaultError(ctx: Context, err: Error, context: string): void {
    console.error(`Failed to ${context}. Error: ${err.message}`, err);
    ctx.reply(`Failed to ${context}. Error: ${err.message}`);
}

export function setupCommands(
    bot: Bot,
    settings: TGInboxSettings,
    vaultWriter: VaultWriter,
    plugin: TGInbox,
) {
    bot.command(["start", "help"], (ctx) => ctx.reply(helpHtml(plugin), { parse_mode: "HTML" }));

    bot.command("task", async (ctx) => {
        const task = `- [ ] ${ctx.match}`;
        try {
            await vaultWriter.insertMessageToVault(task, ctx.msg as MessageUpdate);
            await executePostAction(ctx, settings);
        } catch (err) {
            handleVaultError(ctx, err as Error, "insert task");
        }
    });
}

// 要等一会儿的回复（读日记、调模型）：先马上回一条「收到，在想……」，每隔几秒换一句进度，
// 写好后删掉这条提示、把正式回复作为新消息发出（新消息才会在手机上响，光编辑原消息不会提醒）
const THINKING: Record<string, string[]> = {
    low: ["🫂 收到了，我在……", "📖 在看你这几天的日记……", "✍️ 想想怎么跟你说……"],
    happy: ["✨ 收到！……", "📖 看看你最近都干了啥……", "✍️ 马上……"],
    chat: ["💭 收到，在想……", "📖 翻了翻你最近的日记……", "✍️ 在组织语言……"],
    summary: ["🌙 收到，在整理今天……", "📖 在读今天的日记……", "✍️ 在写小结……", "🫶 快好了……"],
    profile: ["🔄 收到，在重新认识你……", "📖 在读这周的日记……", "🧩 在整理近况……", "🫶 快好了……"],
    week: [
        "🧭 收到，在翻这一周……",
        "📖 一天一天读日记……",
        "🧩 在归类这周做的事……",
        "✍️ 在写周洞察……",
        "🫶 快好了，再等等……",
    ],
};

async function withThinking(
    ctx: Context,
    stages: string[],
    work: () => Promise<string | null>,
): Promise<void> {
    let ph: { chat: { id: number }; message_id: number } | null = null;
    let i = 0;
    try {
        ph = await ctx.reply(stages[0], { disable_notification: true });
    } catch {
        /* 发不出提示也照样往下做 */
    }
    const timer = window.setInterval(() => {
        ctx.replyWithChatAction("typing").catch(() => {});
        if (ph && i < stages.length - 1) {
            i++;
            ctx.api.editMessageText(ph.chat.id, ph.message_id, stages[i]).catch(() => {});
        }
    }, 4000);
    ctx.replyWithChatAction("typing").catch(() => {});
    try {
        const html = await work();
        window.clearInterval(timer);
        if (ph) await ctx.api.deleteMessage(ph.chat.id, ph.message_id).catch(() => {});
        if (html) await ctx.reply(html, { parse_mode: "HTML" });
    } catch (err) {
        window.clearInterval(timer);
        console.error("[telegram-companion] 生成回复", err);
        const msg =
            "😵 刚才卡住了，没写出来：" +
            String((err as Error)?.message || err).slice(0, 120) +
            "\n再发一次试试？";
        if (ph) await ctx.api.editMessageText(ph.chat.id, ph.message_id, msg).catch(() => {});
        else await ctx.reply(msg).catch(() => {});
    }
}

// 收工小结：dayOf = 消息发出时刻按日界算是哪一天
async function replyDaySummary(ctx: Context, co: Companion, msg: MessageUpdate): Promise<void> {
    const m = moment(msg.date * 1e3);
    if (m.hours() * 60 + m.minutes() < co.cutoffMin()) m.subtract(1, "day");
    await withThinking(ctx, THINKING.summary, () => co.daySummary(m.startOf("day")));
}

async function chatAnswer(ctx: Context, co: Companion, said: string): Promise<void> {
    const mood = co.moodOf(said) || co.cfg.chat?.mood || "chat";
    await withThinking(ctx, THINKING[mood] || THINKING.chat, () => co.chatReply(said));
}

// 作息口令：比较前去掉句尾的标点和语气（「去吃饭了！」「睡了～」）
const SLEEP_RE =
    /^(?:我?(?:去|要|准备|该)?睡(?:觉)?(?:了|去了|啦|咯)|睡觉|晚安|休息了|不干了|收工了?|困了睡了)$/;
const WAKE_RE = /^(?:我?起(?:床)?(?:了|啦)|起床|醒了|醒啦|早安|早)$/;
const MEAL_RE =
    /^我?(?:去|要去|准备|先去)?(?:吃(?:个|点)?(?:早|午|晚)?(?:饭|餐)|吃夜宵|开饭)(?:了|去了|啦|咯|去)?$/;
const WORKOUT_RE = /^我?(?:去|要去|先去)?(?:锻炼|健身|运动|跑步|打球|打篮球)(?:了|去了|啦|咯|去)?$/;
const NAP_RE = /^我?(?:去|先去)?(?:午睡|睡午觉|小睡|眯一?会儿?)(?:了|去了|啦|一下)?$/;
const BACK_RE =
    /^(?:我?回来了|吃完(?:饭)?了?|吃饱了|吃完啦|练完了|锻炼完了|跑完了|打完球了|运动完了|睡醒了|午睡醒了)$/;

export function setupMessageHandlers(
    bot: Bot,
    settings: TGInboxSettings,
    vaultWriter: VaultWriter,
    plugin: TGInbox,
) {
    const app = plugin.app;

    // 按钮：co| 开头的（画像建议、切模型）自己处理，其余的是「任务提醒」发来的消息上的按钮，交给它
    bot.on("callback_query:data", async (ctx) => {
        const data = String(ctx.callbackQuery.data);
        const [pre, act, id] = data.split("|");
        const mine = pre === "co";
        const co = plugin.companion.on() ? plugin.companion : null;
        const nn = notifyPlugin(app);
        if (mine ? !co : !nn?.onTgCallback) {
            await ctx.answerCallbackQuery({
                text: mine
                    ? "这台设备上没开陪伴，到电脑上再点一次"
                    : "这台设备上没有「任务提醒」插件，到电脑上再点一次",
            });
            return;
        }
        try {
            const r = mine
                ? await plugin.companion.onCallback(act, id)
                : await nn.onTgCallback(data);
            await ctx.answerCallbackQuery({ text: r.toast || "" });
            if (r.edit)
                await ctx.editMessageText(r.edit, { parse_mode: "HTML", reply_markup: r.markup });
        } catch (err) {
            console.error("[telegram-companion] 按钮回调", err);
            await ctx.answerCallbackQuery({
                text: "出错了：" + String((err as Error).message || err).slice(0, 100),
            });
        }
    });

    bot.on(["message:text", "channel_post:text"], async (ctx) => {
        const msg = ctx.msg as MessageUpdate;
        let content = generateContentFromTemplate(msg, settings);

        const co = plugin.companion.on() ? plugin.companion : null;
        const naut = spiralPlugin(app); // 螺旋日程：没装就没有 ?、作息口令、吃饭暂停
        const nn = notifyPlugin(app); // 任务提醒：没装就没有健身、拖延、闪卡、周洞察
        const said = (msg.text || "").trim();
        const said0 = said.replace(/[!！。.~～…\s]+$/, "");
        const cmd = said.replace(/[!！。.~～?？\s]+$/, "");
        const at = moment(msg.date * 1e3);
        const dayCmd = SLEEP_RE.test(said0) ? "sleep" : WAKE_RE.test(said0) ? "wake" : null;
        const breakStart = MEAL_RE.test(said0)
            ? "吃饭"
            : WORKOUT_RE.test(said0)
              ? "锻炼"
              : NAP_RE.test(said0)
                ? "午睡"
                : null;
        const breakEnd =
            BACK_RE.test(said0) ||
            (said0 === "醒了" &&
                !!naut?.settings.breakState &&
                /睡|眯/.test(naut.settings.breakState.word));

        try {
            // ---- 指令（任何模式下都生效）
            if (/^(?:帮助|怎么用|指令|\/help)$/.test(cmd)) {
                await ctx.reply(helpHtml(plugin), { parse_mode: "HTML" });
                return;
            }
            if (co) {
                const chatCmd = co.chatCommand(said);
                if (chatCmd === "enter") {
                    const was = co.chatActive();
                    await co.chatStart("explicit");
                    await ctx.reply(
                        was === "explicit"
                            ? "💬 已经在对话模式啦，接着说～"
                            : "💬 <b>进入对话模式</b>\n接下来你说的每句我都会回，这些对话不进日记。\n📝 想顺手记一句，用「记 」开头\n🚪 说「退出」回到记录模式",
                        { parse_mode: "HTML" },
                    );
                    return;
                }
                if (chatCmd === "exit") {
                    const c = await co.chatEnd();
                    await ctx.reply(
                        c
                            ? `📝 回到记录模式啦，接下来发什么我都记进日记 ${co.m}`
                            : "📝 现在就是记录模式，发什么我都记进日记",
                    );
                    return;
                }
                if (/^(?:模式|现在什么模式|\/mode)$/.test(cmd)) {
                    const a = co.chatActive();
                    const chat = co.cfg.chat;
                    const left =
                        a === "auto" && chat
                            ? Math.max(
                                  1,
                                  Math.round(
                                      (chat.last + co.cfg.chatIdleMin * 60e3 - Date.now()) / 60e3,
                                  ),
                              )
                            : 0;
                    await ctx.reply(
                        a === "explicit"
                            ? "💬 现在是<b>对话模式</b>（你自己开的），说「退出」回到记录模式"
                            : a === "auto"
                              ? `💬 现在是<b>对话模式</b>（自动进入的），再过 ${left} 分钟不说话就回到记录模式；说「退出」马上回去`
                              : "📝 现在是<b>记录模式</b>，发什么我都记进日记；说「对话模式」开始聊",
                        { parse_mode: "HTML" },
                    );
                    return;
                }
                if (/^(?:模型|换模型|切换模型|\/model)$/.test(cmd)) {
                    const m = co.modelMessage();
                    await ctx.reply(m.text, { parse_mode: "HTML", reply_markup: m.markup });
                    return;
                }
                if (/^(?:更新画像|更新档案|更新一下你对我的了解|\/profile)$/.test(cmd)) {
                    await withThinking(ctx, THINKING.profile, async () => {
                        const r = await co.profileUpdate({ manual: true });
                        if (!r.ok) throw new Error(r.msg);
                        return null;
                    });
                    return;
                }
                if (/^(?:你了解我什么|你眼里的我|画像|我的画像|\/me)$/.test(cmd)) {
                    const recent = co.recentLines(await co.read(co.cfg.profilePath));
                    const when = co.cfg.profileUpdatedAt
                        ? moment(co.cfg.profileUpdatedAt).format("M月D日")
                        : null;
                    await ctx.reply(
                        recent.length
                            ? `🪞 <b>我现在对你的了解</b>${when ? `（${when}更新）` : ""}\n\n${recent.map((x) => co.esc(x)).join("\n")}\n\n<i>更深的那部分在「陪伴档案」里；想让我现在重新看一遍，发「更新画像」</i>`
                            : "🪞 我还没整理过你的近况，发「更新画像」我现在就看一遍",
                        { parse_mode: "HTML" },
                    );
                    return;
                }
            }

            // ---- 「任务提醒」的几样（装了才有）
            if (nn?.pushWorkout && /^(?:今天练什么|练什么|健身|\/train)$/.test(cmd)) {
                await nn.pushWorkout();
                return;
            }
            if (nn?.pushStale && /^(?:拖延|拖了什么|\/stale)$/.test(cmd)) {
                if (!(await nn.pushStale()))
                    await ctx.reply(`👍 今天日记里没有拖了 ${nn.settings.staleDays} 天以上的事`);
                return;
            }
            if (nn?.pushCards && /^(?:闪卡|卡片|复习|\/cards)$/.test(cmd)) {
                if (!(await nn.pushCards()))
                    await ctx.reply("🃏 现在没有到期的卡（或者 Anki 没开着，数不了）");
                return;
            }
            if (nn?.pushInsight && /^(?:周洞察|这周做了什么|本周|\/week)$/.test(cmd)) {
                await withThinking(ctx, THINKING.week, async () => {
                    await nn.pushInsight(true);
                    return null;
                });
                return;
            }

            // ---- 「螺旋日程」的几样（装了才有）：? 看今天、吃饭 / 锻炼 / 午睡暂停、起了 / 睡了记作息
            if (naut?.capacityText && /^(?:[?？]|\/now)$/.test(said)) {
                if (naut.telegramReport) {
                    const html = await naut.telegramReport(); // 图文版，前面带一张今天的螺旋图
                    const sent =
                        naut.tgSendWithSpiral &&
                        (await naut
                            .tgSendWithSpiral(settings.token, ctx.chat.id, html)
                            .catch(() => false));
                    if (!sent) await ctx.reply(html, { parse_mode: "HTML" });
                } else {
                    await ctx.reply(await naut.capacityText());
                }
                return;
            }
            if (naut?.tgBreakStart && breakStart) {
                const r = await naut.tgBreakStart(breakStart, msg.date * 1e3);
                const icon = breakStart === "吃饭" ? "🍚" : breakStart === "锻炼" ? "🏃" : "😴";
                if (r.already) {
                    const back = /饭/.test(r.b.word)
                        ? "吃完了"
                        : /睡/.test(r.b.word)
                          ? "醒了"
                          : "回来了";
                    await ctx.reply(
                        `${icon} 你还在${r.b.word}（${moment(r.b.since).format("HH:mm")} 起），回来了说「${back}」`,
                    );
                    return;
                }
                await vaultWriter.insertMessageToVault(
                    `- **${at.format("HH:mm")}** ${breakStart}`,
                    msg,
                );
                const b = r.b;
                const n = b.labels.length;
                const go =
                    breakStart === "吃饭"
                        ? "去吃吧，好好吃饭"
                        : breakStart === "锻炼"
                          ? "去吧，练完记得发我练了什么"
                          : "睡吧，定个闹钟";
                const back =
                    breakStart === "吃饭" ? "吃完了" : breakStart === "锻炼" ? "练完了" : "醒了";
                await ctx.reply(
                    `${icon} ${go}\n${n ? `⏸ 计时暂停，先停了 ${n} 件：${b.labels.join("、")}` : "⏸ 现在没有在做的事，直接去吧"}${b.focus ? "\n⏱ 专注也先停了，回来接着开" : ""}\n回来说「${back}」，我帮你切回去`,
                );
                return;
            }
            if (naut?.tgBreakEnd && breakEnd && naut.settings.breakState) {
                const r = await naut.tgBreakEnd(msg.date * 1e3);
                const icon = /饭|餐/.test(r.word)
                    ? "🍚"
                    : /锻炼|运动|跑|球/.test(r.word)
                      ? "🏃"
                      : "😴";
                const took =
                    r.mins >= 60
                        ? `${Math.floor(r.mins / 60)} 小时 ${r.mins % 60} 分钟`
                        : `${r.mins} 分钟`;
                const lines = [`${icon} 欢迎回来 · ${r.word} ${took}（${r.from}–${r.to}）`];
                if (r.labels.length) lines.push(`▶ 已切回 DOING：${r.labels.join("、")}`);
                if (r.focus) lines.push("⏱ 专注接着开了");
                if (r.word === "锻炼")
                    lines.push("💪 练了什么？发「DONE 引体向上 40 个」这样一句，健身看板就记上了");
                await ctx.reply(lines.join("\n"));
                return;
            }
            if (naut?.markDay && dayCmd) {
                if (dayCmd === "sleep" && naut.settings.breakState) {
                    naut.settings.breakState = null; // 吃着饭就睡了：不用再问回来没
                    await naut.saveData(naut.settings);
                }
                if (dayCmd === "sleep" && co?.cfg.chat) await co.chatEnd(); // 收工也退出对话模式
                await vaultWriter.insertMessageToVault(`- **${at.format("HH:mm")}** ${said}`, msg);
                const receipt = await naut.markDay(dayCmd, msg.date * 1e3); // 先收掉工作时段，再改任务状态
                if (dayCmd === "sleep") await vaultWriter.pauseDoing(msg);
                // 回执带上今天的螺旋图（起了看今天的安排，睡了看这一天怎么过的）
                const sent =
                    naut.tgSendWithSpiral &&
                    (await naut
                        .tgSendWithSpiral(settings.token, ctx.chat.id, receipt, { html: false })
                        .catch(() => false));
                if (!sent) await ctx.reply(receipt);
                if (dayCmd === "sleep" && co) await replyDaySummary(ctx, co, msg); // 收工：再来一条今天的小结
                return;
            }

            if (co) {
                // 没装螺旋日程时的「睡了」：记一行时间、退出对话模式、发小结
                if (dayCmd === "sleep") {
                    if (co.cfg.chat) await co.chatEnd();
                    await vaultWriter.insertMessageToVault(
                        `- **${at.format("HH:mm")}** ${said}`,
                        msg,
                    );
                    await executePostAction(ctx, settings);
                    await replyDaySummary(ctx, co, msg);
                    return;
                }
                if (/^(?:小结|今天做了什么|\/summary)$/.test(cmd)) {
                    await replyDaySummary(ctx, co, msg); // 不收工，只要小结
                    return;
                }

                // ---- 两种模式
                // 这些在任何模式下都当记录：「记 」开头、任务口令、带链接的；自动进入的对话里太长的（多半是贴过来的摘录）
                const inChat = co.chatActive();
                const noted = /^记[:：\s]/.test(said);
                const recordish =
                    noted ||
                    /^(?:done|doing|todo|later|now)\b/i.test(said) ||
                    /https?:\/\//.test(said) ||
                    (inChat !== "explicit" && said.length > 100);
                if (noted) content = content.replace(/记[:：\s]+/, "");
                if (!recordish) {
                    if (inChat) {
                        await chatAnswer(ctx, co, said);
                        return;
                    }
                    // 记录模式：口癖马上回一句，不记进日记
                    const quick = await co.quip(said);
                    if (quick) {
                        if (quick.chat) await co.chatStart("auto");
                        await ctx.reply(quick.html, { parse_mode: "HTML" });
                        return;
                    }
                    // 情绪话、「聊聊 / 陪我」、回复它的消息：自动进入对话模式
                    const toBot = !!msg.reply_to_message?.from?.is_bot;
                    const mood =
                        co.moodOf(said) ||
                        (/^(?:聊聊|陪我)/.test(said) ? "low" : toBot ? "chat" : null);
                    if (mood) {
                        await co.chatStart("auto", mood);
                        await chatAnswer(
                            ctx,
                            co,
                            said.replace(/^(?:聊聊|陪我聊聊|陪我)[，,：:\s]*/, "") || said,
                        );
                        return;
                    }
                }
            }
        } catch (err) {
            handleVaultError(ctx, err as Error, "handle the message");
            return;
        }

        try {
            await vaultWriter.insertMessageToVault(content, msg);
            await executePostAction(ctx, settings);
        } catch (err) {
            handleVaultError(ctx, err as Error, "insert text message to vault");
        }
    });

    bot.on(["message:media", "channel_post:media"], async (ctx) => {
        const msg = ctx.msg as MessageUpdate;
        let mediaEmbed = "";

        if (settings.download_media) {
            const file = await ctx.getFile();
            const filename_ext = generateFilename(msg, file);
            const url = getFileUrl(file, bot.token);

            console.debug(`Attempting to download media: ${filename_ext} from ${url}`);
            const downloadResult = await downloadAndSaveFile(
                vaultWriter.getVault(),
                url,
                filename_ext,
                settings.download_dir,
            );

            if (downloadResult) {
                mediaEmbed = `![[${filename_ext}]]`;
            } else {
                console.error(`Failed to download media. File: ${filename_ext}, URL: ${url}`);
                ctx.reply(`Failed to download media. File: ${filename_ext}, URL: ${url}`);
            }
        }

        // The template can place the embed itself via {{media}} (kept unescaped),
        // so frontmatter authored in the template stays at the top of the note.
        let content = generateContentFromTemplate(msg, settings, mediaEmbed);

        // Backward-compat: if the template doesn't reference {{media}}, fall back to
        // the legacy behavior of prepending the embed.
        const templateUsesMedia = /\{\{[{&]?\s*media\s*\}{2,3}/.test(
            settings.message_template ?? "",
        );
        if (mediaEmbed && !templateUsesMedia) {
            if (settings.as_list_items) {
                // List mode: the caption is the parent item and the media hangs under it,
                // so the words and the picture stay in one block.
                content = content.trim() ? `${content.trim()}\n\t- ${mediaEmbed}` : mediaEmbed;
            } else {
                content = `${mediaEmbed}\n${content}`;
            }
        }

        if (content.length === 0) {
            console.debug("No content to insert. Skipping.");
            return;
        }

        try {
            await vaultWriter.insertMessageToVault(content, msg);
            await executePostAction(ctx, settings);
        } catch (err) {
            handleVaultError(ctx, err as Error, "insert media message to vault");
        }
    });
}

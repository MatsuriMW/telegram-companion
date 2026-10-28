import { MarkdownRenderer, Notice, Setting, type ButtonComponent, type Component } from "obsidian";
import { backendLabel, backendReady, fallbackBackend } from "./llm";
import type TGInbox from "../main";
import {
    BACKEND_NAMES,
    CLI_MODELS,
    type Backend,
    type CompanionSettings,
    type Quip,
} from "./types";
import { tr } from "../i18n";

type BoolKey = {
    [K in keyof CompanionSettings]: CompanionSettings[K] extends boolean ? K : never;
}[keyof CompanionSettings];
type TextKey = {
    [K in keyof CompanionSettings]: string extends CompanionSettings[K] ? K : never;
}[keyof CompanionSettings];
type NumKey = {
    [K in keyof CompanionSettings]: CompanionSettings[K] extends number ? K : never;
}[keyof CompanionSettings];

const OPENAI_PRESETS: [string, string][] = [
    ["https://api.deepseek.com", "DeepSeek"],
    ["https://api.openai.com/v1", "OpenAI"],
    ["https://openrouter.ai/api/v1", "OpenRouter"],
    ["http://localhost:11434/v1", tr("Ollama（本机）", "Ollama (local)")],
];

const QUIP_KINDS: Record<Quip["kind"], string> = {
    hello: tr("打招呼（带上今天在做什么）", "Greeting (mentions what you're doing today)"),
    echo: tr("跟着说（你说几声，它多说一声）", "Echo (says it back once more than you did)"),
    reply: tr("回我写的话（随机一句）", "A random line from my list"),
};

/** 设置页里「陪伴」那几节：对话、口癖、陪伴档案、背后的模型。redraw 用来在切换后端、增删口癖后重画。 */
export function renderCompanionSettings(
    containerEl: HTMLElement,
    plugin: TGInbox,
    component: Component,
    redraw: () => void,
): void {
    const co = plugin.companion;
    const cc = co.cfg;
    // 设置一改，下一次就重新从主后端试起
    const save = () => {
        co.modelChanged();
        return plugin.saveSettings();
    };
    const toggle = (name: string, desc: string, key: BoolKey) =>
        new Setting(containerEl)
            .setName(name)
            .setDesc(desc)
            .addToggle((t) =>
                t.setValue(!!cc[key]).onChange(async (v) => {
                    cc[key] = v;
                    await save();
                }),
            );
    const text = (name: string, desc: string, key: TextKey, placeholder = "", secret = false) =>
        new Setting(containerEl)
            .setName(name)
            .setDesc(desc)
            .addText((t) => {
                t.setPlaceholder(placeholder)
                    .setValue(String(cc[key] ?? ""))
                    .onChange(async (v) => {
                        cc[key] = v.trim();
                        await save();
                    });
                if (secret) t.inputEl.type = "password";
            });
    const num = (name: string, desc: string, key: NumKey) =>
        new Setting(containerEl)
            .setName(name)
            .setDesc(desc)
            .addText((t) =>
                t.setValue(String(cc[key])).onChange(async (v) => {
                    const n = +v;
                    if (n > 0) {
                        cc[key] = n;
                        await save();
                    }
                }),
            );

    // ---- 陪伴
    new Setting(containerEl).setName(tr("陪伴", "Companion")).setHeading();
    toggle(
        tr("开启陪伴", "Turn on the companion"),
        tr(
            "关掉以后它只是一个收件箱：发什么记什么，不聊天、不读日记、不调模型",
            "When off it is only an inbox: it saves what you send, and doesn't chat, read your notes or call a model",
        ),
        "enabled",
    );
    new Setting(containerEl)
        .setName(tr("陪伴档案笔记", "Profile note"))
        .setDesc(
            tr(
                "写着「我是谁、累的时候是因为什么、怎么回我」，每次回你之前都会先读；改它就能改回复的方式",
                "Says who you are, what wears you out and how you want to be answered. It is read before every reply; edit it to change how the bot answers",
            ),
        )
        .addText((t) =>
            t.setValue(cc.profilePath).onChange(async (v) => {
                cc.profilePath = v.trim();
                await save();
            }),
        )
        .addButton((b) =>
            b.setButtonText(tr("新建模板", "New template")).onClick(async () => {
                const made = await co.createProfile();
                new Notice(
                    made
                        ? tr(`已新建 ${cc.profilePath}`, `Created ${cc.profilePath}`)
                        : tr(`${cc.profilePath} 已经有了`, `${cc.profilePath} already exists`),
                );
                await plugin.app.workspace.openLinkText(cc.profilePath, "", false);
            }),
        );
    text(
        tr("回复用的语言", "Reply language"),
        tr(
            "模型写的回复用这种语言；机器人的固定提示语跟着 Obsidian 的界面语言走",
            "The language the model writes replies in. The bot's fixed messages follow Obsidian's language",
        ),
        "lang",
        tr("中文", "English"),
    );
    text(
        tr("机器人的小表情", "The bot's mascot"),
        tr(
            "出现在它的一些固定回复里，比如 🐸；可以空着",
            "Shown in some of its fixed replies, e.g. 🐸. Can be empty",
        ),
        "mascot",
    );
    num(
        tr(
            "自动进入的对话，多少分钟没说话回到记录模式",
            "Minutes of silence before an automatically started chat goes back to record mode",
        ),
        "",
        "chatIdleMin",
    );

    // ---- 人设
    new Setting(containerEl).setName(tr("人设", "Persona")).setHeading();
    toggle(
        tr("让它扮演一个角色", "Play a character"),
        tr(
            "默认它是一个爱你、关心你、带着母亲般温柔的角色。打开以后按下面那篇笔记写的角色回你：角色扮演、语 C、换一种语气都可以，语气、格式、长短全由笔记说了算。不重复说同一件事、不拿日记里别人的话套你、你明确说想伤害自己时放下角色认真回应，这几条不会变",
            "By default it is a warm, caring character who is on your side. Turn this on to have it answer as the character in the note below: role-play or just a different tone, with tone, format and length all set by the note. A few things never change: it doesn't repeat itself, doesn't apply other people's words in your notes to you, and drops the character to respond seriously if you say you want to hurt yourself",
        ),
        "personaOn",
    );
    new Setting(containerEl)
        .setName(tr("人设笔记", "Persona note"))
        .setDesc(
            tr(
                "一篇笔记，或者一个文件夹（里面每篇笔记是一个角色，在 Telegram 里发「人设」切换）",
                "A note, or a folder with one note per character (switch with /persona in Telegram)",
            ),
        )
        .addText((t) =>
            t.setValue(cc.personaPath).onChange(async (v) => {
                cc.personaPath = v.trim();
                await save();
            }),
        )
        .addButton((b) =>
            b.setButtonText(tr("新建模板", "New template")).onClick(async () => {
                const made = await co.createPersona();
                new Notice(
                    made
                        ? tr(
                              `已新建 ${made}，打开它写上角色`,
                              `Created ${made}. Open it and describe the character`,
                          )
                        : tr("这篇人设笔记已经有了", "That persona note already exists"),
                );
                const open = made ?? co.personaFiles()[0]?.path;
                if (open) await plugin.app.workspace.openLinkText(open, "", false);
            }),
        );

    // ---- 口癖
    new Setting(containerEl).setName(tr("口癖", "Catchphrases")).setHeading();
    toggle(
        tr("口癖马上回", "Answer catchphrases instantly"),
        tr(
            "你自己打招呼、撒欢的说法。发来的整句话就是下面某个触发词时，不等模型、马上回一句，这句话也不记进日记",
            "Your own greetings and happy noises. When a whole message is one of the trigger words below, it answers right away without the model, and the message is not saved",
        ),
        "quipsOn",
    );
    cc.quips.forEach((q, i) => {
        // 一条口癖的控件多，排成几行：触发词 + 回法 / 回什么 / 两个开关 + 删除
        const row = new Setting(containerEl)
            .setName(tr(`口癖 ${i + 1}`, `Catchphrase ${i + 1}`))
            .setClass("tg-companion-quip")
            .addText((t) =>
                t
                    .setPlaceholder(tr("触发词，逗号隔开", "Trigger words, separated by commas"))
                    .setValue(q.words)
                    .onChange(async (v) => {
                        q.words = v;
                        await save();
                    }),
            )
            .addDropdown((d) => {
                for (const k of Object.keys(QUIP_KINDS) as Quip["kind"][])
                    d.addOption(k, QUIP_KINDS[k]);
                d.setValue(q.kind).onChange(async (v) => {
                    q.kind = v as Quip["kind"];
                    await save();
                    redraw();
                });
            });
        if (q.kind === "reply") {
            row.addTextArea((t) => {
                t.setPlaceholder(tr("回什么，一行一句", "Replies, one per line"))
                    .setValue(q.replies)
                    .onChange(async (v) => {
                        q.replies = v;
                        await save();
                    });
                t.inputEl.rows = 3;
            });
        }
        row.controlEl.createDiv({ cls: "tg-companion-quip-break" });
        row.addToggle((t) =>
            t
                .setTooltip(
                    tr(
                        "回完这句，接下来说的话它都会接",
                        "After this reply it answers whatever you say next",
                    ),
                )
                .setValue(q.chat)
                .onChange(async (v) => {
                    q.chat = v;
                    await save();
                }),
        );
        row.controlEl.createSpan({
            cls: "tg-companion-quip-label",
            text: tr("回完进入对话模式", "Then chat"),
        });
        row.addToggle((t) =>
            t
                .setTooltip(
                    tr(
                        "说这个词代表心情好；句子里带着它也会自动进入对话模式",
                        "This word means you're in a good mood; a message containing it also starts chat mode",
                    ),
                )
                .setValue(q.happy)
                .onChange(async (v) => {
                    q.happy = v;
                    await save();
                }),
        );
        row.controlEl.createSpan({ cls: "tg-companion-quip-label", text: tr("开心", "Happy") });
        row.addExtraButton((b) =>
            b
                .setIcon("trash")
                .setTooltip(tr("删掉这条", "Delete"))
                .onClick(async () => {
                    cc.quips.splice(i, 1);
                    await save();
                    redraw();
                }),
        );
    });
    new Setting(containerEl)
        .setDesc(
            tr(
                "触发词用逗号隔开。「开心」表示你说这个词的时候心情好，句子里带着它也会自动进入对话模式",
                "Separate trigger words with commas. “Happy” means you're in a good mood when you say the word; a message containing it also starts chat mode",
            ),
        )
        .addButton((b) =>
            b.setButtonText(tr("添加口癖", "Add a catchphrase")).onClick(async () => {
                cc.quips.push({ words: "", kind: "echo", replies: "", chat: false, happy: true });
                await save();
                redraw();
            }),
        );

    // ---- 陪伴档案怎么更新
    new Setting(containerEl)
        .setName(tr("陪伴档案怎么更新", "Keeping the profile up to date"))
        .setHeading();
    toggle(
        tr("每周日重写「近况」", "Rewrite “Recently” every Sunday"),
        tr(
            "读这一周的日记、下面额外参考的笔记，整段重写档案末尾的「🔄 近况」；发现长期的新特点时发到 Telegram，点 ✅ 才写进你手写的那几节",
            "Reads the week's daily notes and the extra notes below and rewrites the “🔄 Recently” section at the end of the profile. Lasting new traits are sent to Telegram and only added to the sections you wrote if you tap ✅",
        ),
        "weeklyUpdate",
    );
    text(tr("　时间（每周日）", "　Time (Sundays)"), "", "weeklyUpdateAt", "22:30");
    toggle(
        tr("参考对话模式里你说过的话", "Use what you said in chat mode"),
        tr(
            "对话内容只存在本插件的数据里，不进日记和笔记，每周更新完就清空。关掉以后下面的「聊完就整理」也不做",
            "Chats are only kept in this plugin's data, never in your notes, and are cleared after each weekly update. When off, “Update after each chat” below is skipped too",
        ),
        "useChat",
    );
    toggle(
        tr("聊完就整理", "Update after each chat"),
        tr(
            "对话结束（退出、超时、收工）时，这段对话里你说的话够多，就把新信息并进「近况」，并告诉你记了什么；不够多就先攒着",
            "When a chat ends (you leave, it times out, or you end the day) and you said enough, new facts are merged into “Recently” and it tells you what it noted; otherwise it waits for more",
        ),
        "incUpdate",
    );
    num(
        tr("　攒够多少个字才整理", "　Characters needed before updating"),
        tr(
            "只算你说的话；之前没攒够的会一起算",
            "Only counts what you said; earlier leftovers count too",
        ),
        "incMinChars",
    );
    new Setting(containerEl)
        .setName(tr("每周更新时额外参考的笔记", "Extra notes for the weekly update"))
        .setDesc(
            tr(
                "一行一个路径，可以是笔记（取开头一段）或文件夹（取文件名排最后的那一篇），比如周报、项目复盘",
                "One path per line: a note (its opening part is used) or a folder (the note whose name sorts last), e.g. weekly reviews or project retros",
            ),
        )
        .addTextArea((t) => {
            t.setValue(cc.extraNotes).onChange(async (v) => {
                cc.extraNotes = v;
                await save();
            });
            t.inputEl.rows = 3;
        });

    // ---- 背后的模型
    new Setting(containerEl).setName(tr("背后的模型", "Model")).setHeading();
    new Setting(containerEl)
        .setName(tr("用哪个后端", "Backend"))
        .setDesc(
            tr(
                "陪聊、小结、更新档案都走这里。日记摘要和陪伴档案会发给你选的这家服务。也可以在 Telegram 里发「模型」切换",
                "Used for chat, summaries and profile updates. Your daily-note summary and profile are sent to the service you pick. You can also switch with /model in Telegram",
            ),
        )
        .addDropdown((d) => {
            for (const k of Object.keys(BACKEND_NAMES) as Backend[])
                d.addOption(k, BACKEND_NAMES[k]);
            d.setValue(cc.backend).onChange(async (v) => {
                cc.backend = v as Backend;
                await save();
                redraw();
            });
        });
    // 每种后端自己的参数：主后端和备用后端都在各自下面填
    const fields = (b: Backend) => {
        if (b === "cli") {
            text(
                tr("　claude 命令行路径", "　Path to the claude CLI"),
                tr(
                    "要先装好并登录 Claude Code；用的是命令行自己的登录，不用填 key",
                    "Install Claude Code and log in first; it uses the CLI's own login, so no key is needed",
                ),
                "cliPath",
                "~/.local/bin/claude",
            );
            const known = CLI_MODELS.includes(cc.cliModel);
            new Setting(containerEl)
                .setName(tr("　模型", "　Model"))
                .setDesc(
                    tr(
                        "可以选别名，也可以在右边填完整的模型名；空着用命令行的默认模型",
                        "Pick an alias or type a full model name on the right; empty uses the CLI's default",
                    ),
                )
                .addDropdown((d) => {
                    for (const m of CLI_MODELS) d.addOption(m, m || tr("默认", "default"));
                    if (!known) d.addOption(cc.cliModel, cc.cliModel);
                    d.setValue(cc.cliModel).onChange(async (v) => {
                        cc.cliModel = v;
                        await save();
                        redraw();
                    });
                })
                .addText((t) =>
                    t
                        .setPlaceholder(tr("完整模型名", "Full model name"))
                        .setValue(known ? "" : cc.cliModel)
                        .onChange(async (v) => {
                            cc.cliModel = v.trim();
                            await save();
                        }),
                );
        } else if (b === "anthropic") {
            text(
                "　API key",
                tr(
                    "存在本插件的 data.json 里；库要是同步到别处，记得别把这个文件公开",
                    "Stored in this plugin's data.json; if your vault syncs somewhere, keep that file private",
                ),
                "anthropicKey",
                "sk-ant-…",
                true,
            );
            text(tr("　模型", "　Model"), "", "anthropicModel", "claude-sonnet-5-5");
        } else {
            new Setting(containerEl)
                .setName(tr("　接口地址", "　API address"))
                .setDesc(
                    tr(
                        "到 /v1 为止（不带 /chat/completions）；右边可以选常用的",
                        "Up to /v1 (without /chat/completions); common ones are on the right",
                    ),
                )
                .addText((t) =>
                    t
                        .setPlaceholder("https://…/v1")
                        .setValue(cc.openaiBase)
                        .onChange(async (v) => {
                            cc.openaiBase = v.trim();
                            await save();
                        }),
                )
                .addDropdown((d) => {
                    d.addOption("", tr("常用服务…", "Common services…"));
                    for (const [url, name] of OPENAI_PRESETS) d.addOption(url, name);
                    d.onChange(async (v) => {
                        if (!v) return;
                        cc.openaiBase = v;
                        await save();
                        redraw();
                    });
                });
            text(
                "　API key",
                tr(
                    "本机的 Ollama 可以空着。存在本插件的 data.json 里",
                    "Can be empty for a local Ollama. Stored in this plugin's data.json",
                ),
                "openaiKey",
                "sk-…",
                true,
            );
            text(
                tr("　模型", "　Model"),
                tr("照那家服务的文档填模型名", "The model name from that service's docs"),
                "openaiModel",
            );
        }
    };
    fields(cc.backend);
    // 备用后端：主后端报错时自动换过去重试一次
    const others = (Object.keys(BACKEND_NAMES) as Backend[]).filter((k) => k !== cc.backend);
    const picked = cc.fallback && cc.fallback !== cc.backend ? cc.fallback : "";
    new Setting(containerEl)
        .setName(tr("备用后端", "Fallback backend"))
        .setDesc(
            (picked && !backendReady(cc, picked)
                ? tr(
                      "⚠️ 选的这个备用后端参数还没填全，现在不会生效。",
                      "⚠️ The fallback backend is not fully set up, so it is not used yet. ",
                  )
                : "") +
                tr(
                    "上面的后端报错时（额度用完、超时、登录失效），自动用备用的重试一次，回复末尾会注明这次是谁回的；之后 10 分钟直接走备用。用到备用时，日记摘要和陪伴档案也会发给备用的那家服务。选好后在下面填它的参数，比如选 OpenAI 兼容接口、接口地址选 DeepSeek，再填 key 和模型名",
                    "When the backend above fails (quota, timeout, expired login), it retries once with the fallback and notes who answered; for the next 10 minutes it goes straight to the fallback. Your daily-note summary and profile are then sent to that service too. Fill in its settings below once picked, e.g. OpenAI-compatible with DeepSeek as the address, then a key and a model name",
                ),
        )
        .addDropdown((d) => {
            d.addOption("", tr("不用备用", "No fallback"));
            for (const k of others)
                d.addOption(
                    k,
                    BACKEND_NAMES[k] +
                        (backendReady(cc, k) ? "" : tr("（参数没填全）", " (not set up)")),
                );
            d.setValue(picked).onChange(async (v) => {
                cc.fallback = v as Backend | "";
                await save();
                redraw();
            });
        });
    if (picked) fields(picked);
    const fb = fallbackBackend(cc);
    const tryOn = (b: ButtonComponent, backend: Backend, label: string) =>
        b.setButtonText(label).onClick(async () => {
            b.setDisabled(true).setButtonText(tr("在等回复…", "Waiting for a reply…"));
            try {
                const out = await co.llmOn(
                    backend,
                    tr("只回答两个字：收到", "Reply with just the word: received"),
                    60,
                );
                new Notice(
                    tr(
                        `${BACKEND_NAMES[backend]}回了：${out.slice(0, 60)}`,
                        `${BACKEND_NAMES[backend]} answered: ${out.slice(0, 60)}`,
                    ),
                );
                if (!plugin.settings.model_tested) {
                    plugin.settings.model_tested = true;
                    await plugin.saveSettings();
                }
            } catch (e) {
                new Notice(
                    tr(`${BACKEND_NAMES[backend]}没连上：`, `${BACKEND_NAMES[backend]} failed: `) +
                        String((e as Error).message || e).slice(0, 200),
                    8000,
                );
            }
            b.setDisabled(false).setButtonText(label);
        });
    const test = new Setting(containerEl)
        .setName(tr("试一下", "Test"))
        .setDesc(
            tr(
                `现在：${co.backendLabel()}${fb ? `；备用：${backendLabel(cc, fb)}` : ""}`,
                `Now: ${co.backendLabel()}${fb ? `; fallback: ${backendLabel(cc, fb)}` : ""}`,
            ),
        )
        .addButton((b) => tryOn(b, cc.backend, tr("发一句测试", "Send a test")));
    // 刚在上面填完备用的参数还没重画，按钮也要在；没填全时点了会说缺什么
    if (picked) test.addButton((b) => tryOn(b, picked, tr("测备用", "Test fallback")));

    // ---- 说明
    const help = containerEl.createDiv({ cls: "tg-companion-help" });
    help.createSpan({
        text: tr(
            "在 Telegram 里发「帮助」或 /help 看指令表；发「模式」看现在是记录还是对话，发「模型」切换背后的模型。完整说明和上手指南见 ",
            "Send /help in Telegram for the list of commands, /mode to see whether it is recording or chatting, and /model to switch models. Full docs and the getting-started guide: ",
        ),
    });
    help.createEl("a", { text: "README", href: "https://github.com/MatsuriMW/telegram-companion" });
    help.createSpan({
        text: tr(
            "。基于 icealtria 的 Telegram Inbox 修改，感谢原作者。",
            ". Based on icealtria's Telegram Inbox, with thanks.",
        ),
    });
    // 插件目录里放一份 guide.md（自己的用法备忘），会显示在这里
    const guidePath = `${plugin.manifest.dir}/guide.md`;
    void plugin.app.vault.adapter.exists(guidePath).then(async (ok) => {
        if (!ok) return;
        const guide = containerEl.createEl("details", { cls: "tg-companion-guide" });
        guide.createEl("summary", {
            text: tr("📮 我的使用说明（guide.md）", "📮 My notes (guide.md)"),
        });
        const body = guide.createDiv();
        await MarkdownRenderer.render(
            plugin.app,
            await plugin.app.vault.adapter.read(guidePath),
            body,
            "",
            component,
        );
    });
}

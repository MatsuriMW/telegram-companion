import { MarkdownRenderer, Notice, Setting, type Component } from "obsidian";
import type TGInbox from "../main";
import {
    BACKEND_NAMES,
    CLI_MODELS,
    type Backend,
    type CompanionSettings,
    type Quip,
} from "./types";

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
    ["http://localhost:11434/v1", "Ollama（本机）"],
];

const QUIP_KINDS: Record<Quip["kind"], string> = {
    hello: "打招呼（带上今天在做什么）",
    echo: "跟着说（你说几声，它多说一声）",
    reply: "回我写的话（随机一句）",
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
    const save = () => plugin.saveSettings();
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
    new Setting(containerEl).setName("陪伴").setHeading();
    toggle(
        "开启陪伴",
        "关掉以后它只是一个收件箱：发什么记什么，不聊天、不读日记、不调模型",
        "enabled",
    );
    new Setting(containerEl)
        .setName("陪伴档案笔记")
        .setDesc(
            "写着「我是谁、累的时候是因为什么、怎么回我」，每次回你之前都会先读；改它就能改回复的方式",
        )
        .addText((t) =>
            t.setValue(cc.profilePath).onChange(async (v) => {
                cc.profilePath = v.trim();
                await save();
            }),
        )
        .addButton((b) =>
            b.setButtonText("新建模板").onClick(async () => {
                const made = await co.createProfile();
                new Notice(made ? `已新建 ${cc.profilePath}` : `${cc.profilePath} 已经有了`);
                await plugin.app.workspace.openLinkText(cc.profilePath, "", false);
            }),
        );
    text("回复用的语言", "模型写的回复用这种语言；机器人的固定提示语目前只有中文", "lang", "中文");
    text("机器人的小表情", "出现在它的一些固定回复里，比如 🐸；可以空着", "mascot");
    num("自动进入的对话，多少分钟没说话回到记录模式", "", "chatIdleMin");

    // ---- 人设
    new Setting(containerEl).setName("人设").setHeading();
    toggle(
        "让它扮演一个角色",
        "默认它是一个爱你、关心你、带着母亲般温柔的角色。打开以后按下面那篇笔记写的角色回你：角色扮演、语 C、换一种语气都可以，语气、格式、长短全由笔记说了算。不重复说同一件事、不拿日记里别人的话套你、你明确说想伤害自己时放下角色认真回应，这几条不会变",
        "personaOn",
    );
    new Setting(containerEl)
        .setName("人设笔记")
        .setDesc("一篇笔记，或者一个文件夹（里面每篇笔记是一个角色，在 Telegram 里发「人设」切换）")
        .addText((t) =>
            t.setValue(cc.personaPath).onChange(async (v) => {
                cc.personaPath = v.trim();
                await save();
            }),
        )
        .addButton((b) =>
            b.setButtonText("新建模板").onClick(async () => {
                const made = await co.createPersona();
                new Notice(made ? `已新建 ${made}，打开它写上角色` : "这篇人设笔记已经有了");
                const open = made ?? co.personaFiles()[0]?.path;
                if (open) await plugin.app.workspace.openLinkText(open, "", false);
            }),
        );

    // ---- 口癖
    new Setting(containerEl).setName("口癖").setHeading();
    toggle(
        "口癖马上回",
        "你自己打招呼、撒欢的说法。发来的整句话就是下面某个触发词时，不等模型、马上回一句，这句话也不记进日记",
        "quipsOn",
    );
    cc.quips.forEach((q, i) => {
        const row = new Setting(containerEl)
            .setName(`口癖 ${i + 1}`)
            .setDesc(
                "触发词用逗号隔开；「开心」表示你说这个词的时候心情好，句子里带着它也会自动进入对话模式",
            )
            .addText((t) =>
                t
                    .setPlaceholder("触发词，逗号隔开")
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
                t.setPlaceholder("回什么，一行一句")
                    .setValue(q.replies)
                    .onChange(async (v) => {
                        q.replies = v;
                        await save();
                    });
                t.inputEl.rows = 3;
            });
        }
        row.addToggle((t) =>
            t
                .setTooltip("回完进入对话模式")
                .setValue(q.chat)
                .onChange(async (v) => {
                    q.chat = v;
                    await save();
                }),
        )
            .addToggle((t) =>
                t
                    .setTooltip("开心：说这个词代表心情好")
                    .setValue(q.happy)
                    .onChange(async (v) => {
                        q.happy = v;
                        await save();
                    }),
            )
            .addExtraButton((b) =>
                b
                    .setIcon("trash")
                    .setTooltip("删掉这条")
                    .onClick(async () => {
                        cc.quips.splice(i, 1);
                        await save();
                        redraw();
                    }),
            );
    });
    new Setting(containerEl)
        .setDesc("每条后面的两个开关依次是：回完进入对话模式、开心（鼠标停在上面有提示）")
        .addButton((b) =>
            b.setButtonText("添加口癖").onClick(async () => {
                cc.quips.push({ words: "", kind: "echo", replies: "", chat: false, happy: true });
                await save();
                redraw();
            }),
        );

    // ---- 陪伴档案怎么更新
    new Setting(containerEl).setName("陪伴档案怎么更新").setHeading();
    toggle(
        "每周日重写「近况」",
        "读这一周的日记、下面额外参考的笔记，整段重写档案末尾的「🔄 近况」；发现长期的新特点时发到 Telegram，点 ✅ 才写进你手写的那几节",
        "weeklyUpdate",
    );
    text("　时间（每周日）", "", "weeklyUpdateAt", "22:30");
    toggle(
        "参考对话模式里你说过的话",
        "对话内容只存在本插件的数据里，不进日记和笔记，每周更新完就清空。关掉以后下面的「聊完就整理」也不做",
        "useChat",
    );
    toggle(
        "聊完就整理",
        "对话结束（退出、超时、收工）时，这段对话里你说的话够多，就把新信息并进「近况」，并告诉你记了什么；不够多就先攒着",
        "incUpdate",
    );
    num("　攒够多少个字才整理", "只算你说的话；之前没攒够的会一起算", "incMinChars");
    new Setting(containerEl)
        .setName("每周更新时额外参考的笔记")
        .setDesc(
            "一行一个路径，可以是笔记（取开头一段）或文件夹（取文件名排最后的那一篇），比如周报、项目复盘",
        )
        .addTextArea((t) => {
            t.setValue(cc.extraNotes).onChange(async (v) => {
                cc.extraNotes = v;
                await save();
            });
            t.inputEl.rows = 3;
        });

    // ---- 背后的模型
    new Setting(containerEl).setName("背后的模型").setHeading();
    new Setting(containerEl)
        .setName("用哪个后端")
        .setDesc(
            "陪聊、小结、更新档案都走这里。日记摘要和陪伴档案会发给你选的这家服务。也可以在 Telegram 里发「模型」切换",
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
    if (cc.backend === "cli") {
        text(
            "　claude 命令行路径",
            "要先装好并登录 Claude Code；用的是命令行自己的登录，不用填 key",
            "cliPath",
            "~/.local/bin/claude",
        );
        const known = CLI_MODELS.includes(cc.cliModel);
        new Setting(containerEl)
            .setName("　模型")
            .setDesc("可以选别名，也可以在右边填完整的模型名；空着用命令行的默认模型")
            .addDropdown((d) => {
                for (const m of CLI_MODELS) d.addOption(m, m || "默认");
                if (!known) d.addOption(cc.cliModel, cc.cliModel);
                d.setValue(cc.cliModel).onChange(async (v) => {
                    cc.cliModel = v;
                    await save();
                    redraw();
                });
            })
            .addText((t) =>
                t
                    .setPlaceholder("完整模型名")
                    .setValue(known ? "" : cc.cliModel)
                    .onChange(async (v) => {
                        cc.cliModel = v.trim();
                        await save();
                    }),
            );
    } else if (cc.backend === "anthropic") {
        text(
            "　API key",
            "存在本插件的 data.json 里；库要是同步到别处，记得别把这个文件公开",
            "anthropicKey",
            "sk-ant-…",
            true,
        );
        text("　模型", "", "anthropicModel", "claude-sonnet-5-5");
    } else {
        new Setting(containerEl)
            .setName("　接口地址")
            .setDesc("到 /v1 为止（不带 /chat/completions）；右边可以选常用的")
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
                d.addOption("", "常用服务…");
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
            "本机的 Ollama 可以空着。存在本插件的 data.json 里",
            "openaiKey",
            "sk-…",
            true,
        );
        text("　模型", "照那家服务的文档填模型名", "openaiModel");
    }
    new Setting(containerEl)
        .setName("试一下")
        .setDesc(`现在：${co.backendLabel()}`)
        .addButton((b) =>
            b.setButtonText("发一句测试").onClick(async () => {
                b.setDisabled(true).setButtonText("在等回复…");
                try {
                    new Notice(
                        "模型回了：" + (await co.llm("只回答两个字：收到", 60)).slice(0, 60),
                    );
                } catch (e) {
                    new Notice("没连上：" + String((e as Error).message || e).slice(0, 200), 8000);
                }
                b.setDisabled(false).setButtonText("发一句测试");
            }),
        );

    // ---- 说明
    const help = containerEl.createDiv({ cls: "tg-companion-help" });
    help.createSpan({
        text: "在 Telegram 里发「帮助」或 /help 看指令表；发「模式」看现在是记录还是对话，发「模型」切换背后的模型。完整说明和上手指南见 ",
    });
    help.createEl("a", { text: "README", href: "https://github.com/MatsuriMW/telegram-companion" });
    help.createSpan({ text: "。基于 icealtria 的 Telegram Inbox 修改，感谢原作者。" });
    // 插件目录里放一份 guide.md（自己的用法备忘），会显示在这里
    const guidePath = `${plugin.manifest.dir}/guide.md`;
    void plugin.app.vault.adapter.exists(guidePath).then(async (ok) => {
        if (!ok) return;
        const guide = containerEl.createEl("details", { cls: "tg-companion-guide" });
        guide.createEl("summary", { text: "📮 我的使用说明（guide.md）" });
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

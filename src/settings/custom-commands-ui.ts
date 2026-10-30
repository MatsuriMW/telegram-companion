import { debounce, Setting } from "obsidian";
import type TGInbox from "../main";
import type { CustomCommand } from "./types";
import { BUILTINS } from "../bot/custom-commands";
import { available } from "../bot/commands";
import { tr } from "../i18n";

const KINDS: Record<CustomCommand["kind"], string> = {
    alias: tr("当成内置指令", "Same as a built-in command"),
    note: tr("记到笔记", "Save to a note"),
    ask: tr("问模型", "Ask the model"),
};

/** 设置页「自定义命令」一节。redraw 用来在增删命令、换做法后重画。 */
export function renderCustomCommands(
    containerEl: HTMLElement,
    plugin: TGInbox,
    redraw: () => void,
): void {
    const s = plugin.settings;
    // 「/」开头的触发词会进 Telegram 的指令菜单：等打完字再去更新
    const syncMenu = debounce(() => plugin.bot?.syncMenu(), 1500, true);
    const save = async () => {
        await plugin.saveSettings();
        syncMenu();
    };
    const a = available(plugin);

    new Setting(containerEl).setName(tr("自定义命令", "Custom commands")).setHeading();
    (s.custom_commands || []).forEach((c, i) => {
        const row = new Setting(containerEl)
            .setName(tr(`命令 ${i + 1}`, `Command ${i + 1}`))
            .setClass("tg-companion-quip")
            .addText((t) =>
                t
                    .setPlaceholder(tr("触发词，逗号隔开", "Trigger words, separated by commas"))
                    .setValue(c.words)
                    .onChange(async (v) => {
                        c.words = v;
                        await save();
                    }),
            )
            .addDropdown((d) => {
                for (const k of Object.keys(KINDS) as CustomCommand["kind"][])
                    d.addOption(k, KINDS[k]);
                d.setValue(c.kind).onChange(async (v) => {
                    c.kind = v as CustomCommand["kind"];
                    await save();
                    redraw();
                });
            });
        if (c.kind === "alias") {
            // 只列这台设备上能用的；已经选了的照样留着
            const opts = BUILTINS.filter((b) => !b.needs || a[b.needs] || b.key === c.target);
            if (!opts.some((b) => b.key === c.target)) {
                c.target = opts[0].key;
                void plugin.saveSettings();
            }
            row.addDropdown((d) => {
                for (const b of opts) d.addOption(b.key, b.label);
                d.setValue(c.target).onChange(async (v) => {
                    c.target = v;
                    await save();
                });
            });
        } else if (c.kind === "note") {
            row.addText((t) =>
                t
                    .setPlaceholder(
                        tr("笔记路径，空着 = 今天的日记", "Note path; empty = today's daily note"),
                    )
                    .setValue(c.path)
                    .onChange(async (v) => {
                        c.path = v;
                        await save();
                    }),
            ).addText((t) =>
                t
                    .setPlaceholder("- {{text}}")
                    .setValue(c.format)
                    .onChange(async (v) => {
                        c.format = v;
                        await save();
                    }),
            );
        } else {
            row.addTextArea((t) => {
                t.setPlaceholder(
                    tr(
                        "要它做什么，比如：根据我今天的日记，挑三件做成的事。{{text}} 是触发词后面的话",
                        "What to do, e.g. Pick three things I got done today from my notes. {{text}} is what follows the trigger",
                    ),
                )
                    .setValue(c.prompt)
                    .onChange(async (v) => {
                        c.prompt = v;
                        await save();
                    });
                t.inputEl.rows = 3;
            });
        }
        row.addExtraButton((b) =>
            b
                .setIcon("trash")
                .setTooltip(tr("删掉这条", "Delete"))
                .onClick(async () => {
                    s.custom_commands.splice(i, 1);
                    await save();
                    redraw();
                }),
        );
    });
    new Setting(containerEl)
        .setDesc(
            tr(
                "触发词可以是字、词或符号（? ! zz 灵感），逗号隔开；「/」开头、只用英文小写字母数字下划线的（/idea）还会出现在 Telegram 的「/」菜单里。当成内置指令：整句就是触发词时，等于发了那条指令。记到笔记：「灵感 内容」把内容按格式记进那篇笔记，路径空着就记到平时记消息的地方；格式里 {{text}} 是内容、{{time}} 是时刻、{{date}} 是日期，写成 - [ ] {{text}} 就是一条待办。问模型：带着陪伴档案和近一周的日记，按你写的提示词回，用的是「背后的模型」里选的那个。自定义命令比内置的说法先认",
                "A trigger can be a word or a symbol (? ! zz idea), separated by commas. One that starts with “/” and uses only lowercase letters, digits and underscores (/idea) also shows up in Telegram's “/” menu. Same as a built-in command: a message that is just the trigger does what that command does. Save to a note: “idea text” saves the text to that note in the format you give; with no path it goes where messages are normally saved. In the format, {{text}} is the text, {{time}} the time and {{date}} the date; “- [ ] {{text}}” makes a to-do. Ask the model: answers your prompt with your profile note and the last week of daily notes at hand, using the model chosen under Model. Custom commands are checked before the built-in phrases",
            ),
        )
        .addButton((b) =>
            b.setButtonText(tr("添加命令", "Add a command")).onClick(async () => {
                s.custom_commands = [
                    ...(s.custom_commands || []),
                    {
                        words: "",
                        kind: "note",
                        target: "help",
                        path: "",
                        format: "- {{text}}",
                        prompt: "",
                    },
                ];
                await save();
                redraw();
            }),
        );
}

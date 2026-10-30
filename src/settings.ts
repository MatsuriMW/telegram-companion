import { type App, Component, PluginSettingTab, Setting } from "obsidian";
import type TGInbox from "./main";
import * as Mustache from "mustache";
import { ActionAfterReception } from "./settings/types";
import { getSyncStatus, hasSyncPlugin } from "./utils/sync";
import { renderCompanionSettings } from "./companion/settings-ui";
import { renderCustomCommands } from "./settings/custom-commands-ui";
import { renderSetupChecklist } from "./setup-checklist";
import { tr } from "./i18n";

export class TGInboxSettingTab extends PluginSettingTab {
    plugin: TGInbox;
    statusEl: HTMLDivElement;
    setupEl: HTMLDivElement;
    private botName: string | null = null;
    updateId: number;
    // Owns the Markdown rendered inside the tab; unloaded each time the tab closes or redraws.
    private rendered = new Component();

    constructor(app: App, plugin: TGInbox) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();
        this.rendered.unload();
        this.rendered = new Component();
        this.rendered.load();

        const botSettingsTitle = containerEl.createDiv({
            cls: "bot-settings-title",
        });

        new Setting(botSettingsTitle).setName(tr("机器人", "Bot")).setHeading();

        this.statusEl = botSettingsTitle.createDiv({
            cls: "tg-inbox-status",
        });

        // The setup checklist goes above everything else.
        this.setupEl = createDiv();
        containerEl.insertBefore(this.setupEl, botSettingsTitle);
        this.drawSetup();

        void this.updateStatus();

        this.updateId = window.setInterval(() => {
            void this.updateStatus();
        }, 5000);

        new Setting(containerEl)
            .setName("Bot token")
            .setDesc(
                tr(
                    "在 Telegram 里找 @BotFather 建一个机器人，把它给你的 token 贴在这里",
                    "Create a bot with @BotFather in Telegram and paste the token it gives you here",
                ),
            )
            .addText((text) =>
                text
                    .setPlaceholder(tr("贴上 bot token", "Paste the bot token"))
                    .setValue(this.plugin.settings.token)
                    .onChange(async (value) => {
                        this.plugin.settings.token = value;
                        await this.plugin.saveSettings();
                    }),
            )
            .addButton((button) => {
                button.setButtonText(tr("重启", "Restart")).onClick(() => {
                    void this.plugin.initBot();
                    this.statusEl.setText(tr("正在重启……", "Restarting…"));
                });
            });

        new Setting(containerEl)
            .setName(tr("白名单", "Allowlist"))
            .setDesc(
                tr(
                    "只处理这些人发来的消息。填 Telegram 用户名（不带 @）或数字 ID，多个用逗号隔开。空着的时候，用上面清单里的配对码就能把自己加进来",
                    "Only messages from these accounts are handled: Telegram usernames (without @) or numeric IDs, separated by commas. While it is empty, the pairing code in the checklist above adds you",
                ),
            )
            .addText((text) =>
                text
                    .setPlaceholder(tr("用户名或数字 ID", "Username or numeric ID"))
                    .setValue(this.plugin.settings.allow_users.join(","))
                    .onChange(async (value) => {
                        this.plugin.settings.allow_users = value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean);
                        if (
                            this.plugin.settings.allow_users.length === 0 &&
                            !this.plugin.pairing.code
                        ) {
                            this.plugin.pairing.renew();
                        }
                        await this.plugin.saveSettings();
                        this.drawSetup();
                    }),
            );

        new Setting(containerEl).setName(tr("消息怎么记", "How messages are saved")).setHeading();

        new Setting(containerEl)
            .setName(tr("下载图片和文件", "Download pictures and files"))
            .setDesc(
                tr(
                    "把消息里的图片、文件存进库里，并嵌进日记",
                    "Save pictures and files from messages into the vault and embed them in the daily note",
                ),
            )
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.download_media).onChange(async (value) => {
                    this.plugin.settings.download_media = value;
                    await this.plugin.saveSettings();
                    this.toggleVisibility(downloadDirContainer, value);
                }),
            );

        const downloadDirContainer = containerEl.createDiv({
            cls: "tg-inbox-setting-collapsible",
        });
        this.toggleVisibility(downloadDirContainer, this.plugin.settings.download_media);

        new Setting(downloadDirContainer)
            .setName(tr("存到哪个文件夹", "Folder"))
            .setDesc(tr("图片和文件存放的文件夹", "Where pictures and files are saved"))
            .addText((text) =>
                text
                    .setPlaceholder(tr("文件夹路径", "Folder path"))
                    .setValue(this.plugin.settings.download_dir)
                    .onChange(async (value) => {
                        this.plugin.settings.download_dir = value;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(downloadDirContainer)
            .setName(tr("图片显示宽度", "Picture width"))
            .setDesc(
                tr(
                    "嵌进日记的图片显示成原来的百分之几。100 = 不限制；50 = 原来的一半（按图片自己的宽度算，超过正文宽度的按正文宽度算）。只管新收到的图片",
                    "Embedded pictures are shown at this percentage of their own width (capped at the line width). 100 leaves them as they are; 50 is half. Only affects new pictures",
                ),
            )
            .addSlider((slider) =>
                slider
                    .setLimits(10, 100, 10)
                    .setValue(this.plugin.settings.image_scale)
                    .onChange(async (value) => {
                        this.plugin.settings.image_scale = value;
                        await this.plugin.saveSettings();
                    }),
            );

        const message_template_desc = createFragment((frag) => {
            frag.append(tr("每条消息记成什么样。", "How each message is written. "));
            frag.createEl("a", {
                text: tr("模板里能用的变量（英文）", "Variables you can use"),
                href: "https://github.com/icealtria/obsidian-telegram-inbox/wiki/Message-template",
            });
        });

        new Setting(containerEl)
            .setName(tr("消息模板", "Message template"))
            .setDesc(message_template_desc)
            .addTextArea((textArea) => {
                textArea.inputEl.rows = 3;
                textArea.setValue(this.plugin.settings.message_template).onChange(async (value) => {
                    this.plugin.settings.message_template = value;
                    await this.plugin.saveSettings();
                });
            })
            .addButton((button) => {
                button.setButtonText(tr("检查", "Validate")).onClick(() => {
                    try {
                        Mustache.parse(this.plugin.settings.message_template);
                        templateValidStatus.setText(
                            tr(
                                "✅ 模板格式没问题（只检查了格式，不保证里面的变量名都对）",
                                "✅ The template parses (variable names are not checked)",
                            ),
                        );
                    } catch (err) {
                        console.error("Error parsing message template:", err);
                        templateValidStatus.setText(
                            tr(
                                `❌ 模板格式有错：${(err as Error).message}`,
                                `❌ Template error: ${(err as Error).message}`,
                            ),
                        );
                    }
                });
            });

        const templateValidStatus = containerEl.createDiv();

        new Setting(containerEl)
            .setName(tr("收到以后", "After a message is saved"))
            .setDesc(
                tr(
                    "消息记好以后怎么示意。「删除消息」需要机器人有相应权限（在频道或群里要是管理员）",
                    "How the bot shows a message was saved. Deleting needs permission (in channels and groups the bot must be an admin)",
                ),
            )
            .addDropdown((dropdown) => {
                dropdown
                    .addOption("react", tr("点一个 ❤", "React with ❤"))
                    .addOption("delete", tr("删除消息", "Delete the message"))
                    .setValue(this.plugin.settings.action_after_reception)
                    .onChange(async (value: ActionAfterReception) => {
                        this.plugin.settings.action_after_reception = value;
                        await this.plugin.saveSettings();
                    });
            });

        renderCustomCommands(containerEl, this.plugin, () => {
            window.clearInterval(this.updateId);
            this.display();
        });

        new Setting(containerEl).setName(tr("进阶", "Advanced")).setHeading();

        new Setting(containerEl)
            .setName(tr("新消息放在上面", "Newest first"))
            .setDesc(tr("倒序排列，最新的消息在最前面", "Put the newest message at the top"))
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.reverse_order).onChange(async (value) => {
                    this.plugin.settings.reverse_order = value;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName(tr("插到某个标题后面", "Insert after a heading"))
            .setDesc(
                tr(
                    "把消息插到日记里指定的那一行后面，而不是文末",
                    "Insert messages after a given line of the daily note instead of at the end",
                ),
            )
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.settings.insert_after_heading)
                    .onChange(async (value) => {
                        this.plugin.settings.insert_after_heading = value;
                        await this.plugin.saveSettings();
                        this.toggleVisibility(targetHeadingContainer, value);
                    });
            });

        const targetHeadingContainer = containerEl.createDiv({
            cls: "tg-inbox-setting-collapsible",
        });
        this.toggleVisibility(targetHeadingContainer, this.plugin.settings.insert_after_heading);

        new Setting(targetHeadingContainer)
            .setName(tr("哪个标题", "Heading"))
            .setDesc(
                tr(
                    "消息会插在这一行后面，比如 ## Inbox；要和日记里那一行一模一样",
                    "Messages go after this line, e.g. ## Inbox. It must match the line in the note exactly",
                ),
            )
            .addText((text) => {
                text.setPlaceholder("## Inbox")
                    .setValue(this.plugin.settings.target_heading)
                    .onChange(async (value) => {
                        this.plugin.settings.target_heading = value || "## Inbox";
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName(tr("启动时不自动收消息", "Don't fetch messages on startup"))
            .setDesc(
                tr(
                    "打开以后要自己运行命令「启动机器人」或「收一次消息」才会收。两台设备都装了这个插件时，可以在其中一台打开",
                    "Messages are only fetched when you run “Start the bot” or “Fetch messages once”. Useful on one of two devices that both have the plugin",
                ),
            )
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.settings.disable_auto_reception)
                    .onChange(async (value) => {
                        this.plugin.settings.disable_auto_reception = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName(tr("去掉文字格式", "Remove formatting"))
            .setDesc(
                createFragment((fragment) => {
                    fragment.append(
                        tr("去掉消息里的", "Remove "),
                        createEl("b", { text: tr("粗体", "bold") }),
                        tr("、", ", "),
                        createEl("i", { text: tr("斜体", "italic") }),
                        tr("、", ", "),
                        createEl("s", { text: tr("删除线", "strikethrough") }),
                        tr("等格式", " and other formatting from messages"),
                    );
                }),
            )
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.remove_formatting).onChange(async (value) => {
                    this.plugin.settings.remove_formatting = value;
                    await this.plugin.saveSettings();
                    markdownEscaper.setDisabled(value);
                    markdownEscaper.settingEl.classList.toggle("tg-inbox-setting-disabled", value);
                });
            });

        const markdownEscaper = new Setting(containerEl)
            .setName(tr("转义 Markdown 符号", "Escape Markdown"))
            .setDesc(
                tr(
                    "让消息里的 Markdown 符号原样显示。比如 [link](https://example.com) 会显示成这串字符，而不是一个链接",
                    "Show Markdown characters in messages as they are; [link](https://example.com) stays text instead of becoming a link",
                ),
            )
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.markdown_escaper).onChange(async (value) => {
                    this.plugin.settings.markdown_escaper = value;
                    await this.plugin.saveSettings();
                });
            });

        if (this.plugin.settings.remove_formatting) {
            markdownEscaper.setDisabled(true);
            markdownEscaper.settingEl.classList.add("tg-inbox-setting-disabled");
        }

        new Setting(containerEl)
            .setName(tr("存到指定的笔记", "Save to a fixed note"))
            .setDesc(
                tr(
                    "不记进日记，改记到你指定的笔记里",
                    "Save messages to a note of your choice instead of the daily note",
                ),
            )
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.is_custom_file).onChange(async (value) => {
                    this.plugin.settings.is_custom_file = value;
                    await this.plugin.saveSettings();
                    this.toggleVisibility(customPathContainer, value);
                    this.toggleVisibility(timeCutoffContainer, !value);
                });
            });

        const custom_path_desc = createFragment((frag) => {
            frag.append(tr("消息存到哪篇笔记。", "The note messages are saved to. "));
            frag.createEl("a", {
                text: tr("路径里能用的变量（英文）", "Variables you can use"),
                href: "https://github.com/icealtria/obsidian-telegram-inbox/wiki/Custom-path",
            });
        });

        const customPathContainer = containerEl.createDiv({
            cls: "tg-inbox-setting-collapsible",
        });
        this.toggleVisibility(customPathContainer, this.plugin.settings.is_custom_file);

        new Setting(customPathContainer)
            .setName(tr("笔记路径", "Note path"))
            .setDesc(custom_path_desc)
            .addText((text) => {
                text.setPlaceholder(tr("默认：Telegram-Inbox.md", "Default: Telegram-Inbox.md"))
                    .setValue(this.plugin.settings.custom_file_path)
                    .onChange((value) => {
                        this.plugin.settings.custom_file_path = value;
                        void this.plugin.saveSettings();
                    });
            });

        const timeCutoffContainer = containerEl.createDiv({
            cls: "tg-inbox-setting-collapsible",
        });
        this.toggleVisibility(timeCutoffContainer, !this.plugin.settings.is_custom_file);

        // Daily note time cutoff setting
        const timeCutoffSetting = new Setting(timeCutoffContainer)
            .setName(tr("日界时间", "Day starts at"))
            .setDesc(
                tr(
                    "几点以前发的消息算前一天。经常熬夜的话设成 04:00 之类，凌晨发的就会记进前一天的日记。格式 HH:MM（24 小时制）",
                    "Messages sent before this time count as the previous day. Night owls can set 04:00 so late-night messages go into the previous day's note. Format HH:MM (24-hour)",
                ),
            )
            .addText((text) => {
                text.setPlaceholder("00:00")
                    .setValue(this.plugin.settings.daily_note_time_cutoff)
                    .onChange((value) => {
                        this.validateAndSetTimeCutoff(value, text.inputEl, timeCutoffSetting);
                    });
            });

        const runAfterSyncSetting = new Setting(containerEl)
            .setName(tr("等同步完再启动", "Wait for sync"))
            .setDesc(
                tr(
                    "启动时等 Obsidian 同步完成再开始收消息",
                    "On startup, wait for sync to finish before fetching messages",
                ),
            )
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.run_after_sync).onChange(async (value) => {
                    this.plugin.settings.run_after_sync = value;
                    await this.plugin.saveSettings();
                });
            });

        if (!hasSyncPlugin(this.app)) {
            runAfterSyncSetting.setDesc(
                tr(
                    "要装了 Obsidian Sync 或 Remotely 系列同步插件才能用",
                    "Needs Obsidian Sync or a Remotely Save / Remotely Sync plugin",
                ),
            );
            runAfterSyncSetting.setDisabled(true);
            runAfterSyncSetting.setClass("tg-inbox-setting-disabled");
        }

        const { obsidianSync, remotelySave, remotelySync } = getSyncStatus(this.app);
        const syncStatusDiv = containerEl.createDiv({ cls: "tg-inbox-sync-status" });
        if (obsidianSync) {
            syncStatusDiv.createDiv({ text: tr("Obsidian Sync：已启用", "Obsidian Sync: on") });
        }
        if (remotelySave) {
            syncStatusDiv.createDiv({ text: tr("Remotely Save：已启用", "Remotely Save: on") });
        }
        if (remotelySync) {
            syncStatusDiv.createDiv({ text: tr("Remotely Sync：已启用", "Remotely Sync: on") });
        }

        new Setting(containerEl)
            .setName(tr("记成列表项", "Save as list items"))
            .setDesc(
                tr(
                    "消息里每一行顶格的文字都变成一个列表项（前面加「- 」），图片挂在配文下面。本来就是列表的行（•、·、1、、① 这类写法也算）沿用它自己的标志和缩进层级，不再多加一层。转发来的文章里有「# 标题」的话，标题变成一个列表项，下面的内容都缩进一格挂在它下面（## 再往里挂一层）。日记是大纲式写法的话打开",
                    "Each top-level line of a message becomes a list item (“- ”), with pictures under their caption. Lines that already are list items (•, ·, 1., ① and the like) keep their own marker and depth. A “# heading” becomes an item with everything under it indented one level (## one level deeper). Turn on if your daily notes are outlines",
                ),
            )
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.as_list_items).onChange(async (value) => {
                    this.plugin.settings.as_list_items = value;
                    await this.plugin.saveSettings();
                }),
            );

        new Setting(containerEl)
            .setName(tr("记下收到的时刻", "Stamp the arrival time"))
            .setDesc(
                tr(
                    "每条消息的第一行前面加上收到的时刻（**14:05**）。todo / doing / done 这类任务行不加，它们有自己的时间；已经以时间开头的也不加",
                    "Put the time a message arrived (**14:05**) in front of its first line. Not added to todo / doing / done task lines, which have their own times, or to lines that already start with a time",
                ),
            )
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.stamp_time).onChange(async (value) => {
                    this.plugin.settings.stamp_time = value;
                    await this.plugin.saveSettings();
                }),
            );

        new Setting(containerEl)
            .setName(tr("转发来的消息挂一个标签", "Tag forwarded messages"))
            .setDesc(
                tr(
                    "转发的消息是别人的话：在它第一行末尾挂上这个标签（比如 #摘录），留空就不挂",
                    "Forwarded messages are someone else's words: add this tag (e.g. #quote) to the end of their first line. Leave empty for none",
                ),
            )
            .addText((text) =>
                text.setValue(this.plugin.settings.forward_tag).onChange(async (value) => {
                    this.plugin.settings.forward_tag = value.trim();
                    await this.plugin.saveSettings();
                }),
            );

        renderCompanionSettings(containerEl, this.plugin, this.rendered, () => {
            window.clearInterval(this.updateId);
            this.display();
        });
    }

    hide() {
        window.clearInterval(this.updateId);
        this.rendered.unload();
    }

    private toggleVisibility(el: HTMLElement, visible: boolean) {
        el.classList.toggle("is-visible", visible);
    }

    async updateStatus() {
        try {
            const me = await this.plugin.getBotInfo();
            this.botName = me?.username ?? null;
        } catch {
            this.botName = null;
        }
        this.statusEl.setText(
            this.botName
                ? tr(`✅ 已连接 @${this.botName}`, `✅ Connected @${this.botName}`)
                : tr("❌ 没连上", "❌ Not connected"),
        );
        this.drawSetup();
    }

    private drawSetup() {
        if (this.setupEl)
            renderSetupChecklist(this.setupEl, this.plugin, this.botName, () => this.drawSetup());
    }

    private validateAndSetTimeCutoff(value: string, inputEl: HTMLInputElement, setting: Setting) {
        const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
        const isValid = timeRegex.test(value);

        if (isValid) {
            // Valid time format
            inputEl.classList.remove("tg-inbox-time-input-error");
            this.removeErrorText(setting);
            this.plugin.settings.daily_note_time_cutoff = value;
            void this.plugin.saveSettings();
        } else {
            // Invalid time format
            inputEl.classList.add("tg-inbox-time-input-error");
            this.showErrorText(
                setting,
                tr(
                    "时间格式不对，要写成 HH:MM（00:00–23:59）",
                    "Wrong format; use HH:MM (00:00–23:59)",
                ),
            );
        }
    }

    private showErrorText(setting: Setting, message: string) {
        // Remove existing error text
        this.removeErrorText(setting);

        // Add error text
        setting.descEl.createDiv({
            cls: "tg-inbox-error-text",
            text: message,
        });
    }

    private removeErrorText(setting: Setting) {
        const existingError = setting.descEl.querySelector(".tg-inbox-error-text");
        if (existingError) {
            existingError.remove();
        }
    }
}

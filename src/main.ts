import { Notice, Plugin } from "obsidian";
import { TelegramBot } from "./bot";
import { type TGInboxSettings, DEFAULT_SETTINGS } from "./settings/types";
import { TGInboxSettingTab } from "./settings";
import { runAfterSync } from "./utils/sync";
import { Companion } from "./companion/companion";

export default class TGInbox extends Plugin {
    settings: TGInboxSettings;
    bot: TelegramBot | null;
    companion: Companion;
    botInfo: {
        username: string;
        isConnected: boolean;
    };

    async onload() {
        this.addSettingTab(new TGInboxSettingTab(this.app, this));
        this.addCommands();
        await this.loadSettings();
        this.companion = new Companion(this);
        this.registerInterval(
            window.setInterval(() => {
                this.companion.tick().catch((e) => console.error("[telegram-companion] tick", e));
            }, 30 * 1000),
        );

        if (this.settings.disable_auto_reception) {
            this.addRibbonIcon("send", "Telegram Companion：收一次消息", () => {
                this.bot?.getUpdates();
            });
        }

        // Defer bot startup until the workspace (and therefore the vault file
        // index) is ready. Otherwise the queued Telegram updates that arrive in
        // the burst right after `onload` are processed before
        // getAbstractFileByPath/getFileByPath work, which makes createTargetFile
        // spuriously try to re-create an existing folder ("Folder already
        // exists") and silently drop those messages.
        this.app.workspace.onLayoutReady(() => {
            if (this.settings.run_after_sync) {
                runAfterSync.call(this, () => {
                    this.initBot();
                });
            } else {
                this.initBot();
            }
        });
    }

    addCommands() {
        this.addCommand({
            id: "tg-inbox-getupdates",
            name: "收一次消息",
            callback: () => this.bot?.getUpdates(),
        });

        this.addCommand({
            id: "tg-inbox-start",
            name: "启动机器人",
            callback: () => this.startBot(),
        });

        this.addCommand({
            id: "tg-inbox-stop",
            name: "停止机器人",
            callback: () => this.stopBot(),
        });

        this.addCommand({
            id: "profile-create",
            name: "陪伴档案：新建一份模板",
            callback: async () => {
                const made = await this.companion.createProfile();
                const path = this.companion.cfg.profilePath;
                new Notice(made ? `已新建 ${path}，打开它填上你自己的情况` : `${path} 已经有了`);
                await this.app.workspace.openLinkText(path, "", false);
            },
        });

        this.addCommand({
            id: "profile-update",
            name: "陪伴档案：现在更新「近况」并发到 Telegram",
            callback: async () => {
                new Notice("在更新陪伴档案（要一两分钟），好了会发到 Telegram");
                const r = await this.companion.profileUpdate({ manual: true });
                if (!r.ok) new Notice(r.msg ?? "没写成");
            },
        });

        this.addCommand({
            id: "profile-digest",
            name: "陪伴档案：现在把对话里的新信息整理进去",
            callback: async () => {
                const r = await this.companion.digestChat({ force: true });
                new Notice(
                    r.ok
                        ? r.noted
                            ? "整理好了，发到 Telegram 了"
                            : "这些话里没有要记的新信息"
                        : r.skipped
                          ? "没有还没整理的对话"
                          : (r.msg ?? "没写成"),
                );
            },
        });
    }

    async getBotInfo() {
        if (this.bot) {
            return this.bot.bot.api.getMe();
        }
        return null;
    }

    async onunload() {
        this.stopBot();
        console.log("telegram companion unloaded");
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async initBot() {
        try {
            if (!this.settings.token) {
                new Notice("还没填 Telegram bot token");
                return;
            }
            await this.stopBot();
            this.bot = new TelegramBot(this.app.vault, this.settings, this);
            if (!this.settings.disable_auto_reception) {
                this.startBot();
            }
        } catch (error) {
            console.error("Error launching bot:", error);
            new Notice("机器人没启动成功");
            this.bot = null;
        }
    }

    async startBot() {
        new Notice("Telegram 机器人启动中");
        if (this.bot) {
            this.bot.start();
        }
    }

    async stopBot() {
        try {
            if (this.bot) {
                await this.bot.bot.stop();
                console.log("bot stopped");
                new Notice("Telegram 机器人已停止");
            }
        } catch (error) {
            console.error("Error stopping bot:", error);
        }
    }
}

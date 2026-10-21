import { Notice, Plugin } from "obsidian";
import { TelegramBot } from "./bot";
import { type TGInboxSettings, DEFAULT_SETTINGS } from "./settings/types";
import { TGInboxSettingTab } from "./settings";
import { runAfterSync } from "./utils/sync";
import { Companion } from "./companion/companion";
import { Pairing } from "./bot/pairing";
import { tr } from "./i18n";

export default class TGInbox extends Plugin {
    settings: TGInboxSettings;
    bot: TelegramBot | null;
    companion: Companion;
    /** Pairing code for the first owner; only used while the allowlist is empty. */
    pairing = new Pairing();
    botInfo: {
        username: string;
        isConnected: boolean;
    };

    async onload() {
        this.addSettingTab(new TGInboxSettingTab(this.app, this));
        this.addCommands();
        await this.loadSettings();
        if (this.settings.allow_users.length === 0) this.pairing.renew();
        this.companion = new Companion(this);
        this.registerInterval(
            window.setInterval(() => {
                this.companion.tick().catch((e) => console.error("[telegram-companion] tick", e));
            }, 30 * 1000),
        );

        if (this.settings.disable_auto_reception) {
            this.addRibbonIcon(
                "send",
                tr("Telegram Companion：收一次消息", "Telegram Companion: fetch messages once"),
                () => {
                    void this.bot?.getUpdates();
                },
            );
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
                    void this.initBot();
                });
            } else {
                void this.initBot();
            }
        });
    }

    addCommands() {
        this.addCommand({
            id: "tg-inbox-getupdates",
            name: tr("收一次消息", "Fetch messages once"),
            callback: () => this.bot?.getUpdates(),
        });

        this.addCommand({
            id: "tg-inbox-start",
            name: tr("启动机器人", "Start the bot"),
            callback: () => this.startBot(),
        });

        this.addCommand({
            id: "tg-inbox-stop",
            name: tr("停止机器人", "Stop the bot"),
            callback: () => this.stopBot(),
        });

        this.addCommand({
            id: "profile-create",
            name: tr("陪伴档案：新建一份模板", "Profile note: create from template"),
            callback: async () => {
                const made = await this.companion.createProfile();
                const path = this.companion.cfg.profilePath;
                new Notice(
                    made
                        ? tr(
                              `已新建 ${path}，打开它填上你自己的情况`,
                              `Created ${path}. Open it and fill in your own details`,
                          )
                        : tr(`${path} 已经有了`, `${path} already exists`),
                );
                await this.app.workspace.openLinkText(path, "", false);
            },
        });

        this.addCommand({
            id: "profile-update",
            name: tr(
                "陪伴档案：现在更新「近况」并发到 Telegram",
                "Profile note: update “Recently” now and send it to Telegram",
            ),
            callback: async () => {
                new Notice(
                    tr(
                        "在更新陪伴档案（要一两分钟），好了会发到 Telegram",
                        "Updating the profile note (a minute or two); the result goes to Telegram",
                    ),
                );
                const r = await this.companion.profileUpdate({ manual: true });
                if (!r.ok) new Notice(r.msg ?? tr("没写成", "Not written"));
            },
        });

        this.addCommand({
            id: "profile-digest",
            name: tr(
                "陪伴档案：现在把对话里的新信息整理进去",
                "Profile note: add what came up in chat now",
            ),
            callback: async () => {
                const r = await this.companion.digestChat({ force: true });
                new Notice(
                    r.ok
                        ? r.noted
                            ? tr("整理好了，发到 Telegram 了", "Done; sent to Telegram")
                            : tr(
                                  "这些话里没有要记的新信息",
                                  "Nothing new worth noting in those messages",
                              )
                        : r.skipped
                          ? tr("没有还没整理的对话", "No chat left to go through")
                          : (r.msg ?? tr("没写成", "Not written")),
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

    onunload() {
        void this.stopBot();
    }

    async loadSettings() {
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            (await this.loadData()) as Partial<TGInboxSettings>,
        );
        // Installs from before the setup checklist: a known owner chat means messages have come in.
        if (this.settings.first_message_saved === undefined && this.settings.owner_chat_id) {
            this.settings.first_message_saved = true;
        }
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async initBot() {
        try {
            if (!this.settings.token) {
                new Notice(tr("还没填 Telegram bot token", "No Telegram bot token yet"));
                return;
            }
            await this.stopBot();
            this.bot = new TelegramBot(this.app.vault, this.settings, this);
            if (!this.settings.disable_auto_reception) {
                this.startBot();
            }
        } catch (error) {
            console.error("Error launching bot:", error);
            new Notice(tr("机器人没启动成功", "The bot did not start"));
            this.bot = null;
        }
    }

    startBot() {
        new Notice(tr("Telegram 机器人启动中", "Starting the Telegram bot"));
        if (this.bot) {
            this.bot.start();
        }
    }

    async stopBot() {
        try {
            if (this.bot) {
                await this.bot.bot.stop();
                new Notice(tr("Telegram 机器人已停止", "Telegram bot stopped"));
            }
        } catch (error) {
            console.error("Error stopping bot:", error);
        }
    }
}

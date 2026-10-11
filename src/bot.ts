import { Bot } from "grammy";
import { type Vault } from "obsidian";
import type { TGInboxSettings } from "./settings/types";
import {
    createRestrictToAllowedUsersMiddleware,
    createRecordUpdateIdMiddleware,
} from "./bot/middleware";
import { VaultWriter } from "./bot/vault-writer";
import { setupCommands, setupMessageHandlers } from "./bot/handlers";
import { telegramCommands } from "./bot/commands";
import type TGInbox from "./main";

const DEFAULT_OFFSET = 1;

export class TelegramBot {
    bot: Bot;
    vault: Vault;
    settings: TGInboxSettings;
    update_id = 0;
    private vaultWriter: VaultWriter;

    constructor(
        vault: Vault,
        settings: TGInboxSettings,
        private plugin: TGInbox,
    ) {
        this.vault = vault;
        this.settings = settings;
        this.vaultWriter = new VaultWriter(plugin.app, vault, settings);
        this.bot = new Bot(settings.token);

        if (settings.disable_auto_reception) {
            this.bot.init();
        }

        this.setupMiddlewares();
        this.setupHandlers();
        this.setupErrorHandling();
    }

    private setupMiddlewares(): void {
        this.bot.use(
            createRestrictToAllowedUsersMiddleware(this.settings, () =>
                this.plugin.companion.saveSoon(),
            ),
        );
        this.bot.use(
            createRecordUpdateIdMiddleware((id) => {
                this.update_id = id;
            }),
        );
    }

    private setupHandlers(): void {
        setupCommands(this.bot, this.settings, this.vaultWriter, this.plugin);
        setupMessageHandlers(this.bot, this.settings, this.vaultWriter, this.plugin);
    }

    private setupErrorHandling(): void {
        this.bot.catch((err) => {
            console.error("An error occurred in the Telegram bot:", err);
        });
    }

    start(): void {
        // Register the "/" menu; only the commands that work with what is installed.
        this.bot.api.setMyCommands(telegramCommands(this.plugin)).catch(() => {});
        this.bot.start();
    }

    async getUpdates(): Promise<void> {
        try {
            const offset = this.update_id ? this.update_id + 1 : DEFAULT_OFFSET;
            const updates = await this.bot.api.getUpdates({ offset });

            for (const update of updates) {
                await this.bot.handleUpdate(update);
            }

            if (updates.length > 0 && this.update_id) {
                // Acknowledge the last update
                await this.bot.api.getUpdates({
                    offset: this.update_id + 1,
                    limit: 1,
                });
            }
        } catch (error) {
            console.error("Error getting updates:", error);
            throw error;
        }
    }
}

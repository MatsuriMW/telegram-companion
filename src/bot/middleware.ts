import { Composer, type Context } from "grammy";
import type { TGInboxSettings } from "../settings/types";
import { tr } from "../i18n";
import type { Pairing } from "./pairing";

const ALLOWED_CHAT_TYPES = ["private", "channel", "supergroup"] as const;

function isAllowedChatType(type: string): type is (typeof ALLOWED_CHAT_TYPES)[number] {
    return ALLOWED_CHAT_TYPES.includes(type as (typeof ALLOWED_CHAT_TYPES)[number]);
}

function isAuthorizedUser(
    settings: TGInboxSettings,
    userId: number | undefined,
    username: string | undefined,
): boolean {
    if (username && settings.allow_users.includes(username)) {
        return true;
    }
    if (userId && settings.allow_users.includes(userId.toString())) {
        return true;
    }
    return false;
}

/** What the bot says to someone in a private chat while nobody is on the allowlist. */
async function pairWith(
    ctx: Context,
    settings: TGInboxSettings,
    userId: number,
    pairing: Pairing,
    onPaired: () => void,
): Promise<void> {
    const result = pairing.attempt(userId, ctx.message?.text ?? "");
    if (result === "paired") {
        settings.allow_users = [String(userId)];
        settings.owner_chat_id = ctx.chat!.id;
        onPaired();
        await ctx.reply(
            tr(
                "✅ 配对好了。现在发给我的文字、图片、链接都会记进今天的日记。发 /help 看全部指令。",
                "✅ Paired. Text, photos and links you send me now go into today's daily note. Send /help to see every command.",
            ),
        );
    } else if (result === "no-digits") {
        await ctx.reply(
            tr(
                "👋 还没配对。打开 Obsidian → 设置 → Telegram Companion，把那里显示的 6 位配对码发给我。",
                "👋 Not paired yet. Open Obsidian → Settings → Telegram Companion and send me the 6-digit pairing code shown there.",
            ),
        );
    } else if (result === "wrong") {
        await ctx.reply(
            tr(
                "配对码不对。看一眼 Obsidian 设置页里的码，再发一次。",
                "That code doesn't match. Check the code in the Obsidian settings and send it again.",
            ),
        );
    }
    // "locked" and "no-code": stay silent, so guessing gets no feedback.
}

export function createRestrictToAllowedUsersMiddleware(
    settings: TGInboxSettings,
    onOwnerChat?: () => void,
    pair?: { pairing: Pairing; onPaired: () => void },
): Composer<Context> {
    return new Composer().use(async (ctx: Context, next) => {
        const chat = ctx.chat;

        if (!chat || !isAllowedChatType(chat.type)) {
            console.debug("Unauthorized chat type:", chat?.type, chat?.id);
            return;
        }

        const from = ctx.from;
        const userId = from?.id ?? chat.id;
        const username = from?.username ?? chat.username;

        if (isAuthorizedUser(settings, userId, username)) {
            // Remember the owner's private chat so the bot can message them first
            // (idle notice, weekly profile update, reminders from other plugins).
            if (chat.type === "private" && settings.owner_chat_id !== chat.id) {
                settings.owner_chat_id = chat.id;
                onOwnerChat?.();
            }
            await next();
        } else if (pair && chat.type === "private" && settings.allow_users.length === 0) {
            await pairWith(ctx, settings, userId, pair.pairing, pair.onPaired);
        } else {
            console.warn(
                `Unauthorized access attempt: User ${username || userId} tried to access the bot at ${new Date().toISOString()}`,
            );
        }
    });
}

export function createRecordUpdateIdMiddleware(
    updateIdCallback: (updateId: number) => void,
): Composer<Context> {
    return new Composer().use(async (ctx: Context, next) => {
        const updateId = ctx.update?.update_id;
        if (updateId) {
            updateIdCallback(updateId);
        }
        await next();
    });
}

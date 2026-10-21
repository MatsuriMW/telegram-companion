import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Context } from "grammy";
import { createRestrictToAllowedUsersMiddleware } from "../src/bot/middleware";
import { Pairing } from "../src/bot/pairing";
import { DEFAULT_SETTINGS, type TGInboxSettings } from "../src/settings/types";

function setup(allow: string[] = []) {
    const settings: TGInboxSettings = { ...DEFAULT_SETTINGS, allow_users: [...allow] };
    const pairing = new Pairing();
    const code = pairing.renew();
    let saved = 0;
    const mw = createRestrictToAllowedUsersMiddleware(settings, undefined, {
        pairing,
        onPaired: () => saved++,
    }).middleware();
    const send = async (text: string, userId = 42) => {
        const replies: string[] = [];
        let passed = false;
        const ctx = {
            chat: { id: 1000 + userId, type: "private" },
            from: { id: userId, username: "someone" },
            message: { text },
            reply: async (t: string) => void replies.push(t),
        } as unknown as Context;
        await mw(ctx, async () => {
            passed = true;
        });
        return { replies, passed };
    };
    return { settings, code, send, saved: () => saved };
}

describe("pairing middleware", () => {
    it("explains pairing when an unpaired bot gets /start", async () => {
        const { send, settings } = setup();
        const r = await send("/start");
        assert.equal(r.passed, false);
        assert.equal(r.replies.length, 1);
        assert.deepEqual(settings.allow_users, []);
    });

    it("pairs on the right code and does not file the code as a message", async () => {
        const { send, settings, code, saved } = setup();
        const r = await send(code);
        assert.equal(r.passed, false);
        assert.deepEqual(settings.allow_users, ["42"]);
        assert.equal(settings.owner_chat_id, 1042);
        assert.equal(saved(), 1);
        assert.equal((await send("hello")).passed, true);
    });

    it("says the code is wrong, and stays silent to others once someone is paired", async () => {
        const { send, code } = setup();
        const wrong = code === "000000" ? "111111" : "000000";
        assert.equal((await send(wrong)).replies.length, 1);
        await send(code);
        const stranger = await send(code, 7);
        assert.deepEqual(stranger, { replies: [], passed: false });
    });

    it("leaves an existing allowlist alone", async () => {
        const { send, settings, code } = setup(["me"]);
        const r = await send(code);
        assert.deepEqual(r, { replies: [], passed: false });
        assert.deepEqual(settings.allow_users, ["me"]);
    });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Pairing, WRONG_PER_USER, WRONG_TOTAL } from "../src/bot/pairing";

describe("Pairing", () => {
    it("makes a six-digit code", () => {
        const p = new Pairing();
        for (let i = 0; i < 50; i++) assert.match(p.renew(), /^\d{6}$/);
    });

    it("pairs on the right code, with or without spaces or /start", () => {
        const p = new Pairing();
        const code = p.renew();
        assert.equal(p.attempt(1, `/start ${code.slice(0, 3)} ${code.slice(3)}`), "paired");
        assert.equal(p.code, null);
        assert.equal(p.attempt(2, code), "no-code");
    });

    it("counts wrong guesses per account", () => {
        const p = new Pairing();
        const code = p.renew();
        const wrong = code === "000000" ? "111111" : "000000";
        for (let i = 0; i < WRONG_PER_USER; i++) assert.equal(p.attempt(1, wrong), "wrong");
        assert.equal(p.attempt(1, code), "locked");
        assert.equal(p.attempt(2, code), "paired");
    });

    it("stops working after too many wrong guesses in total, until renewed", () => {
        const p = new Pairing();
        const code = p.renew();
        const wrong = code === "000000" ? "111111" : "000000";
        for (let i = 0; i < WRONG_TOTAL; i++) p.attempt(100 + i, wrong);
        assert.ok(p.locked);
        assert.equal(p.attempt(999, code), "locked");
        const next = p.renew();
        assert.equal(p.attempt(999, next), "paired");
    });

    it("a message without digits is not a guess", () => {
        const p = new Pairing();
        const code = p.renew();
        for (let i = 0; i < WRONG_PER_USER + 1; i++)
            assert.equal(p.attempt(1, "/start"), "no-digits");
        assert.equal(p.attempt(1, code), "paired");
    });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FallbackRunner, PRIMARY_COOLDOWN_MS } from "../src/companion/fallback";
import type { Backend } from "../src/companion/types";

// 记下每次调的是哪个后端；fail 里的后端一律报错
function fake(fail: Backend[]) {
    const calls: Backend[] = [];
    const call = async (b: Backend) => {
        calls.push(b);
        if (fail.includes(b)) throw new Error(`${b} down`);
        return `from ${b}`;
    };
    return { calls, call };
}

describe("FallbackRunner", () => {
    it("uses only the primary when it works", async () => {
        const f = fake([]);
        const r = await new FallbackRunner().run("cli", "openai", f.call);
        assert.deepEqual(r, { text: "from cli", backend: "cli" });
        assert.deepEqual(f.calls, ["cli"]);
    });

    it("retries on the fallback when the primary fails, and says why", async () => {
        const f = fake(["cli"]);
        const r = await new FallbackRunner().run("cli", "openai", f.call);
        assert.equal(r.text, "from openai");
        assert.equal(r.backend, "openai");
        assert.deepEqual(r.fellBack, { from: "cli", why: "cli down" });
        assert.deepEqual(f.calls, ["cli", "openai"]);
    });

    it("throws the primary's error untouched when there is no fallback", async () => {
        const f = fake(["cli"]);
        await assert.rejects(new FallbackRunner().run("cli", null, f.call), /^Error: cli down$/);
        assert.deepEqual(f.calls, ["cli"]);
    });

    it("ignores a fallback that is the same backend as the primary", async () => {
        const f = fake(["cli"]);
        await assert.rejects(new FallbackRunner().run("cli", "cli", f.call), /cli down/);
        assert.deepEqual(f.calls, ["cli"]);
    });

    it("reports both errors when the fallback fails too", async () => {
        const f = fake(["cli", "openai"]);
        await assert.rejects(
            new FallbackRunner().run("cli", "openai", f.call),
            /cli down；备用后端也没连上：openai down/,
        );
    });

    it("skips the failed primary during the cooldown, then tries it again", async () => {
        const runner = new FallbackRunner();
        const f = fake(["cli"]);
        await runner.run("cli", "openai", f.call, 0);
        const r = await runner.run("cli", "openai", f.call, PRIMARY_COOLDOWN_MS - 1);
        assert.equal(r.backend, "openai");
        assert.deepEqual(r.fellBack, { from: "cli", why: "cli down" });
        assert.deepEqual(f.calls, ["cli", "openai", "openai"]);

        const ok = fake([]);
        const back = await runner.run("cli", "openai", ok.call, PRIMARY_COOLDOWN_MS + 1);
        assert.deepEqual(back, { text: "from cli", backend: "cli" });
    });

    it("goes back to the primary during the cooldown if the fallback fails", async () => {
        const runner = new FallbackRunner();
        await runner.run("cli", "openai", fake(["cli"]).call, 0);
        const f = fake(["openai"]);
        const r = await runner.run("cli", "openai", f.call, 1000);
        assert.deepEqual(r, { text: "from cli", backend: "cli" });
        assert.deepEqual(f.calls, ["openai", "cli"]);
    });

    it("forgets the failure after reset or when the primary changes", async () => {
        const runner = new FallbackRunner();
        await runner.run("cli", "openai", fake(["cli"]).call, 0);
        runner.reset();
        const a = fake([]);
        await runner.run("cli", "openai", a.call, 1000);
        assert.deepEqual(a.calls, ["cli"]);

        await runner.run("cli", "openai", fake(["cli"]).call, 2000);
        const b = fake([]);
        await runner.run("anthropic", "openai", b.call, 3000);
        assert.deepEqual(b.calls, ["anthropic"]);
    });
});

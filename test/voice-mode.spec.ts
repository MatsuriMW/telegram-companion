import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Companion } from "../src/companion/companion";

// chatCommand 不读实例状态，直接在原型上调
const cmd = (s: string) => Companion.prototype.chatCommand.call({}, s);

describe("chatCommand voice mode", () => {
    it("recognises /voice and the Chinese phrases", () => {
        for (const s of ["/voice", "语音模式", "语音聊天！", "用语音回我", "说给我听~"])
            assert.equal(cmd(s), "voice", s);
    });

    it("keeps the existing chat and exit commands", () => {
        assert.equal(cmd("/chat"), "enter");
        assert.equal(cmd("退出"), "exit");
        assert.equal(cmd("/record"), "exit");
    });

    it("does not fire inside a longer sentence", () => {
        assert.equal(cmd("语音模式怎么开"), null);
    });
});

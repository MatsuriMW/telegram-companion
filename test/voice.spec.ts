import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { speakable, splitCommand } from "../src/companion/voice";

describe("speakable", () => {
    it("drops HTML, entities, links and emoji", () => {
        assert.equal(
            speakable("<b>早点睡</b> 🌙 明天见 &amp; 加油 https://example.com/x"),
            "早点睡 明天见 & 加油。",
        );
    });

    it("ends each line with a stop so the voice pauses there", () => {
        assert.equal(speakable("今天辛苦了\n明天再说吧。"), "今天辛苦了。\n明天再说吧。");
    });

    it("strips list markers and empty lines", () => {
        assert.equal(speakable("- 喝水\n\n2. 早睡\n• 散步！"), "喝水。\n早睡。\n散步！");
    });

    it("leaves nothing when there is nothing to say", () => {
        assert.equal(speakable("✨🫶"), "");
    });
});

describe("splitCommand", () => {
    it("splits on whitespace", () => {
        assert.deepEqual(splitCommand("  tts  -o {out} - "), ["tts", "-o", "{out}", "-"]);
    });

    it("keeps quoted parts together, including empty ones", () => {
        assert.deepEqual(splitCommand(`say --voice "温柔 女声" '' {text}`), [
            "say",
            "--voice",
            "温柔 女声",
            "",
            "{text}",
        ]);
    });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { speakable, splitCommand, voiceForm } from "../src/companion/voice";

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

describe("voiceForm", () => {
    const audio = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0, 255, 13, 10]);

    it("builds a multipart body with chat_id, reply target, buttons and the voice file", () => {
        const f = voiceForm(42, audio, { replyTo: 7, markup: { inline_keyboard: [] } }, "B");
        assert.equal(f.contentType, "multipart/form-data; boundary=B");
        const text = Buffer.from(f.body).toString("latin1");
        assert.match(text, /^--B\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n42\r\n/);
        assert.match(text, /name="reply_parameters"\r\n\r\n\{"message_id":7\}\r\n/);
        assert.match(text, /name="reply_markup"\r\n\r\n\{"inline_keyboard":\[\]\}\r\n/);
        assert.match(
            text,
            /name="voice"; filename="reply\.ogg"\r\nContent-Type: audio\/ogg\r\n\r\n/,
        );
        assert.ok(text.endsWith("\r\n--B--\r\n"));
    });

    it("keeps the audio bytes as they are", () => {
        const body = Buffer.from(voiceForm(42, audio, {}, "B").body);
        const head = body.indexOf("OggS");
        assert.ok(body.subarray(head, head + audio.length).equals(Buffer.from(audio)));
    });

    it("leaves out reply_parameters and reply_markup when not given", () => {
        const text = Buffer.from(voiceForm(42, audio, {}, "B").body).toString("latin1");
        assert.ok(!text.includes("reply_parameters"));
        assert.ok(!text.includes("reply_markup"));
    });
});

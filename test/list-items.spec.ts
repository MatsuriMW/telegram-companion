import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toListItems } from "../src/bot/vault-writer";
import { stripCopyHeaders } from "../src/utils/template";

describe("toListItems", () => {
    it("prefixes top-level lines and drops blank lines", () => {
        assert.equal(toListItems("first\n\nsecond"), "- first\n- second");
    });

    it("keeps existing list items and indented lines", () => {
        assert.equal(toListItems("- a\n\t- child\n1. b\nplain"), "- a\n\t- child\n1. b\n- plain");
    });

    it("does not put a second marker in front of bullets written with other glyphs", () => {
        assert.equal(toListItems("• a\n· b\n·c\n▪️ d"), "- a\n- b\n- c\n- d");
    });

    it("turns other numbering into Markdown numbering", () => {
        assert.equal(
            toListItems("1、a\n2.b\n3）c\n（4）d\n(5) e\n⑥ f\n七、g\n（十二）h"),
            "1. a\n2. b\n3. c\n4. d\n5. e\n6. f\n7. g\n12. h",
        );
    });

    it("leaves numbers that are not numbering as text", () => {
        assert.equal(
            toListItems("3.53 复制打开\n一、二线城市\n1、2 线都有\n07:02 起床"),
            "- 3.53 复制打开\n- 一、二线城市\n- 1、2 线都有\n- 07:02 起床",
        );
    });

    it("keeps the depth of indented items, whatever their marker", () => {
        assert.equal(
            toListItems("标题\n• a\n  ◦ a1\n  ◦ a2\n      ▪ deep\n• b\n   1、b1"),
            "- 标题\n- a\n\t- a1\n\t- a2\n\t\t- deep\n- b\n\t1. b1",
        );
    });

    it("keeps indented text under its item without making it an item", () => {
        assert.equal(
            toListItems("1. a\n   说明\n   - b\n     再说明"),
            "1. a\n\t说明\n\t- b\n\t\t再说明",
        );
    });

    it("reads dashes as bullets only when several lines start with one", () => {
        assert.equal(toListItems("– a\n– b"), "- a\n- b");
        assert.equal(toListItems("一句话\n— Naval"), "- 一句话\n- — Naval");
    });

    it("makes a top-level code block its own item, with the body indented", () => {
        assert.equal(
            toListItems("note\n```js\nlet a = 1\n```\nafter"),
            "- note\n- ```js\n\tlet a = 1\n\t```\n- after",
        );
    });

    it("hangs an indented code block under the previous item", () => {
        assert.equal(toListItems("note\n  ```\n  x\n  ```"), "- note\n\t  ```\n\t  x\n\t  ```");
    });
});

describe("stripCopyHeaders", () => {
    it("removes the header Telegram Desktop adds when copying several messages", () => {
        const copied = "Alice, [2026年10月9日 16:02]\nhello\n\nAlice, [2026年10月9日 16:03]\nworld";
        assert.equal(stripCopyHeaders(copied), "hello\n\nworld");
    });

    it("handles numeric dates with AM/PM", () => {
        assert.equal(stripCopyHeaders("Bob, [10/9/2026 4:02 PM]\nhi"), "hi");
    });

    it("leaves ordinary text alone", () => {
        assert.equal(stripCopyHeaders("a, b [not a date]\nc"), "a, b [not a date]\nc");
    });
});

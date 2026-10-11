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

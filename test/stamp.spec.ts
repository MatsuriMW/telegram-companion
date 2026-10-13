import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { stampFirstLine, tagFirstLine } from "../src/bot/vault-writer";

describe("stampFirstLine", () => {
    test("puts the time in front of the first list item only", () => {
        assert.equal(stampFirstLine("- first\n- second", "14:05"), "- **14:05** first\n- second");
    });

    test("stamps a plain line too", () => {
        assert.equal(stampFirstLine("just text", "09:00"), "**09:00** just text");
    });

    test("leaves a line that already starts with a time", () => {
        assert.equal(stampFirstLine("- **07:37** woke up", "14:05"), "- **07:37** woke up");
        assert.equal(stampFirstLine("- 00:25 chapter", "14:05"), "- 00:25 chapter");
    });

    test("leaves separators and code blocks", () => {
        assert.equal(stampFirstLine("- ---", "14:05"), "- ---");
        assert.equal(stampFirstLine("- ```js\n\tlet a\n\t```", "14:05"), "- ```js\n\tlet a\n\t```");
    });

    test("keeps children under the stamped item", () => {
        assert.equal(
            stampFirstLine("- caption\n\t- ![[a.png]]", "14:05"),
            "- **14:05** caption\n\t- ![[a.png]]",
        );
    });
});

describe("tagFirstLine", () => {
    test("appends the tag to the first line", () => {
        assert.equal(
            tagFirstLine("- quoted words\n- more", "#quote"),
            "- quoted words #quote\n- more",
        );
    });

    test("does not add it twice", () => {
        assert.equal(tagFirstLine("- quoted #quote", "#quote"), "- quoted #quote");
    });
});

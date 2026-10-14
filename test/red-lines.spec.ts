import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { minorPersonaLine } from "../src/companion/red-lines";

describe("minorPersonaLine", () => {
    it("catches an explicit age under 18", () => {
        assert.equal(minorPersonaLine("- 你是谁\n\t- 小雪，16 岁，高一"), "小雪，16 岁，高一");
        assert.ok(minorPersonaLine("十五岁的邻家妹妹"));
        assert.ok(minorPersonaLine("年龄：14"));
        assert.ok(minorPersonaLine("a 15-year-old girl"));
        assert.ok(minorPersonaLine("她还是个初中生"));
        assert.ok(minorPersonaLine("未成年的角色"));
    });
    it("lets adult and unrelated mentions through", () => {
        assert.equal(minorPersonaLine("小雪，20 岁，大二学生"), null);
        assert.equal(minorPersonaLine("二十二岁，刚毕业"), null);
        assert.equal(minorPersonaLine("比我小两岁"), null);
        assert.equal(minorPersonaLine("她 12 岁那年搬到了上海"), null);
        assert.equal(minorPersonaLine("她不是未成年，是大学生"), null);
        assert.equal(minorPersonaLine("可爱的 JK 风格，但已经是大学生了"), null);
    });
});

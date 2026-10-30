import { describe, it } from "node:test";
import assert from "node:assert/strict";
import moment from "moment";
import { askText, matchCustom, menuCommands, noteLine } from "../src/bot/custom-commands";
import { Companion } from "../src/companion/companion";
import { helpHtml, telegramCommands } from "../src/bot/commands";
import type { CustomCommand } from "../src/settings/types";

const cmd = (words: string, kind: CustomCommand["kind"], more: Partial<CustomCommand> = {}) =>
    ({ words, kind, target: "now", path: "", format: "", prompt: "", ...more }) as CustomCommand;

describe("matchCustom", () => {
    const cmds = [
        cmd("?, 日程", "alias"),
        cmd("??", "alias", { target: "summary" }),
        cmd("灵感, /idea", "note", { path: "灵感.md" }),
        cmd("!", "note"),
        cmd("复盘, Recap", "ask"),
    ];

    it("an alias needs the whole message, trailing punctuation aside", () => {
        assert.equal(matchCustom(cmds, "日程")?.cmd.target, "now");
        assert.equal(matchCustom(cmds, "日程！")?.cmd.target, "now");
        assert.equal(matchCustom(cmds, "?")?.cmd.target, "now");
        assert.equal(matchCustom(cmds, "日程表"), null);
    });

    it("the longest trigger wins", () => {
        assert.equal(matchCustom(cmds, "??")?.cmd.target, "summary");
    });

    it("a word trigger needs a separator; a symbol trigger does not", () => {
        assert.equal(matchCustom(cmds, "灵感 写一篇关于睡眠的")?.rest, "写一篇关于睡眠的");
        assert.equal(matchCustom(cmds, "灵感：写一篇")?.rest, "写一篇");
        assert.equal(matchCustom(cmds, "灵感来自于生活"), null);
        assert.equal(matchCustom(cmds, "!买牛奶")?.rest, "买牛奶");
        assert.equal(matchCustom(cmds, "/idea 播客选题")?.rest, "播客选题");
    });

    it("is case-insensitive and keeps the text as typed", () => {
        assert.equal(matchCustom(cmds, "recap This Week")?.rest, "This Week");
        assert.equal(matchCustom(cmds, "Recapped"), null);
    });

    it("a trigger with only punctuation after it has no text", () => {
        const hit = matchCustom(cmds, "复盘？");
        assert.equal(hit?.cmd.kind, "ask");
        assert.equal(hit?.rest, "");
    });

    it("no commands, no match", () => {
        assert.equal(matchCustom(undefined, "?"), null);
        assert.equal(matchCustom([cmd("", "note")], "anything"), null);
    });
});

describe("menuCommands", () => {
    it("registers only triggers Telegram accepts, once each", () => {
        const out = menuCommands([
            cmd("/idea, 灵感, /想法", "note", { path: "灵感.md" }),
            cmd("/Recap, /idea", "ask", { prompt: "复盘今天" }),
        ]);
        assert.deepEqual(
            out.map((o) => o.command),
            ["idea", "recap"],
        );
        assert.match(out[0].description, /灵感\.md/);
        assert.match(out[1].description, /复盘今天/);
    });
});

describe("noteLine", () => {
    const at = moment("2026-10-30 14:05", "YYYY-MM-DD HH:mm");

    it("fills in text, time and date", () => {
        assert.equal(noteLine("- {{time}} {{text}}", "买牛奶", at), "- 14:05 买牛奶");
        assert.equal(
            noteLine("- [ ] {{text}} 📅 {{date}}", "交稿", at),
            "- [ ] 交稿 📅 2026-10-30",
        );
    });

    it("defaults to a list item and appends the text when the format has no slot", () => {
        assert.equal(noteLine("", "买牛奶", at), "- 买牛奶");
        assert.equal(noteLine("- #idea", "播客", at), "- #idea 播客");
    });

    it("indents later lines under a list item", () => {
        assert.equal(noteLine("- {{text}}", "第一行\n第二行", at), "- 第一行\n\t第二行");
        assert.equal(noteLine("{{text}}", "第一行\n第二行", at), "第一行\n第二行");
    });

    it("leaves $ patterns in the text alone", () => {
        assert.equal(noteLine("- {{text}}", "花了 $& 和 $1", at), "- 花了 $& 和 $1");
    });
});

describe("askText", () => {
    it("puts the text into the slot, or after the prompt", () => {
        assert.equal(askText("翻成英文：{{text}}", "你好"), "翻成英文：你好");
        assert.equal(askText("复盘今天", ""), "复盘今天");
        assert.equal(askText("帮我想标题", "关于睡眠"), "帮我想标题\n\n关于睡眠");
    });
});

describe("Companion.chatTrigger", () => {
    const co = Object.create(Companion.prototype) as Companion;
    co.cfg = { chatWords: "对话模式, 我想问你, 对话一下, ??, let's talk" } as Companion["cfg"];

    it("the whole message is a phrase", () => {
        assert.equal(co.chatTrigger("对话模式"), "whole");
        assert.equal(co.chatTrigger("对话一下吧"), "lead");
        assert.equal(co.chatTrigger("我想问你！"), "whole");
        assert.equal(co.chatTrigger("??"), "whole");
    });

    it("a message starting with a phrase", () => {
        assert.equal(co.chatTrigger("我想问你，明天穿什么"), "lead");
        assert.equal(co.chatTrigger("我想问你明天穿什么"), "lead");
        assert.equal(co.chatTrigger("?? 今天怎么样"), "lead");
        assert.equal(co.chatTrigger("Let's talk about work"), "lead");
    });

    it("moods, greetings and look-alike words do not count", () => {
        assert.equal(co.chatTrigger("好累"), null);
        assert.equal(co.chatTrigger("哈哈哈 搞定了"), null);
        assert.equal(co.chatTrigger("let's talking"), null);
        assert.equal(co.chatTrigger("今天想问你一件事"), null);
    });
});

describe("menu and help", () => {
    const plugin = {
        app: { plugins: { plugins: {} } },
        settings: {
            custom_commands: [
                cmd("/idea, 灵感", "note", { path: "Ideas.md" }),
                cmd("zz", "alias", { target: "sleep" }),
                cmd("/help", "ask", { prompt: "anything" }),
            ],
        },
        companion: {
            on: () => true,
            m: "✨",
            cfg: {
                chatWords: "let's talk, I want to ask you, <b>, extra",
                quips: [],
                quipsOn: false,
            },
            esc: (s: string) =>
                s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
        },
    } as unknown as Parameters<typeof telegramCommands>[0];

    it("the / menu gets the user's slash triggers once, without shadowing built-ins", () => {
        const names = telegramCommands(plugin).map((c) => c.command);
        assert.equal(names.filter((n) => n === "idea").length, 1);
        assert.equal(names.filter((n) => n === "help").length, 1);
    });

    it("help lists the chat phrases and the user's commands, escaped", () => {
        const html = helpHtml(plugin);
        assert.match(
            html,
            /<code>let's talk<\/code> <code>I want to ask you<\/code> <code>&lt;b&gt;<\/code>/,
        );
        assert.doesNotMatch(html, /extra/);
        assert.match(html, /<code>\/idea<\/code> 📌 Save to Ideas\.md/);
        assert.match(html, /<code>zz<\/code> 😴 End the day/);
    });
});

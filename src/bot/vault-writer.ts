import { moment, type App, type Vault } from "obsidian";
import type { TGInboxSettings } from "../settings/types";
import { insertMessage, insertMessageAtTop, insertMessageAfterHeading } from "../io";
import { getOrCreateNote, getSavePath } from "../utils/file";
import type { MessageUpdate } from "../type";
import { pauseDoingTasks, placeTaskLines } from "./task-zones";

const MD_ITEM = /^(?:[-*+]|\d+[.)])\s+/;
// Bullets other apps write: "• item", "· item".
const GLYPH_BULLET = /^[•‣⁃◦∙·・▪▫●○◆◇■]️?\s*/;
// A dash can also open a quote's attribution ("— Naval"), so it only counts as a
// bullet when the message has several such lines.
const DASH_BULLET = /^[‐‒–—−－]\s+/;
const CN_DIGITS = "一二三四五六七八九";

/** 一 … 九十九; NaN for anything else. */
function cnNumber(s: string): number {
    const digit = (c: string) =>
        c.length === 1 && CN_DIGITS.includes(c) ? CN_DIGITS.indexOf(c) + 1 : NaN;
    if (!s.includes("十")) return digit(s);
    const [tens, ones] = s.split("十");
    return (tens ? digit(tens) : 1) * 10 + (ones ? digit(ones) : 0);
}

/**
 * Numbering that Markdown does not read as a list: "1.text", "1、", "（1）", "①", "一、".
 * Returns the line as "1. text", or null when it does not start with one. A number
 * followed by another number ("3.53", "一、二线城市") is not numbering.
 */
function orderedItem(body: string): string | null {
    let n = NaN;
    let m =
        body.match(/^(\d{1,3})(?:[.)](?=[^\s\d])|[、．）](?!\s*\d)\s*)/) ??
        body.match(/^[（(](\d{1,3})[)）]\s*/);
    if (m) {
        n = Number(m[1]);
    } else if ((m = body.match(/^([①-⒛])\s*/))) {
        // ①–⑳, ⑴–⒇, ⒈–⒛
        n = ((m[1].charCodeAt(0) - 0x2460) % 20) + 1;
    } else if (
        (m =
            body.match(/^([一二三四五六七八九十]{1,3})[、．](?!\s*[一二三四五六七八九十])\s*/) ??
            body.match(/^[（(]([一二三四五六七八九十]{1,3})[)）]\s*/))
    ) {
        n = cnNumber(m[1]);
    }
    if (!m || Number.isNaN(n) || body.length === m[0].length) return null;
    return `${n}. ${body.slice(m[0].length)}`;
}

/** The line as a Markdown list item if it already is a list item in some notation, else null. */
function asListItem(body: string, dashBullets: boolean): string | null {
    if (MD_ITEM.test(body)) return body;
    const bullet = body.match(GLYPH_BULLET) ?? (dashBullets ? body.match(DASH_BULLET) : null);
    if (bullet) return body.length > bullet[0].length ? "- " + body.slice(bullet[0].length) : null;
    return orderedItem(body);
}

const indentWidth = (indent: string) => [...indent].reduce((w, c) => w + (c === "\t" ? 4 : 1), 0);

// "## Title" (closing hashes allowed); "#tag" has no space and stays a tag.
const HEADING = /^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;

/**
 * Turns every top-level line into a list item and drops blank lines. A line that
 * already is a list item keeps its own marker instead of getting a second one:
 * bullets like "•" and "·" become "- ", numbering like "1、" and "①" becomes "1. ".
 * Indented list items keep their depth, written with tabs; other indented lines stay
 * as text under the item they belong to. A top-level code block becomes one item with
 * its body indented; an indented code block hangs under the item before it.
 * A heading ("# Title") becomes an item and everything after it hangs one level under
 * it, until a heading of the same or a higher level; "##" under "#" nests a level deeper.
 */
export function toListItems(content: string): string {
    const lines = String(content).split("\n");
    const dashBullets = lines.filter((l) => DASH_BULLET.test(l.trimStart())).length > 1;
    const out: string[] = [];
    // Levels of the headings the current line sits under, outermost first.
    const headings: number[] = [];
    const base = () => "\t".repeat(headings.length);
    // Indent widths of the items the current line can sit under, outermost first.
    const open: number[] = [];
    let inFence = false;
    for (const line of lines) {
        const fence = /^\s*(```|~~~)/.test(line);
        if (inFence || (fence && open.length && !/^(```|~~~)/.test(line))) {
            out.push(base() + "\t" + line);
            if (fence) inFence = !inFence;
            continue;
        }
        if (fence) {
            out.push(base() + "- " + line.trimStart());
            open.length = 0;
            open.push(0);
            inFence = true;
            continue;
        }
        if (line.trim() === "") continue;
        let indent = line.match(/^\s*/)?.[0] ?? "";
        const body = line.slice(indent.length);
        const heading = !indent ? body.match(HEADING) : null;
        if (heading?.[2]) {
            const level = heading[1].length;
            while (headings.length && headings[headings.length - 1] >= level) headings.pop();
            out.push(base() + "- " + heading[2]);
            headings.push(level);
            open.length = 0;
            continue;
        }
        // Indented text right under a heading starts the heading's own items.
        if (indent && !open.length && headings.length) indent = "";
        const item = asListItem(body, dashBullets);
        if (!indent) {
            out.push(base() + (item ?? "- " + body));
            open.length = 0;
            open.push(0);
            continue;
        }
        if (!open.length) {
            out.push(line);
            continue;
        }
        const width = indentWidth(indent);
        if (!item) {
            out.push(base() + "\t".repeat(open.filter((w) => w < width).length) + body);
            continue;
        }
        while (open[open.length - 1] >= width) open.pop();
        out.push(base() + "\t".repeat(open.length) + item);
        open.push(width);
    }
    return out.join("\n");
}

const ITEM_HEAD = String.raw`(?:[-*+]|\d+[.)])\s+`;

/**
 * Notes when a message arrived on its first line ("- **14:05** text"), so the note keeps
 * the time of capture. A line that already starts with a time, a separator and a code
 * block are left alone.
 */
export function stampFirstLine(content: string, hm: string): string {
    const lines = content.split("\n");
    const at = lines.findIndex((l) => l.trim() !== "");
    if (at < 0 || /^\s/.test(lines[at])) return content;
    const m = lines[at].match(new RegExp(`^(${ITEM_HEAD})?(.*)$`));
    if (!m || /^(?:\*\*\d{1,2}[:：]\d{2}\*\*|\d{1,2}[:：]\d{2}(?!\d)|-{3,}\s*$|```|~~~)/.test(m[2]))
        return content;
    lines[at] = `${m[1] ?? ""}**${hm}** ${m[2]}`;
    return lines.join("\n");
}

/** Marks a forwarded message as someone else's words: the tag goes at the end of its first line. */
export function tagFirstLine(content: string, tag: string): string {
    const lines = content.split("\n");
    const at = lines.findIndex((l) => l.trim() !== "");
    if (
        at < 0 ||
        /^\s/.test(lines[at]) ||
        /^(?:```|~~~)/.test(lines[at].replace(new RegExp(`^${ITEM_HEAD}`), ""))
    )
        return content;
    if (lines[at].split(/\s+/).includes(tag)) return content;
    lines[at] = `${lines[at].replace(/\s+$/, "")} ${tag}`;
    return lines.join("\n");
}

export class VaultWriter {
    constructor(
        private app: App,
        private vault: Vault,
        private settings: TGInboxSettings,
        /** Saves the settings; used once, to remember that the first message got in. */
        private save?: () => Promise<void>,
    ) {}

    getVault(): Vault {
        return this.vault;
    }

    /** End of day: tasks still in progress go back to TODO (needs the done-to-top plugin). */
    async pauseDoing(msg: MessageUpdate): Promise<void> {
        const savedPath = await getSavePath(this.vault, this.settings, msg);
        await pauseDoingTasks(this.app, this.vault, savedPath);
    }

    /** A custom command's line, appended to the end of a note of its own. */
    async appendToNote(path: string, content: string): Promise<void> {
        await insertMessage(this.vault, content, await getOrCreateNote(this.vault, path));
    }

    async insertMessageToVault(content: string, msg: MessageUpdate): Promise<void> {
        if (this.settings.as_list_items) content = toListItems(content);
        const savedPath = await getSavePath(this.vault, this.settings, msg);

        // Task lines are filed into their zone when done-to-top is installed.
        content = await placeTaskLines(this.app, this.vault, savedPath, content, msg?.date);
        if (!content.trim()) return;

        // What is left is not a task: note when it arrived, and whose words it is.
        if (this.settings.stamp_time) {
            content = stampFirstLine(
                content,
                moment(msg?.date ? msg.date * 1e3 : Date.now()).format("HH:mm"),
            );
        }
        const forwardTag = (this.settings.forward_tag ?? "").trim();
        if (forwardTag && msg?.forward_origin) content = tagFirstLine(content, forwardTag);

        if (this.settings.insert_after_heading && this.settings.target_heading) {
            await insertMessageAfterHeading(
                this.vault,
                content,
                savedPath,
                this.settings.target_heading,
                this.settings.reverse_order,
            );
        } else if (this.settings.reverse_order) {
            await insertMessageAtTop(this.vault, content, savedPath);
        } else {
            await insertMessage(this.vault, content, savedPath);
        }
        if (!this.settings.first_message_saved) {
            this.settings.first_message_saved = true;
            await this.save?.();
        }
    }
}

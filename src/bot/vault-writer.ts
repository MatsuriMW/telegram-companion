import { type App, type Vault } from "obsidian";
import type { TGInboxSettings } from "../settings/types";
import { insertMessage, insertMessageAtTop, insertMessageAfterHeading } from "../io";
import { getSavePath } from "../utils/file";
import type { MessageUpdate } from "../type";
import { pauseDoingTasks, placeTaskLines } from "./task-zones";

/**
 * Turns every top-level line into a list item: non-empty top-level lines get "- ",
 * lines that already are list items stay as they are, indented lines are kept and
 * blank lines are dropped. A top-level code block becomes one item with its body
 * indented; an indented code block hangs under the item before it.
 */
export function toListItems(content: string): string {
    const out: string[] = [];
    let inFence = false;
    for (const line of String(content).split("\n")) {
        const fence = /^\s*(```|~~~)/.test(line);
        if (inFence || (fence && out.length && !/^(```|~~~)/.test(line))) {
            out.push("\t" + line);
            if (fence) inFence = !inFence;
            continue;
        }
        if (fence) {
            out.push("- " + line);
            inFence = true;
            continue;
        }
        if (line.trim() === "") continue;
        if (/^\s/.test(line) || /^([-*+]|\d+[.)])\s/.test(line)) {
            out.push(line);
            continue;
        }
        out.push("- " + line);
    }
    return out.join("\n");
}

export class VaultWriter {
    constructor(
        private app: App,
        private vault: Vault,
        private settings: TGInboxSettings,
    ) {}

    getVault(): Vault {
        return this.vault;
    }

    /** End of day: tasks still in progress go back to TODO (needs the done-to-top plugin). */
    async pauseDoing(msg: MessageUpdate): Promise<void> {
        const savedPath = await getSavePath(this.vault, this.settings, msg);
        await pauseDoingTasks(this.app, this.vault, savedPath);
    }

    async insertMessageToVault(content: string, msg: MessageUpdate): Promise<void> {
        if (this.settings.as_list_items) content = toListItems(content);
        const savedPath = await getSavePath(this.vault, this.settings, msg);

        // Task lines are filed into their zone when done-to-top is installed.
        content = await placeTaskLines(this.app, this.vault, savedPath, content, msg?.date);
        if (!content.trim()) return;

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
    }
}

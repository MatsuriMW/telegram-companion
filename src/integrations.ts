import type { App, moment } from "obsidian";
import type { InlineKeyboardMarkup } from "grammy/types";

// Optional integrations. When these community plugins by the same author are
// installed, the bot does a little more (day boundaries, sleep / workout facts,
// task zones). Every accessor returns null when the plugin is absent, and the
// rest of the code must keep working in that case.
// The interfaces list only what this plugin calls; methods added in later
// versions of those plugins are optional and checked before use.

type Moment = ReturnType<typeof moment>;

export interface SpiralItem {
    kind: string;
    state: string;
    label: string;
    line: number;
    doing?: boolean;
    container?: boolean;
    stamp?: number | null;
}

export interface SpiralBreak {
    word: string;
    since: number;
    labels: string[];
    focus?: boolean;
}

export interface SpiralSettings {
    dayCutoff?: number | null;
    breakState?: SpiralBreak | null;
}

export interface SpiralCore {
    parseJournal(text: string, settings: SpiralSettings): SpiralItem[];
    workKey(text: string): string;
    stripProgress(text: string): string;
    stripDuration(text: string): string;
    parseDuration(text: string): number | null;
}

export interface SpiralPlugin {
    core: SpiralCore;
    settings: SpiralSettings;
    today(): Moment;
    journalPath(day: Moment): string;
    saveData(data: SpiralSettings): Promise<void>;
    capacityText?(): Promise<string>;
    telegramReport?(): Promise<string>;
    tgSendWithSpiral?(
        token: string,
        chatId: number,
        text: string,
        opts?: { html?: boolean },
    ): Promise<boolean>;
    tgBreakStart?(word: string, at: number): Promise<{ already?: boolean; b: SpiralBreak }>;
    tgBreakEnd?(at: number): Promise<{
        word: string;
        mins: number;
        from: string;
        to: string;
        labels: string[];
        focus?: boolean;
    }>;
    markDay?(cmd: "sleep" | "wake", at: number): Promise<string>;
}

export interface NotifyPlugin {
    settings: { staleDays?: number };
    onTgCallback?(
        data: string,
    ): Promise<{ toast?: string; edit?: string; markup?: InlineKeyboardMarkup }>;
    pushWorkout?(): Promise<unknown>;
    pushStale?(): Promise<boolean>;
    pushCards?(): Promise<boolean>;
    pushInsight?(manual?: boolean): Promise<unknown>;
    companionFacts?(day: Moment, scope: "chat" | "day" | "week"): Promise<string[]>;
}

export interface ZonesCore {
    parse(text: string): { blocks: { lines: string[]; sep?: boolean }[] };
    normalizeKeyword(line: string, keepCase: boolean): string;
    zoneOf(line: string): string | null;
    place(text: string, block: string[], zone: string): { text: string };
    mark(line: string, zone: string): string;
}

// `app.plugins` is not part of the public typings.
function installed<T>(app: App, id: string): T | null {
    const all = (app as App & { plugins?: { plugins?: Record<string, unknown> } }).plugins?.plugins;
    return (all?.[id] as T | undefined) ?? null;
}

/** nautilus-spiral: parses the daily note into a schedule. */
export function spiralPlugin(app: App): SpiralPlugin | null {
    const p = installed<Partial<SpiralPlugin>>(app, "nautilus-spiral");
    return p && p.core ? (p as SpiralPlugin) : null;
}

/** nautilus-notify: pushes reminders through this bot and supplies extra facts. */
export function notifyPlugin(app: App): NotifyPlugin | null {
    return installed<NotifyPlugin>(app, "nautilus-notify");
}

/** done-to-top: keeps DONE / DOING / TODO zones in the daily note. */
export function zonesCore(app: App): ZonesCore | null {
    return installed<{ core?: ZonesCore }>(app, "done-to-top")?.core ?? null;
}

import type { App } from "obsidian";

// Optional integrations. When these community plugins by the same author are
// installed, the bot does a little more (day boundaries, sleep / workout facts,
// task zones). Every accessor returns null when the plugin is absent, and the
// rest of the code must keep working in that case.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPlugin = any;

function plugins(app: App): Record<string, AnyPlugin> {
    return (app as AnyPlugin).plugins?.plugins ?? {};
}

/** nautilus-spiral: parses the daily note into a schedule. */
export function spiralPlugin(app: App): AnyPlugin | null {
    const p = plugins(app)["nautilus-spiral"];
    return p && p.core ? p : null;
}

/** nautilus-notify: pushes reminders through this bot and supplies extra facts. */
export function notifyPlugin(app: App): AnyPlugin | null {
    return plugins(app)["nautilus-notify"] ?? null;
}

/** done-to-top: keeps DONE / DOING / TODO zones in the daily note. */
export function zonesCore(app: App): AnyPlugin | null {
    return plugins(app)["done-to-top"]?.core ?? null;
}

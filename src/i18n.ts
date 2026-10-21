import * as obsidian from "obsidian";

/** True when Obsidian's interface language is Chinese. Everything else gets English. */
export function isZh(): boolean {
    let lang = "";
    try {
        // getLanguage() exists from Obsidian 1.8; before that, moment's locale follows the app language.
        const get = (obsidian as { getLanguage?: () => string }).getLanguage;
        lang = get ? get() : obsidian.moment.locale();
    } catch {
        // Outside Obsidian (tests): English.
    }
    return lang.toLowerCase().startsWith("zh");
}

/** Pick the Chinese or the English text by Obsidian's interface language. */
export function tr(zh: string, en: string): string {
    return isZh() ? zh : en;
}

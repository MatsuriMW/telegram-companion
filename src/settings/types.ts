import { COMPANION_DEFAULTS, type CompanionSettings } from "../companion/types";

export type ActionAfterReception = "react" | "delete";

export interface TGInboxSettings {
    token: string;
    marker: string;
    allow_users: string[];
    download_dir: string;
    download_media: boolean;
    /**
     * How wide an embedded image is shown, as a percentage of the width it would
     * take up on its own. 100 leaves the embed without a width.
     */
    image_scale: number;
    message_template: string;
    markdown_escaper: boolean;
    is_custom_file: boolean;
    custom_file_path: string;
    disable_auto_reception: boolean;
    reverse_order: boolean;
    remove_formatting: boolean;
    run_after_sync: boolean;
    daily_note_time_cutoff: string; // Format: "HH:MM" (24-hour format)
    insert_after_heading: boolean;
    target_heading: string;
    action_after_reception: ActionAfterReception;
    /** Turn every top-level line of a message into a list item ("- "). */
    as_list_items: boolean;
    /** Put the time a message arrived in front of its first line ("**14:05** text"). */
    stamp_time: boolean;
    /** Appended to the first line of a forwarded message (e.g. "#quote"); empty = off. */
    forward_tag: string;
    /** The owner's private chat id, recorded on their first message so the bot can message them first. */
    owner_chat_id?: number;
    /** A message has been written into the vault at least once (the setup checklist ticks it off). */
    first_message_saved?: boolean;
    /** The model test in the settings has succeeded at least once (setup checklist). */
    model_tested?: boolean;
    companion: CompanionSettings;
}

export const DEFAULT_SETTINGS: TGInboxSettings = {
    token: "",
    marker: "#inbox",
    allow_users: [],
    download_dir: "/assets",
    download_media: false,
    image_scale: 100,
    markdown_escaper: false,
    message_template: "{{{text}}}",
    is_custom_file: false,
    custom_file_path: "Telegram-Inbox.md",
    disable_auto_reception: false,
    reverse_order: false,
    remove_formatting: false,
    run_after_sync: true,
    daily_note_time_cutoff: "00:00",
    insert_after_heading: false,
    target_heading: "## Inbox",
    action_after_reception: "react",
    as_list_items: false,
    stamp_time: false,
    forward_tag: "",
    companion: COMPANION_DEFAULTS,
};

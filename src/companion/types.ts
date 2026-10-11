/** An instant reply to one of the user's own catchphrases (no model call). */
export interface Quip {
    /** Trigger words, separated by commas. */
    words: string;
    /** hello: greet with today's status · echo: say it back, once more · reply: pick one of `replies`. */
    kind: "hello" | "echo" | "reply";
    /** For kind "reply": one reply per line. */
    replies: string;
    /** Enter chat mode afterwards. */
    chat: boolean;
    /** Saying this means the user is in a good mood. */
    happy: boolean;
}

export type Backend = "cli" | "anthropic" | "openai";
export type Mood = "low" | "happy" | "chat";

export interface ChatTurn {
    who: string;
    text: string;
}

export interface ChatState {
    mode: "explicit" | "auto";
    mood: Mood;
    since: number;
    last: number;
    history: ChatTurn[];
    n: number;
}

export interface ChatMemoryItem {
    at: number;
    text: string;
    mood: Mood;
    /** Already folded into the profile by the after-chat digest. */
    d?: number;
}

export interface Suggestion {
    id: string;
    section: string;
    text: string;
}

export interface SuggestionSet {
    kind: "week" | "manual" | "inc";
    lines: string[];
    items: Suggestion[];
    done: Record<string, string>;
}

export interface CompanionSettings {
    enabled: boolean;
    /** Also answer on mobile (off by default so two devices don't both reply). */
    mobile: boolean;
    profilePath: string;
    lang: string;
    mascot: string;
    quipsOn: boolean;
    quips: Quip[];
    chatIdleMin: number;
    weeklyUpdate: boolean;
    weeklyUpdateAt: string;
    useChat: boolean;
    incUpdate: boolean;
    incMinChars: number;
    extraNotes: string;
    backend: Backend;
    cliPath: string;
    cliModel: string;
    anthropicKey: string;
    anthropicModel: string;
    openaiBase: string;
    openaiKey: string;
    openaiModel: string;
    // runtime state
    chat: ChatState | null;
    chatMemory: ChatMemoryItem[];
    said: { at: number; text: string }[];
    sugs: SuggestionSet | null;
    incSugs: SuggestionSet | null;
    profileUpdatedAt: number;
    weeklySent: string;
}

export const DEFAULT_QUIPS: Quip[] = [
    {
        words: "你好, hi, hello, hey, 嗨, 在吗, 在不在",
        kind: "hello",
        replies: "",
        chat: true,
        happy: false,
    },
    {
        words: "谢谢, 谢啦, 多谢, thanks, thx, thank you",
        kind: "reply",
        replies: "不客气呀 🫶\n嘿嘿，收到 💚\n我一直在 🫂",
        chat: false,
        happy: false,
    },
];

export const COMPANION_DEFAULTS: CompanionSettings = {
    enabled: true,
    mobile: false,
    profilePath: "陪伴档案.md",
    lang: "中文",
    mascot: "✨",
    quipsOn: true,
    quips: DEFAULT_QUIPS,
    chatIdleMin: 20,
    weeklyUpdate: true,
    weeklyUpdateAt: "22:30",
    useChat: true,
    incUpdate: true,
    incMinChars: 150,
    extraNotes: "",
    backend: "cli",
    cliPath: "~/.local/bin/claude",
    cliModel: "",
    anthropicKey: "",
    anthropicModel: "claude-sonnet-5-5",
    openaiBase: "",
    openaiKey: "",
    openaiModel: "",
    chat: null,
    chatMemory: [],
    said: [],
    sugs: null,
    incSugs: null,
    profileUpdatedAt: 0,
    weeklySent: "",
};

export const BACKEND_NAMES: Record<Backend, string> = {
    cli: "Claude 命令行",
    anthropic: "Anthropic API",
    openai: "OpenAI 兼容接口",
};

export const CLI_MODELS = ["", "sonnet", "opus", "haiku"];

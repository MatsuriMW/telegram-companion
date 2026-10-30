import { tr } from "../i18n";

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
    profilePath: string;
    /** 人设：让它扮演一个角色。personaPath 是一篇笔记或一个文件夹（里面每篇是一个角色）。 */
    personaOn: boolean;
    personaPath: string;
    /** 文件夹里现在用的是哪一篇（路径）。 */
    personaActive: string;
    lang: string;
    mascot: string;
    quipsOn: boolean;
    quips: Quip[];
    /** 进入对话模式的说法，逗号隔开：消息以它开头就进入。 */
    chatWords: string;
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
    /** 主后端报错时自动换过去重试的后端；空着就是不用 */
    fallback: Backend | "";
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
        replies: tr(
            "不客气呀 🫶\n嘿嘿，收到 💚\n我一直在 🫂",
            "Anytime 🫶\nGot it 💚\nI'm always here 🫂",
        ),
        chat: false,
        happy: false,
    },
];

export const COMPANION_DEFAULTS: CompanionSettings = {
    enabled: true,
    profilePath: tr("陪伴档案.md", "Companion profile.md"),
    personaOn: false,
    personaPath: tr("陪伴人设.md", "Companion persona.md"),
    personaActive: "",
    lang: tr("中文", "English"),
    mascot: "✨",
    quipsOn: true,
    quips: DEFAULT_QUIPS,
    chatWords: tr(
        "对话模式, 让我们来对话吧, 我们来对话吧, 对话一下, 我想问你, 问你个事, 陪我聊聊, 陪我聊天",
        "chat mode, let's talk, let's chat, I want to ask you, can I ask you",
    ),
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
    fallback: "",
    chat: null,
    chatMemory: [],
    said: [],
    sugs: null,
    incSugs: null,
    profileUpdatedAt: 0,
    weeklySent: "",
};

export const BACKEND_NAMES: Record<Backend, string> = {
    cli: tr("Claude 命令行", "Claude CLI"),
    anthropic: "Anthropic API",
    openai: tr("OpenAI 兼容接口", "OpenAI-compatible"),
};

export const CLI_MODELS = ["", "sonnet", "opus", "haiku"];

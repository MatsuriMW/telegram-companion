import { Platform, requestUrl } from "obsidian";
import { tr } from "../i18n";
import {
    cliEnv,
    expandHome,
    nodeRequire,
    type NodeChild,
    type NodeChildProcess,
    type NodeOs,
    type NodePath,
} from "./node";

// 语音回复：把陪聊回复交给设置里的配音命令念成语音（Telegram 语音消息要 OGG Opus）。
// 命令是用户自己的本机工具，插件只负责传字、取文件；文字从标准输入给，命令里写 {text} 就改成当参数给。

export type VoiceMode = "off" | "button" | "always";

const EMOJI =
    /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]|\u{FE0F}|\u{200D}|\u{20E3}/gu;
const END = /[。！？!?…，,；;：:.~～]$/;

/** 回复里念不出来的去掉（HTML、链接、emoji、列表符号）；不带标点的行尾补个句号，念的时候才会停。 */
export function speakable(html: string): string {
    return html
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/https?:\/\/\S+/g, "")
        .replace(EMOJI, "")
        .split("\n")
        .map((l) =>
            l
                .replace(/^\s*(?:[-•·*]|\d+[.、)）])\s*/, "")
                .replace(/[ \t]{2,}/g, " ")
                .trim(),
        )
        .filter(Boolean)
        .map((l) => (END.test(l) ? l : l + "。"))
        .join("\n");
}

/** 按空白拆成参数，引号里的空白不拆。不经过 shell。 */
export function splitCommand(cmd: string): string[] {
    const out: string[] = [];
    let cur = "";
    let quote: string | null = null;
    let quoted = false;
    for (const ch of cmd.trim()) {
        if (quote) {
            if (ch === quote) quote = null;
            else cur += ch;
        } else if (ch === '"' || ch === "'") {
            quote = ch;
            quoted = true;
        } else if (/\s/.test(ch)) {
            if (cur || quoted) out.push(cur);
            cur = "";
            quoted = false;
        } else cur += ch;
    }
    if (cur || quoted) out.push(cur);
    return out;
}

// 本机合成很吃内存，一次只跑一个，后来的排队
let queue: Promise<unknown> = Promise.resolve();

/** 用配音命令把 text 念成语音，返回音频文件的内容。 */
export function synthesize(command: string, text: string, timeoutSec = 300): Promise<Uint8Array> {
    const run = queue.then(() => runCommand(command, text, timeoutSec));
    queue = run.catch(() => {});
    return run;
}

function runCommand(command: string, text: string, timeoutSec: number): Promise<Uint8Array> {
    if (!Platform.isDesktopApp)
        return Promise.reject(
            new Error(tr("语音回复只能在桌面端用", "Voice replies only work on desktop")),
        );
    const argv = splitCommand(command);
    if (!argv.length) return Promise.reject(new Error(tr("没填配音命令", "No voice command set")));
    if (!argv.some((a) => a.includes("{out}")))
        return Promise.reject(
            new Error(
                tr(
                    "配音命令里要写 {out}（输出文件）",
                    "The voice command needs {out} (the output file)",
                ),
            ),
        );
    const { spawn } = nodeRequire<NodeChildProcess>("child_process");
    const os = nodeRequire<NodeOs>("os");
    const path = nodeRequire<NodePath>("path");
    const fs = nodeRequire<{
        readFileSync(p: string): Uint8Array;
        existsSync(p: string): boolean;
        unlinkSync(p: string): void;
    }>("fs");
    const out = path.join(os.tmpdir(), `telegram-companion-voice-${Date.now()}.ogg`);
    const asArg = argv.some((a) => a.includes("{text}"));
    const args = argv.slice(1).map((a) => a.split("{out}").join(out).split("{text}").join(text));
    const cleanup = () => {
        try {
            if (fs.existsSync(out)) fs.unlinkSync(out);
        } catch {
            /* 临时文件删不掉也不要紧 */
        }
    };
    return new Promise((resolve, reject) => {
        let child: NodeChild;
        try {
            child = spawn(expandHome(argv[0]), args, { cwd: os.tmpdir(), env: cliEnv() });
        } catch (e) {
            return reject(e instanceof Error ? e : new Error(String(e)));
        }
        let err = "";
        child.stderr?.on("data", (d) => (err += d.toString()));
        const timer = window.setTimeout(() => {
            child.kill();
            reject(new Error(tr("配音超时", "The voice command timed out")));
        }, timeoutSec * 1000);
        child.on("error", (e: Error) => {
            window.clearTimeout(timer);
            reject(e);
        });
        child.on("close", (code: number | null) => {
            window.clearTimeout(timer);
            if (code !== 0 || !fs.existsSync(out)) {
                cleanup();
                const why = err.trim().split("\n").slice(-3).join(" ").slice(0, 300);
                return reject(
                    new Error(
                        why ||
                            tr(
                                `配音命令退出码 ${code}`,
                                `The voice command exited with code ${code}`,
                            ),
                    ),
                );
            }
            const audio = fs.readFileSync(out);
            cleanup();
            resolve(new Uint8Array(audio));
        });
        if (!asArg) child.stdin?.write(text);
        child.stdin?.end();
    });
}

/**
 * sendVoice 的 multipart 请求体。不用 grammy 传文件：它的网页版把文件做成流式请求体，
 * Obsidian 里的 fetch 不收这种 body（「Network request for 'sendVoice' failed」）。
 */
export function voiceForm(
    chatId: number | string,
    audio: Uint8Array,
    replyTo?: number,
    boundary = `----telegram-companion-${Date.now().toString(16)}`,
): { body: ArrayBuffer; contentType: string } {
    const enc = new TextEncoder();
    const field = (name: string, value: string) =>
        enc.encode(
            `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
        );
    const parts: Uint8Array[] = [field("chat_id", String(chatId))];
    if (replyTo) parts.push(field("reply_parameters", JSON.stringify({ message_id: replyTo })));
    parts.push(
        enc.encode(
            `--${boundary}\r\nContent-Disposition: form-data; name="voice"; filename="reply.ogg"\r\nContent-Type: audio/ogg\r\n\r\n`,
        ),
        audio,
        enc.encode(`\r\n--${boundary}--\r\n`),
    );
    const body = new ArrayBuffer(parts.reduce((n, p) => n + p.length, 0));
    const view = new Uint8Array(body);
    let at = 0;
    for (const p of parts) {
        view.set(p, at);
        at += p.length;
    }
    return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

/** 把一段 OGG Opus 作为语音消息发给 chatId（走 Obsidian 的 requestUrl）。 */
export async function postVoice(
    token: string,
    chatId: number | string,
    audio: Uint8Array,
    replyTo?: number,
): Promise<void> {
    const { body, contentType } = voiceForm(chatId, audio, replyTo);
    const res = await requestUrl({
        url: `https://api.telegram.org/bot${token}/sendVoice`,
        method: "POST",
        contentType,
        body,
        throw: false,
    });
    let d: { ok?: boolean; description?: string } | null = null;
    try {
        d = res.json as { ok?: boolean; description?: string };
    } catch {
        /* 不是 JSON */
    }
    if (res.status >= 400 || !d?.ok)
        throw new Error(d?.description || `sendVoice HTTP ${res.status}`);
}

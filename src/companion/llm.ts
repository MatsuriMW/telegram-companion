import { Platform, requestUrl } from "obsidian";
import { BACKEND_NAMES, CLI_MODELS, type Backend, type CompanionSettings } from "./types";

// 模型后端：Claude Code 命令行 / Anthropic API / OpenAI 兼容接口（DeepSeek、OpenRouter、Ollama……）
// 每次调用只发一段提示词、拿回一段文字，不带工具、不存会话。

export function backendLabel(c: CompanionSettings, b: Backend = c.backend): string {
    if (b === "anthropic") return `${BACKEND_NAMES.anthropic} · ${c.anthropicModel || "未填模型"}`;
    if (b === "openai") return `${BACKEND_NAMES.openai} · ${c.openaiModel || "未填模型"}`;
    return `${BACKEND_NAMES.cli} · ${c.cliModel || "默认模型"}`;
}

/** 写在回复末尾的短名字。 */
export function backendShort(c: CompanionSettings, b: Backend): string {
    if (b === "openai") return c.openaiModel || BACKEND_NAMES.openai;
    if (b === "anthropic") return c.anthropicModel || BACKEND_NAMES.anthropic;
    return BACKEND_NAMES.cli;
}

/** 这个后端的参数填好了没有。 */
export function backendReady(c: CompanionSettings, b: Backend): boolean {
    if (b === "anthropic") return !!(c.anthropicKey && c.anthropicModel);
    if (b === "openai") return !!(c.openaiBase && c.openaiModel);
    return Platform.isDesktopApp;
}

/** 现在能用的备用后端：选了、和主后端不是同一个、参数也填好了才算。 */
export function fallbackBackend(c: CompanionSettings): Backend | null {
    const b = c.fallback;
    return b && b !== c.backend && backendReady(c, b) ? b : null;
}

export interface BackendChoice {
    id: string;
    label: string;
    on: boolean;
}

/** 现在能切过去的后端：参数填好了的才算。 */
export function backendChoices(c: CompanionSettings): BackendChoice[] {
    const out: BackendChoice[] = [];
    if (Platform.isDesktopApp) {
        for (const m of CLI_MODELS) {
            out.push({
                id: `cli:${m}`,
                label: `命令行 · ${m || "默认"}`,
                on: c.backend === "cli" && (c.cliModel || "") === m,
            });
        }
    }
    if (backendReady(c, "anthropic")) {
        out.push({
            id: "anthropic",
            label: `Anthropic · ${c.anthropicModel}`,
            on: c.backend === "anthropic",
        });
    }
    if (backendReady(c, "openai"))
        out.push({ id: "openai", label: c.openaiModel, on: c.backend === "openai" });
    return out;
}

/** id 形如 "cli:sonnet" / "anthropic" / "openai"；认不出返回 false。 */
export function setBackend(c: CompanionSettings, id: string): boolean {
    const [b, m = ""] = String(id).split(":");
    if (!(b in BACKEND_NAMES)) return false;
    c.backend = b as Backend;
    if (b === "cli") c.cliModel = m;
    return true;
}

export async function callModel(
    c: CompanionSettings,
    prompt: string,
    timeoutSec = 240,
    backend: Backend = c.backend,
): Promise<string> {
    if (backend === "anthropic") {
        if (!c.anthropicKey) throw new Error("还没填 Anthropic API key");
        return callHttp(
            "https://api.anthropic.com/v1/messages",
            { "x-api-key": c.anthropicKey, "anthropic-version": "2023-06-01" },
            {
                model: c.anthropicModel,
                max_tokens: 4096,
                messages: [{ role: "user", content: prompt }],
            },
            (d: AnthropicReply) =>
                (d.content || [])
                    .filter((x) => x.type === "text")
                    .map((x) => x.text ?? "")
                    .join(""),
            timeoutSec,
        );
    }
    if (backend === "openai") {
        if (!c.openaiBase || !c.openaiModel) throw new Error("还没填接口地址或模型名");
        return callHttp(
            c.openaiBase.replace(/\/+$/, "") + "/chat/completions",
            c.openaiKey ? { Authorization: `Bearer ${c.openaiKey}` } : {},
            { model: c.openaiModel, messages: [{ role: "user", content: prompt }] },
            (d: OpenAiReply) => d.choices?.[0]?.message?.content ?? "",
            timeoutSec,
        );
    }
    return callCli(c, prompt, timeoutSec);
}

// The parts of each provider's reply that are read here.
interface ApiError {
    error?: { message?: string } | string;
}
interface AnthropicReply extends ApiError {
    content?: { type: string; text?: string }[];
}
interface OpenAiReply extends ApiError {
    choices?: { message?: { content?: string } }[];
}
interface CliReply {
    is_error?: boolean;
    result?: string;
}

// The few pieces of Node's child_process used by the command-line backend,
// declared here so the file type-checks without @types/node.
interface NodeStream {
    on(event: "data", cb: (chunk: { toString(): string }) => void): void;
}
interface NodeChild {
    stdout: NodeStream | null;
    stderr: NodeStream | null;
    stdin: { write(text: string): void; end(): void } | null;
    on(event: "error", cb: (e: Error) => void): void;
    on(event: "close", cb: (code: number | null) => void): void;
    kill(): void;
}
interface NodeChildProcess {
    spawn: (
        bin: string,
        args: string[],
        opts: { cwd: string; env: Record<string, string | undefined> },
    ) => NodeChild;
}

async function callHttp<T extends ApiError>(
    url: string,
    headers: Record<string, string>,
    body: unknown,
    pick: (d: T) => string,
    timeoutSec: number,
): Promise<string> {
    const req = requestUrl({
        url,
        method: "POST",
        contentType: "application/json",
        headers,
        body: JSON.stringify(body),
        throw: false,
    });
    const res = await Promise.race([
        req,
        new Promise<never>((_, rej) =>
            window.setTimeout(() => rej(new Error("模型超时")), timeoutSec * 1000),
        ),
    ]);
    let d: T | null = null;
    try {
        d = res.json as T;
    } catch {
        /* 不是 JSON */
    }
    if (res.status >= 400) {
        const e = d?.error;
        const why = (typeof e === "string" ? e : e?.message) || res.text || "";
        throw new Error(`模型接口 ${res.status}：${why.slice(0, 200)}`);
    }
    const text = String((d && pick(d)) || "").trim();
    if (!text) throw new Error("模型没有返回内容");
    return text;
}

function callCli(c: CompanionSettings, prompt: string, timeoutSec: number): Promise<string> {
    if (!Platform.isDesktopApp) {
        return Promise.reject(new Error("命令行后端只能在桌面端用"));
    }
    // Node 模块只在桌面端有，用到时再取。这里必须拿真正的进程环境：
    // 打包进来的 grammy 网页版自带一个 process 替身，里面没有 HOME，命令行就找不到自己的登录。
    const req = (window as unknown as { require: (id: string) => unknown }).require;
    const { spawn } = req("child_process") as NodeChildProcess;
    const os = req("os") as { homedir(): string; tmpdir(): string };
    const path = req("path") as { join(...parts: string[]): string; delimiter: string };
    const penv = (req("process") as { env: Record<string, string | undefined> }).env;
    return new Promise((resolve, reject) => {
        const bin = (c.cliPath || "claude").replace(/^~(?=\/)/, os.homedir());
        const env = {
            ...penv,
            PATH: [
                path.join(os.homedir(), ".local/bin"),
                "/opt/homebrew/bin",
                "/usr/local/bin",
                "/usr/bin",
                "/bin",
                penv.PATH || "",
            ].join(path.delimiter),
        };
        const args = [
            "-p",
            "--output-format",
            "json",
            "--no-session-persistence",
            "--strict-mcp-config",
            "--tools",
            "",
        ];
        if (c.cliModel) args.push("--model", c.cliModel);
        let child: NodeChild;
        try {
            child = spawn(bin, args, { cwd: os.tmpdir(), env });
        } catch (e) {
            return reject(e instanceof Error ? e : new Error(String(e)));
        }
        let out = "";
        let err = "";
        child.stdout?.on("data", (d) => (out += d.toString()));
        child.stderr?.on("data", (d) => (err += d.toString()));
        const timer = window.setTimeout(() => {
            child.kill();
            reject(new Error("claude 超时"));
        }, timeoutSec * 1000);
        child.on("error", (e: Error) => {
            window.clearTimeout(timer);
            reject(e);
        });
        child.on("close", (code: number | null) => {
            window.clearTimeout(timer);
            let d: CliReply;
            try {
                d = JSON.parse(out) as CliReply;
            } catch {
                return reject(
                    new Error((err || out || `claude 退出码 ${code}`).trim().slice(0, 300)),
                );
            }
            if (d.is_error)
                return reject(new Error(String(d.result || "claude 出错").slice(0, 300)));
            resolve(String(d.result || "").trim());
        });
        child.stdin?.write(prompt);
        child.stdin?.end();
    });
}

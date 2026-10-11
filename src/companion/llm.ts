import { Platform, requestUrl } from "obsidian";
import { BACKEND_NAMES, CLI_MODELS, type Backend, type CompanionSettings } from "./types";

// 模型后端：Claude Code 命令行 / Anthropic API / OpenAI 兼容接口（DeepSeek、OpenRouter、Ollama……）
// 每次调用只发一段提示词、拿回一段文字，不带工具、不存会话。

export function backendLabel(c: CompanionSettings): string {
    if (c.backend === "anthropic")
        return `${BACKEND_NAMES.anthropic} · ${c.anthropicModel || "未填模型"}`;
    if (c.backend === "openai") return `${BACKEND_NAMES.openai} · ${c.openaiModel || "未填模型"}`;
    return `${BACKEND_NAMES.cli} · ${c.cliModel || "默认模型"}`;
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
    if (c.anthropicKey && c.anthropicModel) {
        out.push({
            id: "anthropic",
            label: `Anthropic · ${c.anthropicModel}`,
            on: c.backend === "anthropic",
        });
    }
    if (c.openaiBase && c.openaiModel)
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
): Promise<string> {
    if (c.backend === "anthropic") {
        if (!c.anthropicKey) throw new Error("还没填 Anthropic API key");
        return callHttp(
            "https://api.anthropic.com/v1/messages",
            { "x-api-key": c.anthropicKey, "anthropic-version": "2023-06-01" },
            {
                model: c.anthropicModel,
                max_tokens: 4096,
                messages: [{ role: "user", content: prompt }],
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (d: any) =>
                (d.content || [])
                    .filter((x: { type: string }) => x.type === "text")
                    .map((x: { text: string }) => x.text)
                    .join(""),
            timeoutSec,
        );
    }
    if (c.backend === "openai") {
        if (!c.openaiBase || !c.openaiModel) throw new Error("还没填接口地址或模型名");
        return callHttp(
            c.openaiBase.replace(/\/+$/, "") + "/chat/completions",
            c.openaiKey ? { Authorization: `Bearer ${c.openaiKey}` } : {},
            { model: c.openaiModel, messages: [{ role: "user", content: prompt }] },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (d: any) => d.choices?.[0]?.message?.content ?? "",
            timeoutSec,
        );
    }
    return callCli(c, prompt, timeoutSec);
}

async function callHttp(
    url: string,
    headers: Record<string, string>,
    body: unknown,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pick: (d: any) => string,
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let d: any = null;
    try {
        d = res.json;
    } catch {
        /* 不是 JSON */
    }
    if (res.status >= 400) {
        const why = (d && d.error && (d.error.message || d.error)) || res.text || "";
        throw new Error(`模型接口 ${res.status}：${String(why).slice(0, 200)}`);
    }
    const text = String((d && pick(d)) || "").trim();
    if (!text) throw new Error("模型没有返回内容");
    return text;
}

function callCli(c: CompanionSettings, prompt: string, timeoutSec: number): Promise<string> {
    if (!Platform.isDesktopApp) {
        return Promise.reject(new Error("命令行后端只能在桌面端用，手机上请换成 API 后端"));
    }
    // Node 模块只在桌面端有，用到时再取。这里必须拿真正的进程环境：
    // 打包进来的 grammy 网页版自带一个 process 替身，里面没有 HOME，命令行就找不到自己的登录。
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const req = (window as any).require as (id: string) => any;
    const { spawn } = req("child_process");
    const os = req("os");
    const path = req("path");
    const penv = req("process").env as Record<string, string | undefined>;
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let child: any;
        try {
            child = spawn(bin, args, { cwd: os.tmpdir(), env });
        } catch (e) {
            return reject(e);
        }
        let out = "";
        let err = "";
        child.stdout.on("data", (d: unknown) => (out += d));
        child.stderr.on("data", (d: unknown) => (err += d));
        const timer = window.setTimeout(() => {
            child.kill();
            reject(new Error("claude 超时"));
        }, timeoutSec * 1000);
        child.on("error", (e: Error) => {
            window.clearTimeout(timer);
            reject(e);
        });
        child.on("close", (code: number) => {
            window.clearTimeout(timer);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let d: any;
            try {
                d = JSON.parse(out);
            } catch {
                return reject(
                    new Error((err || out || `claude 退出码 ${code}`).trim().slice(0, 300)),
                );
            }
            if (d.is_error)
                return reject(new Error(String(d.result || "claude 出错").slice(0, 300)));
            resolve(String(d.result || "").trim());
        });
        child.stdin.write(prompt);
        child.stdin.end();
    });
}

// 桌面端调本机命令行用的几样 Node 模块（命令行后端、配音命令共用）。
// 在这里声明用到的那一点类型，不装 @types/node 也能过类型检查。

export interface NodeStream {
    on(event: "data", cb: (chunk: { toString(): string }) => void): void;
}
export interface NodeChild {
    stdout: NodeStream | null;
    stderr: NodeStream | null;
    stdin: { write(text: string): void; end(): void } | null;
    on(event: "error", cb: (e: Error) => void): void;
    on(event: "close", cb: (code: number | null) => void): void;
    kill(): void;
}
export interface NodeChildProcess {
    spawn: (
        bin: string,
        args: string[],
        opts: { cwd: string; env: Record<string, string | undefined> },
    ) => NodeChild;
}
export interface NodeOs {
    homedir(): string;
    tmpdir(): string;
}
export interface NodePath {
    join(...parts: string[]): string;
    delimiter: string;
}

/** Node 模块只在桌面端有，用到时再取。 */
export function nodeRequire<T>(id: string): T {
    const req = (window as unknown as { require: (id: string) => unknown }).require;
    return req(id) as T;
}

/**
 * 给子进程的环境。必须拿真正的进程环境：打包进来的 grammy 网页版自带一个 process 替身，
 * 里面没有 HOME，命令行就找不到自己的登录。从 Dock 打开的 Obsidian 没有 shell 的 PATH，常见的几个目录补上。
 */
export function cliEnv(): Record<string, string | undefined> {
    const os = nodeRequire<NodeOs>("os");
    const path = nodeRequire<NodePath>("path");
    const penv = nodeRequire<{ env: Record<string, string | undefined> }>("process").env;
    return {
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
}

/** 开头的 ~/ 换成家目录。 */
export function expandHome(p: string): string {
    return p.replace(/^~(?=\/)/, nodeRequire<NodeOs>("os").homedir());
}

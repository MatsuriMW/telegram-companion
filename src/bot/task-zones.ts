import { moment, type App, type TFile, type Vault } from "obsidian";
import { spiralPlugin, zonesCore, type SpiralItem, type ZonesCore } from "../integrations";

// Optional integration with two other plugins by the same author:
//   done-to-top     keeps DONE / DOING / TODO zones at the top of the daily note
//   nautilus-spiral draws Logseq-style tasks ("- DONE 16:00 写稿 2h") as a schedule
// With them installed, a message such as "done 写稿 2h" updates the matching task
// in today's note instead of adding a new line. Without them everything here is a no-op.

const LIST = String.raw`(?:[-*+]|\d+[.)])`;
const SEP_RE = /^[-*+]\s+-{3,}\s*$/;
const DONE_MATCH_MIN = 2; // 至少前 2 个字一致（消息里的名字更短就要求整个都对上）

// 时间按「消息发出的时刻」记：doing 补开始时间，done 补完成时间
function stampByMsgTime(line: string, hm: string): string {
    const m = line.match(new RegExp(`^(${LIST}\\s+)(DOING|DONE)(?:\\s+(.*))?$`));
    if (!m || /^\d{1,2}(?:[:：]\d{2}|点)/.test(m[3] || "")) return line;
    return `${m[1]}${m[2]} ${hm}${m[3] ? " " + m[3] : ""}`;
}

// 挪走一块以后别留下两条挨着的分隔线
const dropDoubleSeparators = (lines: string[]) =>
    lines.filter((l, i) => !(SEP_RE.test(l) && i > 0 && SEP_RE.test(lines[i - 1])));

// 顶格的一条连同它下面缩进的子行
function takeBlock(lines: string[], at: number): string[] {
    let end = at + 1;
    while (end < lines.length && (lines[end].trim() === "" || /^\s/.test(lines[end]))) end++;
    const block = lines.splice(at, end - at);
    while (block.length > 1 && block[block.length - 1].trim() === "") block.pop();
    return block;
}

// 发「done 写稿」时，今天日记里有没做完的「写稿…」（前几个字一致就算）就直接把那条改成 DONE，不另起一条。
// 返回改好的全文；没找到返回 null（照旧新建）
function finishExisting(
    app: App,
    data: string,
    doneLine: string,
    hm: string,
    zones: ZonesCore,
): string | null {
    const spiral = spiralPlugin(app);
    const sp = spiral?.core;
    // Older nautilus-spiral builds have no stripDuration; leave the note alone there.
    if (!spiral || !sp || typeof sp.stripDuration !== "function") return null;
    const cfg = spiral.settings;
    const body = doneLine.replace(new RegExp(`^${LIST}\\s+DONE\\s*`), "");
    const tm = body.match(/^(\d{1,2}[:：]\d{2}(?:\s*[-–~～]\s*\d{1,2}[:：]\d{2})?)\s*/); // 消息里自己写的时间 / 时段
    const msgItem = sp.parseJournal(doneLine, cfg)[0];
    const norm = (s: string): string => sp.workKey(s).toLowerCase().replace(/\s+/g, "");
    const want = msgItem ? norm(msgItem.label) : "";
    if (!want || /^\d{1,2}[:：]\d{2}/.test(want)) return null;
    const lines = data.split("\n");
    let best: { t: SpiralItem; n: number; have: string } | null = null;
    for (const t of sp.parseJournal(data, cfg)) {
        if (t.kind !== "task" || t.state !== "open") continue;
        const have = norm(t.label);
        let n = 0;
        while (n < want.length && n < have.length && want[n] === have[n]) n++;
        if (n < Math.min(DONE_MATCH_MIN, want.length)) continue;
        // 一致的字越多越优先；一样多就先选正在做的，再选靠前的
        if (!best || n > best.n || (n === best.n && t.doing && !best.t.doing))
            best = { t, n, have };
    }
    if (!best) return null;
    const at = best.t.line;
    const old = lines[at];
    const m = old.match(
        new RegExp(
            `^(\\s*${LIST}\\s+)(\\*\\*\\d{1,2}[:：]\\d{2}\\*\\*\\s*)?(?:(TODO|DOING|LATER|NOW|PAUSED|WAITING|WAIT|SUSPENDED|IN-PROGRESS)\\s+|(\\[[ \\/]\\])\\s+)(.*)$`,
        ),
    );
    if (!m) return null;
    let rest = sp.stripProgress(m[5]).replace(/\s+/g, " ").trim(); // 做完了，40% 这种进度不留
    if (m[4]) {
        lines[at] = `${m[1]}${m[2] || ""}[x] ${rest}`;
    } else {
        const st = /DOING|NOW|IN-PROGRESS/.test(m[3])
            ? rest.match(/^(\d{1,2}[:：]\d{2})\s*/)
            : null; // DOING 14:05 记的开始时间
        if (st) rest = rest.slice(st[0].length);
        const said = (tm ? body.slice(tm[0].length) : body).trim();
        const dur = sp.parseDuration(said);
        const durText =
            dur == null
                ? ""
                : dur % 60 === 0
                  ? `${dur / 60}h`
                  : dur > 60
                    ? `${Math.floor(dur / 60)}h${dur % 60}m`
                    : `${dur}m`;
        let head: string;
        if (tm) head = tm[1]; // 消息里写了时间：按消息的
        else if (dur != null) head = hm; // 写了做了多久：完成时刻 + 时长
        else if (st) head = `${st[1].replace("：", ":")}-${hm}`; // 记过开始时间：开始-完成
        else head = hm;
        if (!best.have.startsWith(want)) {
            // 消息写的和原来那条不一样：以消息为准，原来挂的块链接和块 ID 留着
            const keep = [
                ...(rest.match(/\[\[[^\]]*#\^[^\]]*\]\]/g) || []),
                ...(rest.match(/\s\^[\w-]+\s*$/) || []),
            ].join(" ");
            rest = `${said}${keep ? " " + keep.trim() : ""}`;
        } else if (dur != null) {
            rest = `${sp.stripDuration(rest)} ${durText}`.trim();
        }
        lines[at] = `${m[1]}${m[2] || ""}DONE ${head}${rest ? " " + rest : ""}`;
    }
    // 顶格的任务整块挪进 DONE 分区；缩进在别的条目下面的原地改
    if (!/^\s/.test(old)) {
        const block = takeBlock(lines, at);
        return zones.place(dropDoubleSeparators(lines).join("\n"), block, "DONE").text;
    }
    return lines.join("\n");
}

/**
 * Files task lines (todo / doing / done, any case) into their zone of the note.
 * Returns what is left to insert the normal way, or the content unchanged when
 * done-to-top is not installed.
 */
export async function placeTaskLines(
    app: App,
    vault: Vault,
    file: TFile,
    content: string,
    msgDate: number | undefined,
): Promise<string> {
    const zones = zonesCore(app);
    if (!zones) return content;
    const rest: string[] = [];
    const hm = moment(msgDate ? msgDate * 1e3 : Date.now()).format("HH:mm");
    for (const b of zones.parse(content).blocks) {
        b.lines[0] = zones.normalizeKeyword(b.lines[0], false);
        const zone = b.sep ? null : zones.zoneOf(b.lines[0]);
        if (!zone) {
            rest.push(...b.lines);
            continue;
        }
        // done 一条已有的任务：改原来那条（只处理单行的）
        if (
            zone === "DONE" &&
            b.lines.length === 1 &&
            new RegExp(`^${LIST}\\s+DONE(\\s|$)`).test(b.lines[0])
        ) {
            let hit = false;
            await vault.process(file, (data) => {
                const out = finishExisting(app, data, b.lines[0], hm, zones);
                hit = out != null;
                return out ?? data;
            });
            if (hit) continue;
        }
        b.lines[0] = stampByMsgTime(b.lines[0], hm);
        await vault.process(file, (data) => zones.place(data, b.lines, zone).text);
    }
    return rest.join("\n");
}

/** End of day: tasks still in progress go back to TODO (top-level ones move to the TODO zone). */
export async function pauseDoingTasks(app: App, vault: Vault, file: TFile): Promise<void> {
    const zones = zonesCore(app);
    if (!zones) return;
    const doingRe = new RegExp(
        `^\\s*${LIST}\\s+(?:\\*\\*\\d{1,2}[:：]\\d{2}\\*\\*\\s*)?(?:DOING|NOW|IN-PROGRESS)(\\s|$)`,
    );
    const aliasRe = new RegExp(
        `^(\\s*${LIST}\\s+(?:\\*\\*\\d{1,2}[:：]\\d{2}\\*\\*\\s*)?)(?:NOW|IN-PROGRESS)`,
    );
    await vault.process(file, (data) => {
        for (let round = 0; round < 20; round++) {
            const lines = data.split("\n");
            const i = lines.findIndex((l) => doingRe.test(l));
            if (i < 0) break;
            const top = !/^\s/.test(lines[i]);
            lines[i] = zones.mark(lines[i].replace(aliasRe, "$1DOING"), "TODO");
            if (!top) {
                data = lines.join("\n");
                continue;
            }
            const block = takeBlock(lines, i);
            data = zones.place(dropDoubleSeparators(lines).join("\n"), block, "TODO").text;
        }
        return data;
    });
}

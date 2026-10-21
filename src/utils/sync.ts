import { App, Notice, type Plugin } from "obsidian";
import { tr } from "../i18n";

// Obsidian Sync and the two Remotely plugins are read through fields that are
// not part of the public typings; these interfaces list only what is used here.
interface ObsidianSync {
    syncStatus?: string;
    on(name: "status-change", cb: () => void): void;
    off(name: "status-change", cb: () => void): void;
}

interface RemotelySave {
    settings: { initRunAfterMilliseconds?: number };
    isSyncing?: boolean;
}

interface RemotelySync {
    settings: { initRunAfterMilliseconds?: number };
    syncStatus?: string;
}

type AppInternals = App & {
    plugins?: { plugins?: Record<string, unknown> };
    internalPlugins?: { plugins?: { sync?: { instance?: ObsidianSync } } };
};

function waitForObsidianSync(sync: ObsidianSync, cb: () => void) {
    new Notice(tr("等 Obsidian Sync 同步完……", "Waiting for Obsidian Sync to finish…"));
    if (sync.syncStatus?.toLowerCase() === "fully synced") {
        cb();
        return;
    }
    const handler = () => {
        if (sync.syncStatus?.toLowerCase() === "fully synced") {
            sync.off("status-change", handler);
            cb();
        }
    };
    sync.on("status-change", handler);
}

function waitForRemotelySaveSync(remotely_save: RemotelySave, cb: () => void) {
    console.debug("Remotely Save plugin detected.");
    const initRunAfterMilliseconds = remotely_save.settings.initRunAfterMilliseconds;
    console.debug("Remotely Save initRunAfterMilliseconds:", initRunAfterMilliseconds);
    if (!initRunAfterMilliseconds) {
        cb();
        return;
    } else {
        // If Remotely Save is enabled, we need to wait for it to finish.
        new Notice(tr("等 Remotely Save 同步完……", "Waiting for Remotely Save to finish…"));
        window.setTimeout(() => {
            const interval = window.setInterval(() => {
                if (!remotely_save.isSyncing) {
                    console.debug("Remotely Save finished syncing.");
                    window.clearInterval(interval);
                    cb();
                }
            }, 500);
        }, initRunAfterMilliseconds);
        return;
    }
}

function waitForRemotelySync(remotely_sync: RemotelySync, cb: () => void) {
    console.debug("Remotely Sync plugin detected.");
    const initRunAfterMilliseconds = remotely_sync.settings.initRunAfterMilliseconds;
    console.debug("Remotely Sync initRunAfterMilliseconds:", initRunAfterMilliseconds);
    if (!initRunAfterMilliseconds) {
        cb();
        return;
    } else {
        // If Remotely Secure is enabled, we need to wait for it to finish.
        new Notice(tr("等 Remotely Sync 同步完……", "Waiting for Remotely Sync to finish…"));
        window.setTimeout(() => {
            const interval = window.setInterval(() => {
                if (remotely_sync.syncStatus === "idle") {
                    console.debug("Remotely Sync finished syncing.");
                    window.clearInterval(interval);
                    cb();
                }
            }, 500);
        }, initRunAfterMilliseconds);
        return;
    }
}

export function runAfterSync(this: Plugin, cb: () => void) {
    const remotely_save = getRemotelySave(this.app);
    const remotely_sync = getRemotelySync(this.app);
    const sync = getSync(this.app);

    let waitCount = 0;
    const total = [remotely_save, remotely_sync, sync].filter(Boolean).length;
    if (total === 0) {
        cb();
        return;
    }
    const done = () => {
        waitCount++;
        if (waitCount === total) {
            cb();
        }
    };
    if (remotely_save) waitForRemotelySaveSync(remotely_save, done);
    if (remotely_sync) waitForRemotelySync(remotely_sync, done);
    if (sync) waitForObsidianSync(sync, done);
}

export function hasSyncPlugin(app: App): boolean {
    const sync = getSync(app);
    const remotely_save = getRemotelySave(app);
    const remotely_sync = getRemotelySync(app);
    return !!(sync || remotely_save || remotely_sync);
}

export function getRemotelySave(app: App): RemotelySave | null {
    const p = (app as AppInternals).plugins?.plugins?.["remotely-save"];
    return (p as RemotelySave | undefined) ?? null;
}

export function getRemotelySync(app: App): RemotelySync | null {
    const p = (app as AppInternals).plugins?.plugins?.["remotely-secure"];
    return (p as RemotelySync | undefined) ?? null;
}

export function getSync(app: App): ObsidianSync | null {
    const sync = (app as AppInternals).internalPlugins?.plugins?.sync?.instance;
    return sync && sync.syncStatus?.toLowerCase() !== "uninitialized" ? sync : null;
}

export function getSyncStatus(app: App): {
    obsidianSync: boolean;
    remotelySave: boolean;
    remotelySync: boolean;
} {
    const sync = getSync(app);
    const remotely_save = getRemotelySave(app);
    const remotely_sync = getRemotelySync(app);
    return {
        obsidianSync: !!sync,
        remotelySave: !!remotely_save,
        remotelySync: !!remotely_sync,
    };
}

/**
 * Per-run journals of `hoody share` (plans/share-local-folder.md, "Journals").
 *
 * Layout, in `~/.hoody/sdk/shares/` (0700):
 *   <id>.<run token>.json   one journal per run (this module)
 *   <id>.owner              the owner's run token (lib/share-lock.ts)
 *   <id>.sock, <id>.reclaim macOS only (lib/share-lock.ts)
 *
 * `id` is `sha256(<api origin>\n<container id>\n<name>)` cut to 16 hex. A
 * journal is written atomically (temp file, fsync, rename) before every remote
 * mutation, and records what that mutation may leave behind. It never holds
 * the password. It is deleted only once every remote resource it records is
 * confirmed gone; until then `hoody share stop` can finish it.
 */
export type JournalStage = 'starting' | 'rclone-started' | 'exposing' | 'exposed' | 'backend-creating' | 'backend-created' | 'mount-creating' | 'serving' | 'stopping' | 'cleanup-pending';
export interface ShareTargetRecord {
    /** Origin of the account API the container belongs to. */
    apiOrigin: string;
    containerId: string;
    server?: string;
    projectId?: string;
}
/** The container mount's own settings, as sent in `vfs_config` (lib/share.ts `shareVfsConfig`). */
export type ShareVfsConfig = Readonly<Record<string, string | number | boolean>>;
export interface ShareJournal {
    version: 1;
    id: string;
    runToken: string;
    target: ShareTargetRecord;
    name: string;
    localPath: string;
    readOnly: boolean;
    stage: JournalStage;
    /** The `mount_path` the create asks for (`<name>`). */
    requestedMountPath: string;
    /** The `mount_path` the files kit answered. */
    mountPath?: string;
    vfsConfig: ShareVfsConfig;
    publicUrl?: string;
    /** The per-share WebDAV user name. The password is never journaled. */
    user?: string;
    containerPort?: number;
    backendId?: string;
    mountId?: string;
    /** A create was sent and its answer is not recorded: it may have landed. */
    pendingCreate?: 'backend' | 'mount';
    /**
     * A mount of this run was removed before the files kit confirmed it had
     * sent everything: its retiring generation may still hold writes. The
     * backend is kept, and only a stop with --force (a backend DELETE with
     * `?uploads=discard`) removes it.
     */
    undelivered?: true;
    child?: {
        pid: number;
        start: string | null;
    };
    owner: {
        pid: number;
        start: string | null;
    };
    /** What was left behind, for `list` and the next `stop`. */
    leftovers?: string[];
    startedAt: string;
    updatedAt: string;
}
export declare function sharesDir(home?: string): string;
export declare function computeShareId(apiOrigin: string, containerId: string, name: string): string;
export declare function journalPath(dir: string, id: string, runToken: string): string;
export declare function ensureSharesDir(dir: string): Promise<void>;
/** Write `journal` atomically: a 0600 temp file, fsync, rename, then fsync the directory. */
export declare function writeJournal(dir: string, journal: ShareJournal): Promise<void>;
export declare function readJournalFile(path: string): Promise<ShareJournal | null>;
/** Every readable journal in `dir`, optionally only those of share `id`. */
export declare function listJournals(dir: string, id?: string): Promise<ShareJournal[]>;
export declare function deleteJournal(dir: string, journal: Pick<ShareJournal, 'id' | 'runToken'>): Promise<void>;
export interface ShareKitResponse {
    status: number;
    body: unknown;
}
/** Per-request options: an abort (a second Ctrl+C) and a time budget longer than the default. */
export interface ShareKitRequestInit {
    signal?: AbortSignal;
    timeoutMs?: number;
}
/**
 * The files-kit transport a share talks through: one request, its status and
 * parsed body. It throws only when no answer arrived (network, timeout, abort).
 */
export interface ShareKit {
    request(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown, init?: ShareKitRequestInit): Promise<ShareKitResponse>;
}
/** Whether a listed mount sits at the path this journal asked for. */
export declare function mountPathMatches(journal: Pick<ShareJournal, 'mountPath' | 'requestedMountPath'>, path: string): boolean;
export interface LostCreateOptions {
    /** How long to keep looking before a resource counts as absent. Default 40 s. */
    windowMs?: number;
    /**
     * When a create that is still landing must have landed: only a lookup that
     * starts this long after the first one can show the resource is absent.
     * Default three quarters of the window (30 s of 40 s; the files kit's
     * update deadline is 25 s).
     */
    settleMs?: number;
    /** Interval between lookups. Default 2 s. */
    pollMs?: number;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
}
export interface LostCreateResult {
    backendId?: string;
    mountId?: string;
}
/**
 * Look for the resource a lost create response may have made. The files kit
 * finishes a create after the client leaves, within its 25 s update deadline,
 * so this looks every 2 s for 40 s before it concludes the resource is
 * absent. It adopts only exact matches: the backend whose user name is this
 * run's, and the mount at the recorded path whose `backend_id` is that
 * backend. Absence needs an answer to a lookup that started after `settleMs`:
 * an earlier empty answer may predate the commit. Throws when no such lookup
 * got an answer (the outcome is not known; the caller keeps `pendingCreate`).
 */
export declare function findLostCreate(kit: ShareKit, journal: ShareJournal, opts?: LostCreateOptions): Promise<LostCreateResult>;

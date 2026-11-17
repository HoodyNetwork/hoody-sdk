/**
 * `hoody-sdk/mount` — programmatic and CLI-facing module for
 * mounting Hoody computer filesystems locally via rclone+WebDAV.
 *
 * Architecture:
 *   - Resolves a kit URL: a caller-supplied raw URL, or a {@link ComputerLike}
 *     on the computers domain of the caller's API (`client.getKitUrl`, or
 *     `computersDomain`). No platform host is written in here.
 *   - Probes the mounted path with the supplied {@link ProxyAuth} ({@link probeKit},
 *     PROPFIND) before rclone starts, and reports the mount only once it is in the
 *     OS mount table.
 *   - Writes a 0600 rclone config at `~/.hoody/sdk/mounts/<id>.conf`
 *     containing the secret material (bearer_token / pass / headers). No
 *     credential ever goes on a command line, where every local user can read
 *     it (`ps`, /proc/<pid>/cmdline): the password reaches `rclone obscure` on
 *     stdin, and an rclone too old to take a credential from its config is
 *     refused ({@link refuseRcloneTooOldForAuth}).
 *   - Spawns `rclone mount hoody: <localPath>` with `--config <id>.conf`,
 *     foreground (default) or `--daemon` (background; Linux/macOS only).
 *   - Records the mount in `~/.hoody/sdk/mounts/<id>.json` via the
 *     {@link claimState} `wx` exclusive-create + reclaim probe.
 */
import { homedir } from 'node:os';
import { type ProxyAuth } from './proxy-auth.js';
import { type RcloneVersion } from './rclone-local.js';
import { type AliveState, type MountStateFile } from './mount-state.js';
/**
 * The oldest rclone that reads custom WebDAV headers from its config (`headers`): changelog
 * v1.56.0 (2021-07-20), "WebDAV: Add headers option". A token under a header other than
 * Authorization, and a computer claim, need it; an older rclone could take them only as
 * `--header` on its command line, so it is refused.
 */
export declare const RCLONE_HEADERS_MIN_VERSION: readonly [number, number];
/**
 * The oldest rclone whose `rclone obscure -` reads the password from stdin: changelog v1.53.0
 * (2020-09-02), "Allow obscure command to accept password on STDIN". An older one obscures the
 * literal `-`.
 */
export declare const RCLONE_OBSCURE_STDIN_MIN_VERSION: readonly [number, number];
export interface ComputerLike {
    id?: string;
    project_id?: string;
    [key: string]: unknown;
}
/** Anything that builds kit URLs for the caller's API: a `HoodyClient` or a computer-scoped client. */
export interface KitUrlSource {
    getKitUrl(kit: string, computer: ComputerLike, serviceIndex: number): string;
}
/**
 * A computer is reached on the computers domain of the API it belongs to, so the computer
 * form names that API: `client` (its `getKitUrl`) or `computersDomain` (e.g. the
 * `computers.<platform>` sibling of `api.<platform>`). One of the two is required.
 */
export type MountTarget = {
    computer: ComputerLike;
    client: KitUrlSource;
    subpath?: string;
    serviceIndex?: number;
} | {
    computer: ComputerLike;
    computersDomain: string;
    subpath?: string;
    serviceIndex?: number;
} | {
    kitUrl: string;
    subpath?: string;
};
export interface MountOptionsBase {
    localPath: string;
    auth?: ProxyAuth;
    background?: boolean;
    readOnly?: boolean;
    noVfsCache?: boolean;
    extraRcloneArgs?: readonly string[];
    rclonePath?: string;
    /** Override of `~/`. For tests. */
    home?: string;
    /** stdout / stderr inheritance for foreground mode. */
    stdio?: 'inherit' | 'ignore' | 'pipe';
    /**
     * Check the kit with {@link probeKit} (a WebDAV PROPFIND of the mounted path, with `auth`)
     * before rclone starts, and refuse an unreachable kit, a refused credential or a missing path.
     * Default true. The probe is a plain fetch: turn it off when rclone reaches the kit through a
     * proxy that this process does not use.
     */
    probe?: boolean;
    /** How long to wait for the mount to appear in the OS mount table. Default 30 s. */
    readyTimeoutMs?: number;
    /** How long a foreground stop waits for pending uploads ({@link UnmountOptions.drainTimeoutMs}). */
    drainTimeoutMs?: number;
}
export type MountOptions = MountTarget & MountOptionsBase;
export interface MountHandle {
    id: string;
    pid: number | null;
    rclonePid: number | null;
    localPath: string;
    kitUrl: string;
    mode: 'foreground' | 'background';
    /** Resolves with the rclone exit code (foreground only). */
    wait(): Promise<number>;
    unmount(opts?: UnmountOptions): Promise<void>;
    /** Files that earlier mounts of this URL wrote and never uploaded, found when this mount started. */
    earlierUnsent: readonly EarlierUnsent[];
}
/** Files an earlier mount of the same URL wrote but never uploaded (it was stopped first). */
export interface EarlierUnsent {
    /** Where that mount was. */
    localPath: string;
    /** Relative to the mounted folder. */
    files: readonly string[];
    /**
     * true: this mount uploads them now (same URL and path, and it was given no `--cache-dir`).
     * false: a mount of the same URL at `localPath` that uses the cache they are in uploads them: the
     * default one (no `--cache-dir`) when `cacheDir` is absent, else `--cache-dir <cacheDir>`. Which
     * cache rclone uses when given `--cache-dir` is rclone's to decide, so that case is never `true`.
     */
    uploading: boolean;
    /** Set when the files are in a cache dir the caller gave (`--cache-dir`). */
    cacheDir?: string;
}
export interface UnmountOptions {
    /**
     * How long to wait for rclone to upload the files written to the mount, counted again each
     * time one of them is uploaded. Default {@link UNMOUNT_DRAIN_TIMEOUT_MS}.
     */
    drainTimeoutMs?: number;
    /** Unmount without waiting for pending uploads. What was not uploaded stays in the mount's cache. */
    force?: boolean;
    /** Called once when unmount has to wait for uploads, with the files it waits for. */
    onPending?: (files: readonly string[]) => void;
}
export interface MountListEntry {
    id: string;
    computerId: string;
    kitUrl: string;
    /** Subpath inside the computer that's been mounted (e.g. `home/user`). */
    subpath: string;
    localPath: string;
    mode: 'foreground' | 'background';
    pid: number | null;
    alive: AliveState;
    startedAt: string;
}
export interface ProbeResult {
    ok: boolean;
    status: number;
    davHeader?: string | undefined;
    needsAuth: boolean;
    detail?: string | undefined;
}
/**
 * List every recorded mount of this user with its current liveness (`alive`:
 * `'alive'`, `'stale'` or `'dead'`), checked against the process and the OS
 * mount table at call time. Removes nothing; see `pruneStaleMounts()`.
 * `home` overrides the home directory the records are kept under.
 */
export declare function listMounts(home?: string): Promise<MountListEntry[]>;
/**
 * Remove the records (and rclone config files) of mounts that are no longer
 * alive. Resolves with `removed`, the dead records deleted, and `orphans`,
 * the config files deleted that had no record. A mount still starting counts
 * as alive and is kept.
 */
export declare function pruneStaleMounts(home?: string): Promise<{
    removed: number;
    orphans: number;
}>;
/**
 * Ask the kit about `kitUrl` with `auth`: `OPTIONS` (default) answers whether the kit is there
 * and speaks WebDAV; `PROPFIND` (Depth 0) also answers whether the path exists (404).
 */
export declare function probeKit(kitUrl: string, auth?: ProxyAuth, timeoutMs?: number, method?: 'OPTIONS' | 'PROPFIND'): Promise<ProbeResult>;
/**
 * Resolve a kit URL from MountTarget. The full path the WebDAV remote
 * mounts is `<kit base URL>/<subpath>` (subpath stripped of leading
 * slashes and percent-encoded segment-by-segment).
 */
export declare function resolveKitUrl(target: MountTarget): {
    kitUrl: string;
    subpath: string;
    computerId: string;
};
/**
 * Mount a folder of a computer at `opts.localPath` with rclone over WebDAV.
 * The target is a `computer` (with `client` or `computersDomain`) or a
 * `kitUrl`, optionally narrowed by `subpath`; `auth` is the credential the
 * computer's files program expects (default: none, access by IP rule).
 *
 * Resolves once the path is in the OS mount table. In the foreground
 * (default) rclone runs as a child of this process: `handle.wait()` resolves
 * with its exit code and `handle.unmount()` stops it. With `background:
 * true` rclone runs detached and outlives this process; stop it later with
 * `unmount()`. The mount is recorded under `~/.hoody/sdk/mounts` so
 * `listMounts()` and `unmount()` find it from any process.
 *
 * Throws before anything is started when rclone is missing or too old for
 * the credential, the mount point is not empty (on Windows: exists), the
 * path is already mounted, or the probe finds the files program
 * unreachable, the credential refused or the path missing. Throws when the
 * mount does not come up within `readyTimeoutMs`; what was started is then
 * stopped. `background` is not available on Windows. The credential is
 * written to a 0600 config file and never put on a command line.
 */
export declare function mount(opts: MountOptions): Promise<MountHandle>;
/**
 * Unmount the mount with record `id`: wait for its uploads, unmount the path, stop its rclone,
 * remove its record.
 *
 * Known limit (accepted): two unmounts of one mount at once are not coordinated. If the second
 * finishes while the first waits for uploads, and a new mount claims the path in between, the
 * first then runs the unmount command on the path and unmounts the new mount. Its record
 * survives (the removal is conditional), its rclone is never signalled (the pid check fails),
 * and the record is cleaned up later as dead. All three steps are commands of the same user.
 */
export declare function unmountById(id: string, home?: string, opts?: UnmountOptions): Promise<void>;
/**
 * Unmount one recorded mount, named by its 16-hex mount id or its local
 * path (an id is tried first; a folder with such a name still works as a
 * path). Waits for files written to the mount to finish uploading unless
 * `opts.force` is set, then unmounts, stops rclone and removes the record.
 *
 * Throws an Error when no mount matches, and `PendingUploadsError` when
 * files are still unsent. A busy mount point throws and leaves the mount
 * and its record in place, so a later call can retry.
 */
export declare function unmount(idOrPath: string, home?: string, opts?: UnmountOptions): Promise<void>;
/** Thrown by {@link unmountAll} / {@link unmountByComputer} when a mount could not be unmounted. */
export declare class UnmountError extends Error {
    /** How many mounts were unmounted. */
    readonly unmounted: number;
    /** `mounted`: whether the path is still mounted (false: unmounted, with files left unsent). */
    readonly failures: ReadonlyArray<{
        id: string;
        localPath: string;
        message: string;
        mounted: boolean;
    }>;
    constructor(
    /** How many mounts were unmounted. */
    unmounted: number, 
    /** `mounted`: whether the path is still mounted (false: unmounted, with files left unsent). */
    failures: ReadonlyArray<{
        id: string;
        localPath: string;
        message: string;
        mounted: boolean;
    }>);
}
/**
 * Thrown by unmount when files written to the mount have not reached the computer. With
 * `mounted` true the wait for them ran out and the mount and its record are kept (rclone goes on
 * uploading; unmount again later). With `mounted` false the path is unmounted and the files are
 * left in the mount's cache, which a mount of the same URL at the same path uploads.
 */
export declare class PendingUploadsError extends Error {
    readonly localPath: string;
    /** The files, relative to the mounted folder. */
    readonly files: readonly string[];
    readonly mounted: boolean;
    constructor(message: string, localPath: string, 
    /** The files, relative to the mounted folder. */
    files: readonly string[], mounted: boolean);
}
/** Unmount every record; throws {@link UnmountError} after trying them all if any failed. */
export declare function unmountAll(home?: string, opts?: UnmountOptions): Promise<number>;
/**
 * Unmount every recorded mount of the computer `computerId`. Resolves with
 * how many were unmounted (0 when it has none); throws `UnmountError` after
 * trying them all if any failed.
 */
export declare function unmountByComputer(computerId: string, home?: string, opts?: UnmountOptions): Promise<number>;
/**
 * How long a mount trusts its own directory listing, and how long a file must stay closed and
 * idle before its upload starts. rclone's defaults (5 min, 5 s) left another machine's (or the
 * computer's) changes and deletes invisible for up to 5 min, and served a file the box had
 * rewritten cut to the size the stale listing recorded. A change that has landed now shows at
 * the next lookup after MOUNT_DIR_CACHE_TIME (plus rclone's 1 s attribute cache); a handle
 * that is already open can keep its old view.
 *
 * This bounds staleness; it is not a lock. rclone's WebDAV client uploads a whole file once it
 * has been closed and idle, with an unconditional PUT (no rclone flag adds If-Match), so with
 * two writers to one file the last upload lands at the name; what it replaced is kept by the kit
 * as a conflict copy when this mount had never received it (safe save, `safeSaveHeaderArgs`). The cost is one
 * PROPFIND per directory still in use each time its listing expires (on demand, not polled).
 * A later `--extra` value of either flag wins, since rclone keeps the last one given.
 */
export declare const MOUNT_DIR_CACHE_TIME = "5s";
export declare const MOUNT_WRITE_BACK = "1s";
/** How long unmount waits for pending uploads, counted again each time one finishes. */
export declare const UNMOUNT_DRAIN_TIMEOUT_MS = 60000;
/**
 * Safe save: the headers that name this mount to the files kit. The kit keeps, per session,
 * which versions this mount has received (a download, or its own upload); an upload or delete
 * from the mount over a version it never received keeps that version as a conflict copy beside
 * the file (`name (conflict <label> <time>).ext`) instead of losing it. The session is new on
 * every mount start, so a restarted mount knows nothing yet and only makes extra copies. The
 * label is this machine's short host name, as the copy's name shows it. `--header` is rclone's
 * global flag, so every auth method gets both; a kit without safe save ignores them.
 */
export declare function safeSaveHeaderArgs(host?: string): string[];
/**
 * Refuse a caller's header that `safeSaveHeaderArgs` sets itself: an auth header of that name, or
 * one in the extra rclone args (`--header`, `--header-upload`, `--header-download`, as
 * `--flag value` or `--flag=value`, and `--webdav-headers`). A second session id would decide
 * what the kit believes this mount received.
 */
export declare function refuseSafeSaveHeaders(auth: ProxyAuth | undefined, extraRcloneArgs?: readonly string[]): void;
/** The host name's first part, as the kit accepts a label: [A-Za-z0-9-], at most 32. */
export declare function mountLabel(host: string): string;
export interface AuthDelivery {
    configBody: string;
    authMethod: MountStateFile['auth']['method'];
    /** Always empty: every credential is in `configBody`, never on rclone's command line. */
    headerArgs: string[];
}
export interface BuildAuthDeliveryOpts {
    auth: ProxyAuth;
    url: string;
    rclonePath: string;
    /** Whether this rclone reads `headers` from its config ({@link RCLONE_HEADERS_MIN_VERSION}); false refuses a header credential. */
    supportsHeadersConfig: boolean;
}
/**
 * Build the rclone config text that carries `opts.auth` for the WebDAV
 * remote at `opts.url`: a password is obscured with `rclone obscure`, a
 * token for `Authorization` becomes `bearer_token`, and a token under
 * another header or a computer claim becomes a `headers` line. Nothing is
 * written to disk and `headerArgs` is always empty.
 *
 * Throws when the URL or a credential field holds a line break, when the
 * token is delivered as a query parameter (a mount cannot send one), and
 * when a header credential is needed but `supportsHeadersConfig` is false.
 */
export declare function buildAuthDelivery(opts: BuildAuthDeliveryOpts): Promise<AuthDelivery>;
/**
 * Refuse, before anything is probed or written, an rclone that cannot take `auth` off its command
 * line: a password needs `rclone obscure -` ({@link RCLONE_OBSCURE_STDIN_MIN_VERSION}), a token
 * under another header or a computer claim needs config headers ({@link RCLONE_HEADERS_MIN_VERSION}).
 * A version that could not be read counts as too old. No credential, no limit.
 */
export declare function refuseRcloneTooOldForAuth(auth: ProxyAuth, version: RcloneVersion | null, rclonePath?: string): void;
/** What {@link parseCliTarget} returns: exactly one of `computerId` and `kitUrl` is set; `subpath` is `''` when none was given. */
export interface ParsedCliTarget {
    computerId: string | null;
    kitUrl: string | null;
    subpath: string;
}
/**
 * Parse a CLI target like "abc123", "my_box:/path" or "https://...".
 * Disambiguation:
 *   - starts with http:// or https://          → `kitUrl`, a URL of the files
 *     program (a `#` in it throws)
 *   - <ref> or <ref>:/<subpath>, where <ref> is a computer id or name by the
 *     API's name rule (3 to 100 letters, digits, `-` and `_`) → `computerId`,
 *     with the subpath without its leading slash (the caller resolves a name
 *     to its id)
 *   - anything else (hostname:port, a local path, a malformed URL) → throws
 *     an Error
 */
export declare function parseCliTarget(input: string): ParsedCliTarget;
export { homedir as _homedir };

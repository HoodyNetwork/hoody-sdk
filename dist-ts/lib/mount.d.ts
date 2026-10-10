/**
 * `hoody-sdk/mount` — programmatic and CLI-facing module for
 * mounting Hoody container filesystems locally via rclone+WebDAV.
 *
 * Architecture:
 *   - Resolves a kit URL: a caller-supplied raw URL, or a {@link ContainerLike}
 *     on the containers domain of the caller's API (`client.getKitUrl`, or
 *     `containersDomain`). No platform host is written in here.
 *   - Probes the mounted path with the supplied {@link ProxyAuth} ({@link probeKit},
 *     PROPFIND) before rclone starts, and reports the mount only once it is in the
 *     OS mount table.
 *   - Writes a 0600 rclone config at `~/.hoody/sdk/mounts/<id>.conf`
 *     containing the secret material (bearer_token / pass / headers).
 *     `--auth-container-claim` is the only auth type that may leak via
 *     argv `--header` if the bundled rclone is older than 1.61; v1.74
 *     (the modern reference) supports `headers` config natively.
 *   - Spawns `rclone mount hoody: <localPath>` with `--config <id>.conf`,
 *     foreground (default) or `--daemon` (background; Linux/macOS only).
 *   - Records the mount in `~/.hoody/sdk/mounts/<id>.json` via the
 *     {@link claimState} `wx` exclusive-create + reclaim probe.
 */
import { homedir } from 'node:os';
import type { ProxyAuth } from './proxy-auth.js';
import { type AliveState, type MountStateFile } from './mount-state.js';
export interface ContainerLike {
    id?: string;
    project_id?: string;
    [key: string]: unknown;
}
/** Anything that builds kit URLs for the caller's API: a `HoodyClient` or a container-scoped client. */
export interface KitUrlSource {
    getKitUrl(kit: string, container: ContainerLike, serviceIndex: number): string;
}
/**
 * A container is reached on the containers domain of the API it belongs to, so the container
 * form names that API: `client` (its `getKitUrl`) or `containersDomain` (e.g. the
 * `containers.<platform>` sibling of `api.<platform>`). One of the two is required.
 */
export type MountTarget = {
    container: ContainerLike;
    client: KitUrlSource;
    subpath?: string;
    serviceIndex?: number;
} | {
    container: ContainerLike;
    containersDomain: string;
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
    unmount(): Promise<void>;
}
export interface MountListEntry {
    id: string;
    containerId: string;
    kitUrl: string;
    /** Subpath inside the container that's been mounted (e.g. `home/user`). */
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
export declare function listMounts(home?: string): Promise<MountListEntry[]>;
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
    containerId: string;
};
export declare function mount(opts: MountOptions): Promise<MountHandle>;
export declare function unmountById(id: string, home?: string): Promise<void>;
export declare function unmount(idOrPath: string, home?: string): Promise<void>;
/** Thrown by {@link unmountAll} / {@link unmountByContainer} when a mount could not be unmounted. */
export declare class UnmountError extends Error {
    /** How many mounts were unmounted. */
    readonly unmounted: number;
    readonly failures: ReadonlyArray<{
        id: string;
        localPath: string;
        message: string;
    }>;
    constructor(
    /** How many mounts were unmounted. */
    unmounted: number, failures: ReadonlyArray<{
        id: string;
        localPath: string;
        message: string;
    }>);
}
export declare function unmountAll(home?: string): Promise<number>;
export declare function unmountByContainer(containerId: string, home?: string): Promise<number>;
/**
 * How long a mount trusts its own directory listing, and how long a file must stay closed and
 * idle before its upload starts. rclone's defaults (5 min, 5 s) left another machine's (or the
 * container's) changes and deletes invisible for up to 5 min, and served a file the box had
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
    headerArgs: string[];
}
export interface BuildAuthDeliveryOpts {
    auth: ProxyAuth;
    url: string;
    rclonePath: string;
    supportsHeadersConfig: boolean;
}
export declare function buildAuthDelivery(opts: BuildAuthDeliveryOpts): Promise<AuthDelivery>;
/**
 * Parse a CLI target like "abc123" or "abc123:/path" or "https://..." into
 * a MountTarget. Disambiguation:
 *   - starts with http:// or https://    → raw kit URL
 *   - matches /^[a-z0-9]{4,64}$/         → bare containerId
 *   - matches /^[a-z0-9]{4,64}:\/.*$/    → containerId:subpath
 *   - anything else (hostname:port, etc) → reject with hint
 */
export interface ParsedCliTarget {
    containerId: string | null;
    kitUrl: string | null;
    subpath: string;
}
export declare function parseCliTarget(input: string): ParsedCliTarget;
export { homedir as _homedir };

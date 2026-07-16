/**
 * `hoody-sdk/mount` — programmatic and CLI-facing module for
 * mounting Hoody container filesystems locally via rclone+WebDAV.
 *
 * Architecture:
 *   - Resolves a kit URL (from a {@link ContainerLike} via
 *     {@link HoodyClient.getKitUrl} or a caller-supplied raw URL).
 *   - Probes the URL with the supplied {@link ProxyAuth} to fail fast on
 *     auth/discovery problems before spawning rclone.
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
    id: string;
    project_id?: string;
    [key: string]: unknown;
}
export type MountTarget = {
    container: ContainerLike;
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
export declare function probeKit(kitUrl: string, auth?: ProxyAuth, timeoutMs?: number): Promise<ProbeResult>;
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
export declare function unmountAll(home?: string): Promise<number>;
export declare function unmountByContainer(containerId: string, home?: string): Promise<number>;
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

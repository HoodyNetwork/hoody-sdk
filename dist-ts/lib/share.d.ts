/**
 * `hoody-sdk/share` — make a folder on this machine appear inside a
 * container, at `/hoody/mounts/permanent/<name>` (plans/share-local-folder.md).
 * It is the reverse of `hoody mount` (lib/mount.ts).
 *
 * The chain: `rclone serve webdav <dir>` on 127.0.0.1 with a per-share user
 * and password → a tunnel kit binding (`expose()`) gives it a public HTTPS URL
 * → the files kit connects a WebDAV backend to that URL and mounts it
 * (SHARE_VFS_CONFIG). A local hop (lib/share-hop.ts) sits between the tunnel
 * and rclone: it rewrites WebDAV `Destination` so renames work, and counts
 * the requests stop waits for.
 *
 * The container mount caches writes (`cache_mode: "writes"`): a write lands
 * in the container and is uploaded here within seconds. While this machine is
 * away (or the tunnel is down), reads and writes in the container fail at once
 * with an I/O error: with no listing cache every lookup needs this machine.
 * Writes accepted before that may still be uploading, so stop drains: it waits until the
 * mount reports nothing left to upload, then deletes the mount with
 * `?uploads=wait`, still serving, and the files kit answers once the mount
 * holds nothing more (`delivered`). A stop without that answer keeps the
 * backend and the journal, and never reports a clean stop.
 *
 * The process that calls `share()` is the owner (foreground only). It holds
 * the owner lock, which is also the stop channel (lib/share-lock.ts), keeps a
 * per-run journal (lib/share-journal.ts), and runs one state machine:
 *
 *   starting → serving ⇄ reconnecting → stopping → done | cleanup-pending
 *
 * Every step re-checks the state after each await. One finalizer runs on every
 * stop path: Ctrl+C, `hoody share stop` from another terminal, rclone exiting,
 * a reconnect conflict, or a failed start.
 *
 * Secrets: the password lives only in this process and in the rclone child's
 * environment (an allowlist, lib/rclone-local.ts). It is never in argv, the
 * journal, events or errors; everything shown passes through a scrubber that
 * also removes its HTTP Basic form.
 */
import { type ChildProcess, type SpawnOptions } from 'node:child_process';
import type { ProxyAuth, ProxyAuthPolicy } from './proxy-auth.js';
import { type ShareHop } from './share-hop.js';
import { type RcloneVersion } from './rclone-local.js';
import { type LockFlavor } from './share-lock.js';
import { type ShareJournal, type ShareKit, type ShareTargetRecord, type ShareVfsConfig } from './share-journal.js';
export type { ShareJournal, ShareKit, ShareKitRequestInit, ShareKitResponse, ShareTargetRecord } from './share-journal.js';
export type { LockFlavor } from './share-lock.js';
export type { ShareHop } from './share-hop.js';
export type ShareState = 'starting' | 'serving' | 'reconnecting' | 'stopping' | 'done' | 'cleanup-pending';
export type StopKind = 'requested' | 'interrupted' | 'child-exited' | 'conflict' | 'start-failed';
export interface ShareEvent {
    level: 'info' | 'warn';
    message: string;
}
/** The tunnel handle a share needs from `expose()`. */
export interface ShareTunnel {
    publicUrl?: string | undefined;
    bind: {
        containerPort: number;
        bindId?: number;
    };
    /** `id`: the kit's session id while connected (TunnelSession clears it on close). */
    session: {
        readonly id?: string;
        onClose(fn: () => void): () => void;
    };
    close(): Promise<void>;
}
export interface ShareResumeOptions {
    url: string;
    kitAuth?: ProxyAuth | ProxyAuthPolicy;
    /** The dropped session's id. */
    sessionId: string;
    to: {
        host: string;
        port: number;
    };
}
/** A session the kit gave back (HELLO_OK `resumed`), with the binds it holds again. */
export interface ShareResumed {
    session: ShareTunnel['session'];
    resumedBinds: ReadonlyArray<{
        bindId: number;
        kind: string;
        mode: string;
        containerPort: number;
    }>;
    close(): Promise<void>;
}
export interface ShareExposeOptions {
    url: string;
    kitAuth?: ProxyAuth | ProxyAuthPolicy;
    containerPort: number;
    to: {
        host: string;
        port: number;
    };
}
export interface ShareTimings {
    /** Budget for rclone's ready line plus the 401/207 probe. */
    readyMs: number;
    /** Interval of the restart-repair check while serving. */
    repairPollMs: number;
    /** How long to wait after a repair for the mount to turn active. */
    repairVerifyMs: number;
    /**
     * How long a held port (`PORT_IN_USE`, or `ALREADY_BOUND` while the server
     * still holds the dropped session's binding) is retried, from the first such
     * answer, before the owner reports a conflict. Never with takeover.
     */
    portInUseMs: number;
    backoffMinMs: number;
    backoffMaxMs: number;
    /** SIGTERM to SIGKILL. */
    killGraceMs: number;
    lostCreateWindowMs: number;
    lostCreatePollMs: number;
    /** Interval of the stop's upload-state polls. */
    drainPollMs: number;
    /** After the container confirmed delivery: the longest wait for the hop's requests in flight to end. */
    settleMs: number;
    /** Without an owner: how long the mount's DELETE waits for the container to confirm it holds nothing. */
    cleanupWaitMs: number;
}
export declare const SHARE_TIMINGS: ShareTimings;
/** How long stop waits by default for the container to upload what it holds (`--drain-timeout`). */
export declare const SHARE_DRAIN_TIMEOUT_MS = 300000;
/** Injection points for tests. Every field has a real default. */
export interface ShareDeps {
    expose(opts: ShareExposeOptions): Promise<ShareTunnel>;
    /**
     * Reclaim a dropped session within the kit's grace (`resumeExpose()`):
     * null when the kit answered without resuming it; throws without HELLO_OK.
     */
    resume(opts: ShareResumeOptions): Promise<ShareResumed | null>;
    spawn(command: string, args: readonly string[], options: SpawnOptions): ChildProcess;
    requireVersion(rclonePath: string): Promise<RcloneVersion>;
    probe(port: number, user: string, pass: string): Promise<void>;
    /** The local hop in front of rclone on `upstreamPort`. */
    startHop(upstreamPort: number, now: () => number): Promise<ShareHop>;
    sleep(ms: number, signal?: AbortSignal): Promise<void>;
    now(): number;
    /**
     * Called after every journal write with a copy of what was written. A test
     * kill point: `crash()` turns the owner inert and releases its lock the way
     * the kernel does when the process dies; a hook that then returns a promise
     * that never settles leaves the owner stopped at that point, with nothing of
     * its cleanup run.
     */
    afterJournalWrite?(journal: ShareJournal, crash: () => Promise<void>): Promise<void> | void;
}
export interface ShareTarget {
    /** Origin of the account API (`https://api.hoody.com`); part of the share's key. */
    apiOrigin: string;
    containerId: string;
    server?: string;
    projectId?: string;
}
export interface ShareOptions {
    localPath: string;
    /** Defaults to the folder's base name. */
    name?: string;
    readOnly?: boolean;
    target: ShareTarget;
    /** The container's files kit. */
    kit: ShareKit;
    /** The tunnel kit's connect URL (`wss://…-tunnel-1…/api/v1/tunnel/connect`). */
    tunnelUrl: string;
    /** Kit credential for the tunnel upgrade (as `expose()` takes it). */
    kitAuth?: ProxyAuth | ProxyAuthPolicy;
    rclonePath?: string;
    /** Override of `~/`. For tests. */
    home?: string;
    /** Aborting it stops the share, during start or while serving. */
    signal?: AbortSignal;
    /**
     * Aborting it during a stop ends the wait for the container's uploads (a
     * second Ctrl+C). What the container still holds then stays there, and the
     * stop is not reported clean. Aborting it before a stop also starts one.
     */
    forceSignal?: AbortSignal;
    /** How long stop waits for the container's uploads. Default SHARE_DRAIN_TIMEOUT_MS. */
    drainTimeoutMs?: number;
    onEvent?: (event: ShareEvent) => void;
    lockFlavor?: LockFlavor;
    timings?: Partial<ShareTimings>;
    deps?: Partial<ShareDeps>;
}
export interface ShareStopResult {
    /** Every remote resource is confirmed gone and the journal is deleted. */
    ok: boolean;
    /**
     * The files kit answered the mount's DELETE with `delivered`: the mount
     * held no open file and nothing unsent. False when the stop was forced,
     * timed out or could not tell: writes may not have reached this machine.
     */
    drained: boolean;
    /** The mount's DELETE discarded what the container had not sent (`hoody share stop --force`). */
    discarded: boolean;
    state: 'done' | 'cleanup-pending';
    kind: StopKind;
    reason: string;
    /** What is left behind (empty when `ok`). */
    leftovers: string[];
}
export interface ShareHandle {
    id: string;
    name: string;
    containerId: string;
    localPath: string;
    /** The path in the container, as the files kit answered it. */
    mountPath: string;
    publicUrl: string;
    readOnly: boolean;
    state(): ShareState;
    /** `force`: as `forceSignal`, do not wait for the container's uploads. */
    stop(reason?: string, opts?: {
        force?: boolean;
    }): Promise<ShareStopResult>;
    /** Settles when the share has stopped, whatever stopped it. */
    done: Promise<ShareStopResult>;
}
export declare class ShareError extends Error {
    readonly result?: ShareStopResult | undefined;
    constructor(message: string, result?: ShareStopResult | undefined);
}
export declare class AmbiguousShareError extends Error {
    readonly shareName: string;
    readonly choices: ReadonlyArray<{
        containerId: string;
        apiOrigin: string;
    }>;
    constructor(shareName: string, choices: ReadonlyArray<{
        containerId: string;
        apiOrigin: string;
    }>);
}
export declare const SHARE_NAME_RULE = "1-64 characters from A-Z a-z 0-9 . _ -, not \".\" or \"..\", and not starting with \"-\"";
/** Null when `name` follows the rules, else why not. */
export declare function shareNameProblem(name: string): string | null;
/**
 * The folder to share: it must exist and be a directory, and is returned as
 * its real path. On Linux and macOS an argument shaped like an rclone remote
 * (`name:` before any `/`) is refused, so rclone can never read it as one.
 */
export declare function resolveShareDir(input: string, platform?: NodeJS.Platform): Promise<string>;
export declare function normalizeApiOrigin(apiOrigin: string): string;
/** The argv of the local WebDAV server. The password is in the environment, never here. */
export declare function rcloneServeArgs(localPath: string, readOnly: boolean, platform?: NodeJS.Platform): string[];
/**
 * The container mount's own settings, the one place they are decided. Create,
 * the restart repair's PATCH and its check all use what this builds, and the
 * journal records it:
 *   - `writes`: in-place edits work; a write is uploaded within seconds,
 *     and stop drains what is not uploaded yet (`uploads.state`);
 *   - `dir_cache_time: 0`: no stale "does not exist" view of the folder;
 *   - `timeout`/`contimeout` (s) and `low_level_retries`: while this machine
 *     is away, reads and writes fail in seconds instead of hanging.
 */
export declare const SHARE_VFS_CONFIG: ShareVfsConfig;
export declare function shareVfsConfig(readOnly: boolean): ShareVfsConfig;
/**
 * A vfs_config value in one form for comparing: numbers, numeric strings and
 * Go durations become seconds (`10`, `"10"`, `"10s"` are equal; so are `0`
 * and `"0s"`), `"true"`/`"false"` become booleans, other strings stay.
 */
export declare function normalizeVfsValue(v: unknown): unknown;
/**
 * Whether the kit's `vfs_config` (`got`) carries every recorded setting
 * (`want`), whatever form the kit answers each in; `read_only` must equal
 * `readOnly` (absent is false).
 */
export declare function vfsConfigMatches(want: ShareVfsConfig, got: unknown, readOnly: boolean): boolean;
export interface FetchShareKitOptions {
    headers?: Record<string, string>;
    fetch?: (url: string, init: RequestInit) => Promise<Response>;
    timeoutMs?: number;
}
/**
 * A ShareKit over fetch, for the files kit at `baseUrl`
 * (`https://<project>-<container>-files-1.<server>.containers.hoody.com`).
 * Redirects are refused, so kit credentials go only to that origin.
 */
export declare function fetchShareKit(baseUrl: string, opts?: FetchShareKitOptions): ShareKit;
/** A mount's `uploads`, or `gone` when the mount no longer exists. */
export interface UploadsView {
    state: 'idle' | 'busy' | 'unknown' | 'gone';
    /** Files written in the container and not yet uploaded; null when not known. */
    dirty: number | null;
    /** Files still open in the container; null when not known. */
    openHandles: number | null;
}
/** The mount's `uploads` field. Anything missing or malformed is `unknown`, never a made-up 0. */
export declare function parseUploads(v: unknown): UploadsView;
/** "3 files not yet on this machine" (with what is still open), for a mount that is not idle. */
export declare function pendingText(u: Pick<UploadsView, 'dirty' | 'openHandles'>): string;
/** The files-kit feature a share's stop needs (`GET /api/v1/version` `features`). */
export declare const SHARE_KIT_FEATURE = "mount_delete_uploads";
/**
 * Stop a recorded child (and its process group) only while `pid` still names
 * the process with start identity `identity`: a pid reused by another process
 * is never signalled. Unix: SIGTERM to the group, SIGKILL after `graceMs`.
 * Windows: `taskkill /T /F` on the verified pid.
 */
export declare function killRecordedChild(pid: number, identity: string | null | undefined, opts?: {
    graceMs?: number;
}): Promise<'gone' | 'killed' | 'identity-mismatch'>;
/** The files kit's errors for a restored mount (hoody-files `server.rs`). */
export declare const BACKEND_UNAVAILABLE = "backend unavailable";
export declare const OWN_SETTINGS_NOT_STARTED = "the mount has settings of its own and was not started after the restart; update it to start it";
/**
 * Share `localPath` into the container. Resolves once the folder is mounted
 * in the container (`handle.mountPath`); the share then runs until
 * `handle.stop()`, `opts.signal`, `stopShare()` from another process, rclone
 * exiting, or a reconnect conflict. A failed start cleans up what it made and
 * throws a ShareError.
 */
export declare function share(opts: ShareOptions): Promise<ShareHandle>;
export interface ShareListEntry {
    id: string;
    name: string;
    containerId: string;
    apiOrigin: string;
    localPath: string;
    mountPath?: string | undefined;
    publicUrl?: string | undefined;
    readOnly: boolean;
    /** The owner's live state, `dead` (owner gone, not cleaned up) or `cleanup pending`. */
    status: ShareState | 'dead' | 'cleanup pending';
    leftovers?: string[] | undefined;
    startedAt: string;
}
export interface ListSharesOptions {
    home?: string;
    lockFlavor?: LockFlavor;
}
/** Every share this user has a journal for, with its owner's live state. */
export declare function listShares(opts?: ListSharesOptions): Promise<ShareListEntry[]>;
export interface StopShareOptions {
    name: string;
    /** Picks one when the name is shared to more than one container. */
    containerId?: string;
    apiOrigin?: string;
    home?: string;
    /** The files kit of a journal's container, for cleanup without an owner. */
    kitFor(target: ShareTargetRecord): ShareKit | Promise<ShareKit>;
    onEvent?: (event: ShareEvent) => void;
    lockFlavor?: LockFlavor;
    timings?: Partial<ShareTimings>;
    /**
     * Discard what the container holds that never reached this machine: the
     * mount's DELETE asks the files kit to discard it (`?uploads=discard`).
     * Without an owner those writes cannot be delivered any more, and unless
     * this is set a stop refuses (UndeliveredWritesError) while the mount
     * reports any, or cannot say. With an owner it stops the owner's wait.
     */
    force?: boolean;
}
/** `stopShare` without an owner, refused: the container holds writes that stopping would discard. */
export declare class UndeliveredWritesError extends Error {
    constructor(message: string);
}
export interface StopShareResult {
    /** Stopped, nothing left behind, and (with an owner) the container's writes confirmed delivered. */
    ok: boolean;
    name: string;
    containerId: string;
    /** `owner`: the running owner stopped it. `cleanup`: no owner ran; this process cleaned up. */
    via: 'owner' | 'cleanup';
    leftovers: string[];
    message: string;
}
/**
 * Stop the share called `name`. With a live owner the request goes through
 * its stop channel and the owner's result comes back. Without one, this
 * process takes the lock and finishes every unfinished journal of the share:
 * it looks for lost creates, refuses (unless `force`) while a mount holds
 * writes, kills the recorded rclone only if its start identity still matches,
 * deletes the mount and then its backend, and deletes a journal once all it
 * records is confirmed gone.
 */
export declare function stopShare(opts: StopShareOptions): Promise<StopShareResult>;

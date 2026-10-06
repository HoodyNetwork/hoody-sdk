/**
 * The owner lock of a `hoody share`, which is also its stop channel.
 *
 * The owner listens on a local channel for its whole life, and holding the
 * channel's name is ownership (plans/share-local-folder.md, "Ownership, lock
 * and journals"):
 *
 *   - Linux: the abstract socket `\0hoody-share-<uid>-<id>`. A second bind
 *     fails while a process holds it, and the kernel frees it when the process
 *     dies, so there is no file and no stale state.
 *   - Windows: the named pipe `\\.\pipe\hoody-share-<user sid>-<id>`. Node
 *     creates it with FILE_FLAG_FIRST_PIPE_INSTANCE, so a second listen fails
 *     with EADDRINUSE while it exists; it is freed when the process dies.
 *   - macOS (the `file` flavour): the socket file `<id>.sock`, which outlives a
 *     crashed owner, so a failed bind goes through a reclaim gate
 *     (`acquireFileLock`).
 *
 * Requests are one JSON line each way. A request carries the run token the
 * owner wrote to `<id>.owner` (0600) after winning, so another local user,
 * who cannot read that file, cannot stop the share.
 */
export type LockFlavor = 'abstract' | 'pipe' | 'file';
export declare function defaultLockFlavor(platform?: NodeJS.Platform): LockFlavor;
/** A gate whose writer is dead is removed only once it is older than this. */
export declare const RECLAIM_GATE_STALE_MS = 30000;
/** How long a connection may stay open without a request the owner accepts. */
export declare const CHANNEL_AUTH_TIMEOUT_MS = 5000;
export interface LockPaths {
    /** The directory holding `<id>.owner` (and, for `file`, `<id>.sock` and `<id>.reclaim`). */
    dir: string;
    id: string;
    flavor: LockFlavor;
    /** The user part of an abstract or pipe name. Defaults to the uid, or the user SID on Windows. */
    user?: string;
}
export declare function newRunToken(): string;
export declare function ownerTokenPath(dir: string, id: string): string;
export declare function reclaimGatePath(dir: string, id: string): string;
/** The address the owner listens on. */
export declare function channelAddress(paths: LockPaths): Promise<string>;
/**
 * A value that names one process instance: its start time. A pid reused by
 * another process gets another value, so a recorded (pid, identity) pair is
 * signalled only while it still names the same process. Null when the process
 * does not exist or its start time cannot be read.
 */
export declare function processStartIdentity(pid: number): Promise<string | null>;
/** Whether a process with this pid and start identity is still running. */
export declare function isSameProcessAlive(pid: number, identity: string | null | undefined): Promise<boolean>;
export declare function readOwnerToken(dir: string, id: string): Promise<string | null>;
/** `force` (stop only): discard what the container has not sent yet instead of waiting for it. */
export type ChannelRequest = {
    op: 'stop' | 'status';
    token: string;
    force?: boolean;
};
export interface ChannelConnection {
    /** Send one message line to the requester. */
    send(message: Record<string, unknown>): void;
    /** Close the connection after what was sent. */
    end(): void;
}
export type ChannelHandler = (request: ChannelRequest, conn: ChannelConnection) => void;
export interface OwnerLock {
    readonly address: string;
    readonly token: string;
    readonly flavor: LockFlavor;
    /** Route channel requests (already token-checked) to `handler`. */
    setHandler(handler: ChannelHandler | null): void;
    /** Stop listening and give up ownership. Idempotent. */
    release(): Promise<void>;
}
export type AcquireResult = {
    won: true;
    lock: OwnerLock;
} | {
    won: false;
    reason: 'live-owner' | 'reclaim-busy';
};
/** Test hooks for the interleavings the reclaim gate exists for. */
export interface LockHooks {
    /** `file`: after a bind failed and a connect was refused (the socket looks stale), before the gate. */
    afterStaleRead?: () => Promise<void> | void;
    /** `file`: holding the gate, before the second connect. */
    underGate?: () => Promise<void> | void;
}
export interface AcquireOptions extends LockPaths {
    token: string;
    hooks?: LockHooks;
    /** How long to wait for another process's reclaim gate. Default 2 s. */
    gateWaitMs?: number;
    /** How long a connection may stay open without an accepted request. Default CHANNEL_AUTH_TIMEOUT_MS. */
    authTimeoutMs?: number;
}
/** Whether something accepts connections at `address` (within `timeoutMs`). */
export declare function canConnect(address: string, timeoutMs?: number): Promise<boolean>;
/**
 * Take the owner lock of share `id`, or report why not. On success the run
 * token is written to `<id>.owner` (0600).
 */
export declare function acquireOwnerLock(opts: AcquireOptions): Promise<AcquireResult>;
export interface ChannelReply {
    type: string;
    [key: string]: unknown;
}
export type RequestOutcome = {
    reached: true;
    replies: ChannelReply[];
} | {
    reached: false;
    reason: 'no-owner' | 'no-token';
};
/**
 * Send `op` to the owner of share `id` and collect its replies until it ends
 * the connection (`onReply` sees each as it arrives). `no-owner` when nothing
 * listens; `no-token` when something listens but `<id>.owner` cannot be read
 * (another user's share, or an owner that has not written it yet).
 */
export declare function requestOwner(paths: LockPaths, op: ChannelRequest['op'], opts?: {
    onReply?: (reply: ChannelReply) => void;
    timeoutMs?: number;
    force?: boolean;
}): Promise<RequestOutcome>;

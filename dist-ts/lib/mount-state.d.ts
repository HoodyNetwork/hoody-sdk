/**
 * Mount state directory — `~/.hoody/sdk/mounts/` — tracks active `hoody mount`
 * sessions across process lifetimes.
 *
 * Layout (per mount):
 *   <id>.json    state record (this module's I/O)
 *   <id>.conf    rclone config file with secrets (0600) — managed by mount.ts
 *
 * `id` is `sha256(<uid>:<localPath>)` truncated to 16 hex chars (64 bits).
 * Deterministic so a re-mount of the same path under the same UID collides
 * predictably with the existing record — exploited for the `wx` exclusive-
 * create reclaim probe in `claimState()`.
 */
export interface MountStateFile {
    id: string;
    version: 1;
    containerId: string;
    kitUrl: string;
    subpath: string;
    localPath: string;
    mode: 'foreground' | 'background';
    pid: number | null;
    rclonePid: number | null;
    auth: {
        method: 'none' | 'password' | 'token' | 'header' | 'ip' | 'containerClaim';
    };
    startedAt: string;
    platform: NodeJS.Platform;
}
export type AliveState = 'alive' | 'stale' | 'dead';
export interface LivenessResult {
    alive: AliveState;
    reason: string;
}
export declare function getStateDir(home?: string): string;
export declare function computeMountId(localPath: string, uid?: number): string;
export declare function stateFilePath(id: string, home?: string): string;
export declare function configFilePath(id: string, home?: string): string;
/**
 * Attempt to claim a state record. Uses `fs.open(path, 'wx', 0o600)` for
 * atomic exclusive-create. On EEXIST runs a reclaim probe: if the prior
 * mount is dead AND not in the OS mount table, the stale record is
 * atomically overwritten via tmp-write + rename. Otherwise throws.
 *
 * The reclaim race (two concurrent reclaim attempts both seeing 'dead')
 * is broken by the rename being atomic: only one wins. The loser's
 * second `fs.open(path, 'wx')` retry will see the winner's record as
 * 'alive' (since `kill -0 <winner.pid>` succeeds) and fail with the
 * standard "already registered" error.
 */
export declare function claimState(record: MountStateFile, home?: string): Promise<void>;
export declare function readState(id: string, home?: string): Promise<MountStateFile>;
export declare function deleteState(id: string, home?: string): Promise<void>;
export declare function listStateIds(home?: string): Promise<string[]>;
export declare function listStates(home?: string): Promise<MountStateFile[]>;
/**
 * Liveness algorithm:
 *   0. pid === null → skip 1+2; go to step 3 (mount table authoritative).
 *   1. pid <= 0 → 'dead' (legacy/corrupt file).
 *   2. kill -0 pid; if ESRCH → 'dead'.
 *   3. stat(localPath) with 1500ms timeout; on timeout hold pending step 4.
 *   4. mount table check; combined verdict.
 */
export declare function checkLiveness(rec: MountStateFile): Promise<LivenessResult>;
/**
 * Prune dead state files AND their sibling .conf files. After the main
 * sweep, also removes orphan .conf files (no matching .json) — these can
 * appear if a crash interrupted the unmount path between unlinking .json
 * and unlinking .conf.
 */
export declare function pruneStale(home?: string): Promise<{
    removed: number;
    orphans: number;
}>;
/**
 * Best-effort empty-mountpoint check used as a pre-flight UX courtesy.
 * Race-free correctness is delegated to rclone (which refuses non-empty
 * mountpoints). Returns true if path is missing OR exists+empty.
 */
export declare function isMountpointEmpty(localPath: string): Promise<boolean>;
export declare function ensureMountpointParent(localPath: string): Promise<void>;

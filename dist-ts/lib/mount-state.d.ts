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
    computerId: string;
    kitUrl: string;
    subpath: string;
    localPath: string;
    mode: 'foreground' | 'background';
    pid: number | null;
    rclonePid: number | null;
    /**
     * The start time of `pid` as the OS reports it ({@link processStartTime}), recorded with it.
     * Unmount signals `pid` only while it still has this start time and is still an rclone mount
     * of `localPath`, so a pid the OS has given to another process is never signalled. Absent in
     * records written before it existed, and when the OS could not tell.
     */
    pidStart?: string | null;
    /**
     * The process that is starting this mount, while `pid` is still null (a background mount
     * waits for its daemon). The record counts as alive while that process runs, so another
     * mount of the same path cannot take it over and prune does not remove it mid-start.
     */
    starter?: {
        pid: number;
        start: string | null;
    };
    /**
     * A random token written with the claim. The process that claimed the record rewrites or
     * removes it only while the record on disk still carries this token, so it never overwrites a
     * record another mount has claimed since.
     */
    claimToken?: string;
    /** The rclone binary as it was started (`rclonePath`), which a later unmount checks the pid against. */
    rclonePath?: string;
    auth: {
        method: 'none' | 'password' | 'token' | 'header' | 'ip' | 'computerClaim';
    };
    startedAt: string;
    platform: NodeJS.Platform;
    /** Where this mount's rclone may queue uploads (its cache dir, and any `--cache-dir` in the extra args); unmount waits on them. */
    cacheDirs?: string[];
}
export type AliveState = 'alive' | 'stale' | 'dead';
export interface LivenessResult {
    alive: AliveState;
    reason: string;
}
/**
 * The directory holding the mount records: `<home>/.hoody/sdk/mounts`. `home` defaults to the user's home
 * directory.
 */
export declare function getStateDir(home?: string): string;
/**
 * The stable 16-hex id of a mount: a SHA-256 of the uid and the resolved absolute `localPath`. The path is
 * resolved, not followed through symbolic links, so the same folder reached by two spellings gets two ids.
 */
export declare function computeMountId(localPath: string, uid?: number): string;
/** Path of the JSON record of mount `id`. */
export declare function stateFilePath(id: string, home?: string): string;
/** Path of the rclone config file kept beside the record of mount `id`. */
export declare function configFilePath(id: string, home?: string): string;
/**
 * rclone's VFS cache directory for one mount: keyed by the mount id (the
 * local path) AND the remote URL. rclone files its cache under the remote's
 * name and root, which are the same (`hoody:`) for every mount, so a shared
 * cache would let writes left pending by a crashed mount of one computer be
 * uploaded to whichever computer is mounted next. The directory is kept
 * after unmount, so remounting the same URL at the same path recovers its own
 * pending writes. rclone expires cached files only while a mount of that cache
 * runs; nothing removes the directory of a mount that is never made again.
 */
export declare function cacheDirPath(id: string, kitUrl: string, home?: string): string;
/**
 * The start time of process `pid` as an opaque string, or null when the OS cannot tell (the
 * process is gone, Windows). Linux: field 22 of `/proc/<pid>/stat` (clock ticks since boot);
 * macOS: `ps -o lstart=`. Two processes that had the same pid one after the other have
 * different start times.
 */
export declare function processStartTime(pid: number): Promise<string | null>;
/**
 * What a mount's rclone was started with: the binary as it was passed to spawn (`rclonePath`)
 * and the mount's own `--config` file. Both narrow {@link isMountCommandOf} to that one rclone.
 */
export interface MountLaunch {
    binary?: string;
    confPath?: string;
}
/**
 * Whether an argv (or a joined command line) is the rclone mount the library spawns for
 * `localPath`: an rclone executable (or `launch.binary`, also when an interpreter runs it as a
 * script) followed by exactly `mount hoody: <localPath>`, and, when `launch.confPath` is given,
 * `--config <confPath>` after it. A wrapper (`sudo hoody mount <url> <path>`, `timeout 60 hoody
 * mount …`) or any other program that only carries the same words is not.
 */
export declare function isMountCommandOf(command: string[] | string, localPath: string, launch?: MountLaunch): boolean;
/**
 * Whether `pid` is still the rclone process of a mount at `localPath`: `same`, `other` (the pid
 * now belongs to another process: a different start time than `recordedStart`, or a command
 * line that is not an rclone mount of `localPath`), `gone`, or `unknown` (it runs, but the OS
 * gives neither its start time nor its command line: Windows, or an unreadable /proc).
 */
export declare function mountProcessIdentity(pid: number, localPath: string, recordedStart: string | null | undefined, launch?: MountLaunch): Promise<'same' | 'other' | 'gone' | 'unknown'>;
/** One running process: its pid, and its argv (Linux) or joined command line (macOS). */
export interface ListedProcess {
    pid: number;
    command: string[] | string;
}
/** The `<pid> <command line>` lines of `ps -o pid=,command=`. */
export declare function parsePsLines(stdout: string): ListedProcess[];
/**
 * The pids of the rclone mounts of `localPath` now running, other than `exclude` and this
 * process: every listed process ({@link listProcesses}, or `list` in tests) that
 * {@link isMountCommandOf} accepts.
 */
export declare function findMountProcesses(localPath: string, exclude?: number, launch?: MountLaunch, list?: () => Promise<ListedProcess[]>): Promise<number[]>;
/** The starter marker for a record this process is about to claim. */
export declare function starterMarker(): Promise<{
    pid: number;
    start: string | null;
}>;
/**
 * Whether `rec` is a mount still starting: no rclone pid recorded yet, and the process starting
 * it (its starter, by pid and start time) still runs. That process owns the record until it
 * writes the pid.
 */
export declare function isStarting(rec: MountStateFile): Promise<boolean>;
/**
 * Run `fn` holding the state directory's lock file (`<state dir>/.lock`), so a claim, a
 * reclaim and a prune never run at the same time: one cannot remove or take over a record the
 * other is judging. The lock names its holder (pid and start time) and a random token; a lock
 * whose holder has ended is broken ({@link breakLock}). The file is created whole (written
 * beside it, then hard-linked into place), so it is never seen empty.
 */
export declare function withStateLock<T>(home: string | undefined, fn: () => Promise<T>): Promise<T>;
/**
 * Attempt to claim a state record, holding the state lock ({@link withStateLock}). Uses
 * `fs.open(path, 'wx', 0o600)` for atomic exclusive-create. On EEXIST runs a reclaim probe:
 * if the prior mount is dead (its rclone gone and its path not mounted, and no live process is
 * still starting it), the stale record is atomically overwritten via tmp-write + rename.
 * Otherwise throws. The lock makes the probe and the overwrite one step, so two reclaims, or a
 * reclaim and a prune, cannot both act on the same record. A path that is already a mount point
 * is refused.
 */
export declare function claimState(record: MountStateFile, home?: string): Promise<void>;
/**
 * Rewrite a record this process claimed (a pid found after the claim), only while the record on
 * disk is still that claim ({@link sameClaim}); written beside it and renamed over it, so a
 * reader (list, prune) never sees it half written. False, and nothing written, when the record
 * was removed or claimed by another mount since: the caller has lost the mount point's record.
 */
export declare function writeOwnState(record: MountStateFile, home?: string): Promise<boolean>;
/**
 * Remove the record (and its .conf) only while it is still the one `record` names
 * ({@link sameClaim}). A mount that fails, and an unmount, remove that mount's record and never
 * one another mount has claimed since.
 */
export declare function deleteOwnState(record: MountStateFile, home?: string): Promise<void>;
/**
 * Read the record of mount `id`. Throws when the file is missing, is not JSON, or carries a version this code does
 * not read. A record written under the older field names is returned with the current ones.
 */
export declare function readState(id: string, home?: string): Promise<MountStateFile>;
/**
 * Delete the record of mount `id` and its rclone config file. Never throws: a file that is already gone, or cannot
 * be removed, is ignored.
 */
export declare function deleteState(id: string, home?: string): Promise<void>;
/**
 * The ids of every mount record in the state directory (one per `.json` file, readable or not). Creates the
 * directory if it is missing.
 */
export declare function listStateIds(home?: string): Promise<string[]>;
/**
 * Every readable mount record, newest first by `startedAt`. A record that cannot be read or parsed is left out,
 * not reported.
 */
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
 * Whether `localPath` is a mount point in the OS mount table: true or false, or null when the
 * table cannot be read (and on Windows). Reads the table only and never touches the path,
 * which hangs on a dead FUSE mount. Compares both the path as given and the path with its
 * parent's symlinks resolved (macOS lists /private/tmp for /tmp).
 */
export declare function mountTableHas(localPath: string): Promise<boolean | null>;
/**
 * Prune dead state files AND their sibling .conf files. After the main
 * sweep, also removes orphan .conf files (no matching .json) — these can
 * appear if a crash interrupted the unmount path between unlinking .json
 * and unlinking .conf. Holds the state lock ({@link withStateLock}), so it
 * never judges a record a claim is writing; a mount still starting counts as alive.
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
/** Create the parent directory of `localPath` (and any missing ancestors). The mountpoint itself is not created. */
export declare function ensureMountpointParent(localPath: string): Promise<void>;

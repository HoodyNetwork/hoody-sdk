/**
 * Helpers shared by the modules that run rclone on the user's machine:
 * `hoody mount` (lib/mount.ts) and `hoody share` (lib/share.ts).
 *
 *   - version: find rclone, parse `rclone version`, compare against a minimum;
 *   - child environment: an allowlist, so a share's rclone never inherits the
 *     parent's other variables (in particular no other `RCLONE_*`);
 *   - stderr: a CRLF-safe line reader with a byte cap, and the parser for the
 *     line `rclone serve webdav` prints once it listens;
 *   - secrets: a scrubber for a password and its HTTP Basic form, applied to
 *     anything shown to the user that came from the child or the network.
 */
export type RcloneVersion = readonly [number, number, number];
/**
 * The oldest rclone `hoody share` accepts. Older or unparseable versions are
 * refused. 1.61.0 is where `serve webdav` moved to lib/http and began logging
 * `WebDav Server started on [<urls>]`, a list built from the bound listener
 * (so `--addr 127.0.0.1:0` reports the real port); 1.60.1 logged a bare URL
 * (cmd/serve/webdav/webdav.go at v1.60.1 vs v1.61.0; changelog v1.61.0
 * "serve webdav: Refactor to use lib/http"). Every flag `rcloneServeArgs`
 * passes exists there: `--links`/`--copy-links` (local backend, no prefix,
 * since 1.46/1.36), `--rc`, `--config`, `--log-level`, `--dir-cache-time`,
 * `--vfs-cache-mode`, `--read-only`, and `--user`/`--pass` read from
 * RCLONE_USER/RCLONE_PASS (lib/http/auth.go). Checked on 2026-10-05 by
 * running the release binaries through the share's chain: 1.61.0 passes
 * readiness, the 401/207 probe, PUT, MOVE and a fresh listing; 1.60.1 never
 * reports ready.
 */
export declare const RCLONE_SHARE_MIN_VERSION: RcloneVersion;
export declare const RCLONE_INSTALL_HINT: string;
/** `rclone v1.75.1` → [1, 75, 1]; a missing patch is 0. Null when the text has no version. */
export declare function parseRcloneVersion(stdout: string): RcloneVersion | null;
/**
 * Whether `v` is at least `target`, compared component by component over the
 * components `target` names (a two-part target ignores the patch).
 */
export declare function isVersionAtLeast(v: RcloneVersion | null, target: readonly number[]): boolean;
export declare function formatVersion(v: readonly number[]): string;
export declare function detectRcloneVersion(rclonePath: string): Promise<RcloneVersion | null>;
export declare function assertRcloneInstalled(rclonePath: string): Promise<void>;
/**
 * Fail closed: rclone must run, print a version this module can parse, and be
 * at least `min`.
 */
export declare function requireRcloneVersion(rclonePath: string, min?: RcloneVersion): Promise<RcloneVersion>;
/** The only variables a local rclone child inherits from the parent. */
export declare const CHILD_ENV_ALLOWLIST: readonly string[];
/**
 * The environment for a local rclone child: the allowlisted variables the
 * parent has, plus exactly `extra`. Nothing else is inherited, so no other
 * `RCLONE_*` (a config path, a remote, a password) can change what the child
 * does. Returns a new object; `source` is never modified.
 */
export declare function buildChildEnv(extra: Readonly<Record<string, string>>, source?: NodeJS.ProcessEnv): Record<string, string>;
/** Cap on what the line reader buffers: one partial line, and the kept tail. */
export declare const LINE_READER_CAP_BYTES: number;
/**
 * Splits a byte stream into lines. `\r\n` and `\n` both end a line, and a
 * chunk boundary may fall anywhere, including between `\r` and `\n`. A partial
 * line longer than the cap is cut and delivered as a line. The last lines are
 * kept (at most the cap in total) for error messages.
 */
export declare class BoundedLineReader {
    private readonly onLine;
    private readonly capBytes;
    private partial;
    private readonly tailLines;
    private tailBytes;
    constructor(onLine: (line: string) => void, capBytes?: number);
    push(chunk: Buffer | string): void;
    /** Deliver a last line that had no newline. */
    end(): void;
    /** The last lines seen, oldest first. */
    tail(): string[];
    private emit;
}
/**
 * The port from the line `rclone serve webdav` logs once it listens
 * (rclone v1.61.0 and later: `... WebDav Server started on [http://127.0.0.1:<port>/]`;
 * earlier releases logged the URL without brackets and are refused by version).
 * Null for any other line.
 */
export declare function parseWebdavReadyLine(line: string): number | null;
export declare const SECRET_PLACEHOLDER = "[redacted]";
/** The HTTP Basic credential for `user:pass` (without the `Basic ` prefix). */
export declare function basicAuthValue(user: string, pass: string): string;
/**
 * A function that replaces every form of the password a message could carry:
 * the password itself, its percent-encoded form, and the Basic credential
 * built from it.
 */
export declare function makeSecretScrubber(user: string, pass: string): (text: string) => string;
/** The part of a ChildProcess the readiness wait uses. */
export interface ReadinessChild {
    stderr: NodeJS.ReadableStream | null;
    exitCode: number | null;
    signalCode?: NodeJS.Signals | null;
    once(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
    removeListener(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
}
export interface ReadyResult {
    port: number;
    /** The reader, still attached to stderr; its tail serves later error messages. */
    reader: BoundedLineReader;
}
/**
 * Wait for `rclone serve webdav` to print the line naming its port. Rejects
 * when the child exits first, when stderr ends without the line, or after
 * `timeoutMs`; the error shows the child's last lines, passed through
 * `scrub`. stderr keeps being read afterwards, so the child never blocks on
 * a full pipe.
 */
export declare function waitForWebdavReady(child: ReadinessChild, opts: {
    timeoutMs: number;
    scrub?: (text: string) => string;
    onLine?: (line: string) => void;
}): Promise<ReadyResult>;
/**
 * Check that the local WebDAV server answers 401 without credentials and 207
 * with them, so it is the server this run started and it enforces the
 * password. Throws otherwise.
 */
export declare function probeWebdavAuth(port: number, user: string, pass: string, timeoutMs?: number): Promise<void>;

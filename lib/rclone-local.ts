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

import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);

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
export const RCLONE_SHARE_MIN_VERSION: RcloneVersion = [1, 61, 0];

export const RCLONE_INSTALL_HINT =
  'Install rclone from https://rclone.org/install/ ' +
  '(macOS: brew install rclone; Linux: apt/dnf install rclone; Windows: winget install Rclone.Rclone).';

/** `rclone v1.75.1` → [1, 75, 1]; a missing patch is 0. Null when the text has no version. */
export function parseRcloneVersion(stdout: string): RcloneVersion | null {
  const m = stdout.match(/rclone v(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
}

/**
 * Whether `v` is at least `target`, compared component by component over the
 * components `target` names (a two-part target ignores the patch).
 */
export function isVersionAtLeast(v: RcloneVersion | null, target: readonly number[]): boolean {
  if (!v) return false;
  for (let i = 0; i < target.length; i++) {
    const a = v[i] ?? 0;
    const b = target[i]!;
    if (a !== b) return a > b;
  }
  return true;
}

export function formatVersion(v: readonly number[]): string {
  return v.join('.');
}

export async function detectRcloneVersion(rclonePath: string): Promise<RcloneVersion | null> {
  try {
    const { stdout } = await execFile(rclonePath, ['version'], { timeout: 5000 });
    return parseRcloneVersion(stdout);
  } catch {
    return null;
  }
}

export async function assertRcloneInstalled(rclonePath: string): Promise<void> {
  try {
    await execFile(rclonePath, ['version'], { timeout: 5000 });
  } catch (err) {
    void err;
    throw new Error(`rclone not found at "${rclonePath}". ${RCLONE_INSTALL_HINT}`);
  }
}

/**
 * Fail closed: rclone must run, print a version this module can parse, and be
 * at least `min`.
 */
export async function requireRcloneVersion(
  rclonePath: string,
  min: RcloneVersion = RCLONE_SHARE_MIN_VERSION,
): Promise<RcloneVersion> {
  let stdout: string;
  try {
    ({ stdout } = await execFile(rclonePath, ['version'], { timeout: 5000 }));
  } catch {
    throw new Error(`rclone not found at "${rclonePath}". ${RCLONE_INSTALL_HINT}`);
  }
  const v = parseRcloneVersion(stdout);
  if (!v) {
    throw new Error(`could not read the version of rclone at "${rclonePath}"; rclone v${formatVersion(min)} or newer is required`);
  }
  if (!isVersionAtLeast(v, min)) {
    throw new Error(`rclone v${formatVersion(v)} is too old; v${formatVersion(min)} or newer is required. ${RCLONE_INSTALL_HINT}`);
  }
  return v;
}

// ─── Child environment ───────────────────────────────────────────────────

/** The only variables a local rclone child inherits from the parent. */
export const CHILD_ENV_ALLOWLIST: readonly string[] = [
  'PATH',
  'HOME',
  'USERPROFILE',
  'SystemRoot',
  'TEMP',
  'TMP',
  'TMPDIR',
  'LANG',
];

/**
 * The environment for a local rclone child: the allowlisted variables the
 * parent has, plus exactly `extra`. Nothing else is inherited, so no other
 * `RCLONE_*` (a config path, a remote, a password) can change what the child
 * does. Returns a new object; `source` is never modified.
 */
export function buildChildEnv(
  extra: Readonly<Record<string, string>>,
  source: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of CHILD_ENV_ALLOWLIST) {
    const value = source[name];
    if (typeof value === 'string') env[name] = value;
  }
  for (const [name, value] of Object.entries(extra)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`invalid environment variable name ${JSON.stringify(name)}`);
    env[name] = value;
  }
  return env;
}

// ─── stderr lines ────────────────────────────────────────────────────────

/** Cap on what the line reader buffers: one partial line, and the kept tail. */
export const LINE_READER_CAP_BYTES = 64 * 1024;

/**
 * Splits a byte stream into lines. `\r\n` and `\n` both end a line, and a
 * chunk boundary may fall anywhere, including between `\r` and `\n`. A partial
 * line longer than the cap is cut and delivered as a line. The last lines are
 * kept (at most the cap in total) for error messages.
 */
export class BoundedLineReader {
  private partial = '';
  private readonly tailLines: string[] = [];
  private tailBytes = 0;

  constructor(
    private readonly onLine: (line: string) => void,
    private readonly capBytes = LINE_READER_CAP_BYTES,
  ) {}

  push(chunk: Buffer | string): void {
    this.partial += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    let nl: number;
    while ((nl = this.partial.indexOf('\n')) >= 0) {
      const line = this.partial.slice(0, nl).replace(/\r$/, '');
      this.partial = this.partial.slice(nl + 1);
      this.emit(line);
    }
    if (Buffer.byteLength(this.partial) > this.capBytes) {
      const cut = this.partial;
      this.partial = '';
      this.emit(cut.slice(0, this.capBytes));
    }
  }

  /** Deliver a last line that had no newline. */
  end(): void {
    if (this.partial.length > 0) {
      const line = this.partial.replace(/\r$/, '');
      this.partial = '';
      this.emit(line);
    }
  }

  /** The last lines seen, oldest first. */
  tail(): string[] {
    return [...this.tailLines];
  }

  private emit(line: string): void {
    this.tailLines.push(line);
    this.tailBytes += Buffer.byteLength(line) + 1;
    while (this.tailBytes > this.capBytes && this.tailLines.length > 1) {
      this.tailBytes -= Buffer.byteLength(this.tailLines.shift()!) + 1;
    }
    this.onLine(line);
  }
}

/**
 * The port from the line `rclone serve webdav` logs once it listens
 * (rclone v1.61.0 and later: `... WebDav Server started on [http://127.0.0.1:<port>/]`;
 * earlier releases logged the URL without brackets and are refused by version).
 * Null for any other line.
 */
export function parseWebdavReadyLine(line: string): number | null {
  const m = line.match(/WebDav Server started on \[http:\/\/127\.0\.0\.1:(\d{1,5})\/\]/);
  if (!m) return null;
  const port = Number(m[1]);
  return port > 0 && port < 65536 ? port : null;
}

// ─── Secrets ─────────────────────────────────────────────────────────────

export const SECRET_PLACEHOLDER = '[redacted]';

/** The HTTP Basic credential for `user:pass` (without the `Basic ` prefix). */
export function basicAuthValue(user: string, pass: string): string {
  return Buffer.from(`${user}:${pass}`, 'utf8').toString('base64');
}

/**
 * A function that replaces every form of the password a message could carry:
 * the password itself, its percent-encoded form, and the Basic credential
 * built from it.
 */
export function makeSecretScrubber(user: string, pass: string): (text: string) => string {
  const needles = [...new Set([
    basicAuthValue(user, pass),
    pass,
    encodeURIComponent(pass),
  ].filter((s) => s.length >= 4))].sort((a, b) => b.length - a.length);
  return (text: string) => {
    let out = text;
    for (const n of needles) out = out.split(n).join(SECRET_PLACEHOLDER);
    return out;
  };
}

// ─── Readiness ───────────────────────────────────────────────────────────

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
export function waitForWebdavReady(
  child: ReadinessChild,
  opts: { timeoutMs: number; scrub?: (text: string) => string; onLine?: (line: string) => void },
): Promise<ReadyResult> {
  const scrub = opts.scrub ?? ((s: string) => s);
  return new Promise<ReadyResult>((resolve, reject) => {
    let settled = false;
    const tailText = () => {
      const lines = reader.tail().slice(-10);
      return lines.length ? `:\n${scrub(lines.join('\n'))}` : ' (it printed nothing)';
    };
    const fail = (why: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeListener('close', onExit);
      reject(new Error(`rclone ${why}${tailText()}`));
    };
    const reader = new BoundedLineReader((line) => {
      opts.onLine?.(line);
      if (settled) return;
      const port = parseWebdavReadyLine(line);
      if (port !== null) {
        settled = true;
        clearTimeout(timer);
        child.removeListener('close', onExit);
        resolve({ port, reader });
      }
    });
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      reader.end();
      fail(`exited before it was ready (${signal ? `signal ${signal}` : `code ${code}`})`);
    };
    const timer = setTimeout(() => fail(`did not report it was ready within ${Math.round(opts.timeoutMs / 1000)} s`), opts.timeoutMs);
    if (!child.stderr) {
      fail('has no stderr to read');
      return;
    }
    child.stderr.on('data', (chunk: Buffer | string) => reader.push(chunk));
    child.stderr.on('end', () => {
      reader.end();
    });
    if (child.exitCode !== null || child.signalCode) {
      onExit(child.exitCode, child.signalCode ?? null);
      return;
    }
    // 'close', not 'exit': it comes after stderr is drained, so the error shows the last lines.
    child.once('close', onExit);
  });
}

/**
 * Check that the local WebDAV server answers 401 without credentials and 207
 * with them, so it is the server this run started and it enforces the
 * password. Throws otherwise.
 */
export async function probeWebdavAuth(port: number, user: string, pass: string, timeoutMs = 5000): Promise<void> {
  const url = `http://127.0.0.1:${port}/`;
  const propfind = async (headers: Record<string, string>): Promise<number> => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method: 'PROPFIND', headers: { depth: '0', ...headers }, signal: ctrl.signal, redirect: 'manual' });
      await res.body?.cancel().catch(() => undefined);
      return res.status;
    } finally {
      clearTimeout(t);
    }
  };
  const anonymous = await propfind({});
  if (anonymous !== 401) {
    throw new Error(`the local WebDAV server answered ${anonymous} without credentials (401 expected); refusing to share`);
  }
  const authed = await propfind({ authorization: `Basic ${basicAuthValue(user, pass)}` });
  if (authed !== 207) {
    throw new Error(`the local WebDAV server answered ${authed} with the share's credentials (207 expected)`);
  }
}

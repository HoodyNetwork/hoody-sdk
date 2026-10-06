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
import { execFile as execFileCb, spawn as spawnChild } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { basename, resolve } from 'node:path';
import { promisify } from 'node:util';
import { startShareHop } from './share-hop.js';
import { RCLONE_SHARE_MIN_VERSION, buildChildEnv, makeSecretScrubber, probeWebdavAuth, requireRcloneVersion, waitForWebdavReady, } from './rclone-local.js';
import { acquireOwnerLock, defaultLockFlavor, isSameProcessAlive, newRunToken, processStartIdentity, readOwnerToken, requestOwner, } from './share-lock.js';
import { computeShareId, deleteJournal, ensureSharesDir, findLostCreate, listJournals, sharesDir, writeJournal, } from './share-journal.js';
const execFile = promisify(execFileCb);
export const SHARE_TIMINGS = {
    readyMs: 15_000,
    repairPollMs: 30_000,
    repairVerifyMs: 20_000,
    // A laptop that froze or slept leaves its session open, and the tunnel kit
    // only notices on PONG timeouts: a PING after 30 s idle, then two missed
    // PONGs of `pong_timeout` 60 s each (hoody-tunnel src/base/connect_ws.rs:
    // 555-577, src/config.rs:49-51), ~150 s. It then parks the session for
    // `takeover_grace` 60 s (src/config.rs:53-55), and the port answers
    // ALREADY_BOUND throughout (connect_ws.rs:1488-1492). Measured live
    // 2026-10-05: ~215 s held by our own old session; 300 s leaves margin.
    portInUseMs: 300_000,
    backoffMinMs: 1000,
    backoffMaxMs: 30_000,
    killGraceMs: 5000,
    lostCreateWindowMs: 40_000,
    lostCreatePollMs: 2000,
    drainPollMs: 1000,
    settleMs: 10_000,
    cleanupWaitMs: 10_000,
};
/** How long stop waits by default for the container to upload what it holds (`--drain-timeout`). */
export const SHARE_DRAIN_TIMEOUT_MS = 300_000;
export class ShareError extends Error {
    result;
    constructor(message, result) {
        super(message);
        this.result = result;
        this.name = 'ShareError';
    }
}
export class AmbiguousShareError extends Error {
    shareName;
    choices;
    constructor(shareName, choices) {
        super(`"${shareName}" is shared to more than one container; pass --container with one of:\n` +
            choices.map((c) => `  hoody share stop ${shareName} --container ${c.containerId}   (${c.apiOrigin})`).join('\n'));
        this.shareName = shareName;
        this.choices = choices;
        this.name = 'AmbiguousShareError';
    }
}
// ─── Input rules ─────────────────────────────────────────────────────────
export const SHARE_NAME_RULE = '1-64 characters from A-Z a-z 0-9 . _ -, not "." or "..", and not starting with "-"';
/** Null when `name` follows the rules, else why not. */
export function shareNameProblem(name) {
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(name) || name === '.' || name === '..' || name.startsWith('-')) {
        return `share name ${JSON.stringify(name)} is not allowed: use ${SHARE_NAME_RULE}`;
    }
    return null;
}
function suggestName(name) {
    const s = name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+/, '').slice(0, 64);
    return s && s !== '.' && s !== '..' ? s : 'my-folder';
}
/**
 * The folder to share: it must exist and be a directory, and is returned as
 * its real path. On Linux and macOS an argument shaped like an rclone remote
 * (`name:` before any `/`) is refused, so rclone can never read it as one.
 */
export async function resolveShareDir(input, platform = process.platform) {
    if (!input)
        throw new Error('a folder to share is required');
    if (platform !== 'win32' && /^[^/]*:/.test(input)) {
        throw new Error(`${JSON.stringify(input)} looks like an rclone remote (name:path); for a local folder with a colon in its name, write ./${input}`);
    }
    let real;
    try {
        real = await fs.realpath(resolve(input));
    }
    catch {
        throw new Error(`folder ${input} does not exist`);
    }
    const st = await fs.stat(real);
    if (!st.isDirectory())
        throw new Error(`${input} is not a folder`);
    return real;
}
export function normalizeApiOrigin(apiOrigin) {
    try {
        return new URL(apiOrigin).origin;
    }
    catch {
        throw new Error(`apiOrigin must be a URL (got ${JSON.stringify(apiOrigin)})`);
    }
}
/** The argv of the local WebDAV server. The password is in the environment, never here. */
export function rcloneServeArgs(localPath, readOnly, platform = process.platform) {
    return [
        'serve', 'webdav', localPath,
        '--addr', '127.0.0.1:0',
        '--config', platform === 'win32' ? 'NUL' : '/dev/null',
        '--log-level', 'NOTICE',
        '--rc=false',
        '--links=false',
        '--copy-links=false',
        // Uncached on this side, and no listing cache: a file created here is seen
        // by the container's next lookup, never shadowed by a stale "not found".
        '--vfs-cache-mode', 'off',
        '--dir-cache-time', '0s',
        ...(readOnly ? ['--read-only'] : []),
    ];
}
/**
 * The container mount's own settings, the one place they are decided. Create,
 * the restart repair's PATCH and its check all use what this builds, and the
 * journal records it (plan v3.1):
 *   - `writes`: in-place edits work; a write is uploaded within seconds,
 *     and stop drains what is not uploaded yet (`uploads.state`);
 *   - `dir_cache_time: 0`: no stale "does not exist" view of the folder;
 *   - `timeout`/`contimeout` (s) and `low_level_retries`: while this machine
 *     is away, reads and writes fail in seconds instead of hanging.
 */
export const SHARE_VFS_CONFIG = {
    cache_mode: 'writes',
    dir_cache_time: 0,
    timeout: 10,
    contimeout: 5,
    low_level_retries: 1,
};
export function shareVfsConfig(readOnly) {
    return readOnly ? { ...SHARE_VFS_CONFIG, read_only: true } : { ...SHARE_VFS_CONFIG };
}
/** Seconds in a Go duration (`0s`, `10s`, `1m30s`, `500ms`); null when it is not one. */
function goDurationSeconds(text) {
    const units = { ns: 1e-9, us: 1e-6, 'µs': 1e-6, ms: 1e-3, s: 1, m: 60, h: 3600 };
    const re = /(\d+(?:\.\d+)?)(ns|us|µs|ms|s|m|h)/gy;
    let total = 0;
    let at = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
        total += Number(m[1]) * units[m[2]];
        at = re.lastIndex;
    }
    return at > 0 && at === text.length ? total : null;
}
/**
 * A vfs_config value in one form for comparing: numbers, numeric strings and
 * Go durations become seconds (`10`, `"10"`, `"10s"` are equal; so are `0`
 * and `"0s"`), `"true"`/`"false"` become booleans, other strings stay.
 */
export function normalizeVfsValue(v) {
    if (typeof v === 'number' || typeof v === 'boolean')
        return v;
    if (typeof v !== 'string')
        return v;
    const t = v.trim();
    if (t === 'true' || t === 'false')
        return t === 'true';
    if (/^-?\d+(\.\d+)?$/.test(t))
        return Number(t);
    return goDurationSeconds(t) ?? v;
}
function vfsValuesEqual(a, b) {
    const x = normalizeVfsValue(a);
    const y = normalizeVfsValue(b);
    if (typeof x === 'number' && typeof y === 'number')
        return Math.abs(x - y) < 1e-9;
    return x === y;
}
/**
 * Whether the kit's `vfs_config` (`got`) carries every recorded setting
 * (`want`), whatever form the kit answers each in; `read_only` must equal
 * `readOnly` (absent is false).
 */
export function vfsConfigMatches(want, got, readOnly) {
    if (!got || typeof got !== 'object')
        return false;
    const c = got;
    const ro = c.read_only === undefined || c.read_only === null ? false : normalizeVfsValue(c.read_only);
    return Object.keys(want).every((k) => k === 'read_only' || vfsValuesEqual(c[k], want[k])) && ro === readOnly;
}
/**
 * A ShareKit over fetch, for the files kit at `baseUrl`
 * (`https://<project>-<container>-files-1.<server>.containers.hoody.com`).
 * Redirects are refused, so kit credentials go only to that origin.
 */
export function fetchShareKit(baseUrl, opts = {}) {
    const base = baseUrl.replace(/\/+$/, '');
    const doFetch = opts.fetch ?? ((url, init) => fetch(url, init));
    return {
        async request(method, path, body, init) {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), init?.timeoutMs ?? opts.timeoutMs ?? 30_000);
            const outer = init?.signal;
            const onAbort = () => ctrl.abort();
            if (outer?.aborted)
                ctrl.abort();
            else
                outer?.addEventListener('abort', onAbort, { once: true });
            try {
                const res = await doFetch(`${base}${path}`, {
                    method,
                    headers: {
                        accept: 'application/json',
                        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
                        ...opts.headers,
                    },
                    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
                    redirect: 'manual',
                    signal: ctrl.signal,
                });
                const text = await res.text();
                let parsed = text;
                try {
                    parsed = text ? JSON.parse(text) : null;
                }
                catch {
                    // keep the text
                }
                return { status: res.status, body: parsed };
            }
            finally {
                clearTimeout(t);
                outer?.removeEventListener('abort', onAbort);
            }
        },
    };
}
function okStatus(r) {
    return r.status >= 200 && r.status < 300;
}
function dataOf(body) {
    if (!body || typeof body !== 'object')
        return {};
    const b = body;
    if (b.data && typeof b.data === 'object' && !Array.isArray(b.data))
        return b.data;
    return b;
}
function describeKitAnswer(r) {
    const b = r.body && typeof r.body === 'object' ? r.body : {};
    const code = typeof b.code === 'string' ? ` ${b.code}` : '';
    const msg = typeof b.error === 'string' ? b.error : typeof b.message === 'string' ? b.message : typeof r.body === 'string' ? r.body.slice(0, 200) : '';
    return `${r.status}${code}${msg ? `: ${msg}` : ''}`;
}
/** DELETE `path`; 'gone' on success or 404, otherwise what went wrong. */
async function deleteResource(kit, path) {
    try {
        const r = await kit.request('DELETE', path);
        if (okStatus(r) || r.status === 404)
            return 'gone';
        return describeKitAnswer(r);
    }
    catch (err) {
        return `no answer (${err.message})`;
    }
}
const UNKNOWN_UPLOADS = { state: 'unknown', dirty: null, openHandles: null };
function countOrNull(v) {
    return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null;
}
/** The mount's `uploads` field. Anything missing or malformed is `unknown`, never a made-up 0. */
export function parseUploads(v) {
    if (!v || typeof v !== 'object')
        return UNKNOWN_UPLOADS;
    const u = v;
    const dirty = countOrNull(u.dirty);
    const openHandles = countOrNull(u.open_handles);
    if (u.state === 'idle')
        return { state: 'idle', dirty, openHandles };
    if (u.state === 'busy')
        return { state: 'busy', dirty, openHandles };
    return { state: 'unknown', dirty, openHandles };
}
async function readUploads(kit, mountId) {
    let res;
    try {
        res = await kit.request('GET', `/api/v1/mounts/${encodeURIComponent(mountId)}`);
    }
    catch {
        return UNKNOWN_UPLOADS;
    }
    if (res.status === 404)
        return { state: 'gone', dirty: null, openHandles: null };
    if (!okStatus(res))
        return UNKNOWN_UPLOADS;
    return parseUploads(res.body?.uploads);
}
/** What a busy or unknown mount holds, for a stop without an owner. */
function undeliveredText(u) {
    if (u.state === 'unknown' && u.dirty === null) {
        return 'the container could not say how many files it holds that never reached this machine';
    }
    const files = u.dirty === null ? 'an unknown number of files' : u.dirty === 1 ? '1 file' : `${u.dirty} files`;
    const open = u.openHandles ? ` (${u.openHandles} still open there)` : '';
    return `the container holds ${files} that never reached this machine${open}`;
}
/** "3 files not yet on this machine" (with what is still open), for a mount that is not idle. */
export function pendingText(u) {
    const files = u.dirty === null ? 'an unknown number of files' : u.dirty === 1 ? '1 file' : `${u.dirty} files`;
    const open = u.openHandles ? `, ${u.openHandles} still open in the container` : '';
    return `${files} not yet on this machine${open}`;
}
// ─── Mount removal (files kit `DELETE /mounts/{id}?uploads=`) ────────────
/** The files-kit feature a share's stop needs (`GET /api/v1/version` `features`). */
export const SHARE_KIT_FEATURE = 'mount_delete_uploads';
/** The longest `wait_seconds` the files kit takes (hoody-files src/api/mount_delete.rs `MAX_WAIT_SECS`). */
const MOUNT_DELETE_MAX_WAIT_S = 600;
function waitSecondsFor(ms) {
    return Math.min(MOUNT_DELETE_MAX_WAIT_S, Math.max(1, Math.ceil(ms / 1000)));
}
/** Refuse a files kit whose mount DELETE cannot wait for, or discard, the mount's uploads. */
async function requireKitFeature(kit, containerId) {
    let res;
    try {
        res = await kit.request('GET', '/api/v1/version');
    }
    catch (err) {
        throw new Error(`could not reach the files kit of container ${containerId}: ${err.message}`);
    }
    const features = okStatus(res) ? dataOf(res.body).features : undefined;
    if (!Array.isArray(features) || !features.includes(SHARE_KIT_FEATURE)) {
        throw new Error(okStatus(res)
            ? `the files kit of container ${containerId} is too old for hoody share: its mount DELETE cannot wait for the mount's uploads. Update the container's files kit, then share again`
            : `could not read the version of the files kit of container ${containerId}: ${describeKitAnswer(res)}`);
    }
}
function removeMount(kit, mountId, mode, signal) {
    return deleteWithUploads(kit, `/api/v1/mounts/${encodeURIComponent(mountId)}`, mode, signal);
}
/**
 * DELETE a mount with `?uploads=discard`. The discard is by id, so a mount
 * already gone still has what it left discarded: a 404 is a kit too old for
 * that, never a mount found gone.
 */
async function discardMount(kit, mountId, j) {
    const r = await removeMount(kit, mountId, { uploads: 'discard' });
    return r.outcome === 'gone' ? { outcome: 'failed', why: kitTooOldText(j) } : r;
}
/** A discard answered 404: the files kit cannot discard by id what a removed mount or backend left. */
function kitTooOldText(j) {
    return `the files kit of container ${j.target.containerId} is too old to discard what a removed mount or backend left; update it, then run \`hoody share stop ${j.name} --force\` again`;
}
/**
 * DELETE a backend with `?uploads=discard`: the kit stops and drops every
 * generation of it, the ones still retiring from mounts already deleted too.
 */
function discardBackend(kit, backendId) {
    return deleteWithUploads(kit, `/api/v1/backends/${encodeURIComponent(backendId)}`, { uploads: 'discard' });
}
async function deleteWithUploads(kit, path, mode, signal) {
    const query = mode.uploads === 'wait' ? `uploads=wait&wait_seconds=${mode.waitSeconds}` : 'uploads=discard';
    let res;
    try {
        res = await kit.request('DELETE', `${path}?${query}`, undefined, {
            ...(signal ? { signal } : {}),
            // The kit answers once the wait is over; the transport waits that long, and a margin.
            ...(mode.uploads === 'wait' ? { timeoutMs: mode.waitSeconds * 1000 + 30_000 } : {}),
        });
    }
    catch (err) {
        return { outcome: 'failed', why: signal?.aborted ? 'the wait for its uploads was cut short' : `no answer (${err.message})` };
    }
    if (res.status === 404)
        return { outcome: 'gone' };
    if (!okStatus(res))
        return { outcome: 'failed', why: describeKitAnswer(res) };
    const body = res.body;
    const raw = body?.uploads ?? dataOf(body).uploads;
    const u = raw && typeof raw === 'object' ? raw : {};
    if (u.delivered === true)
        return { outcome: 'delivered' };
    if (mode.uploads === 'discard') {
        const removed = dataOf(body).removed ?? body?.removed;
        return { outcome: 'discarded', discarded: countOrNull(u.discarded), removed: typeof removed === 'boolean' ? removed : null };
    }
    // Gone, and not confirmed: what it held is not known to be here.
    const dirty = countOrNull(u.dirty);
    const openHandles = countOrNull(u.open_handles);
    return { outcome: 'undelivered', view: { state: u.delivered === false ? 'busy' : 'unknown', dirty, openHandles } };
}
function filesText(n) {
    return n === 1 ? '1 file' : `${n} files`;
}
/** Why a backend's discard did not finish, for a leftover. */
function backendDiscardFailure(r, j) {
    if (r.outcome === 'failed')
        return r.why;
    // The kit's discard finds what a backend left even once it is gone: a 404 is a kit without it.
    if (r.outcome === 'gone')
        return kitTooOldText(j);
    return 'the files kit could not confirm it discarded everything the container had not sent here';
}
/**
 * A backend discard the kit confirmed in full: a count, not `null`, and the
 * backend removed. On `null` the kit keeps the backend, and a retry discards
 * it again. A 404 confirms nothing.
 */
function discardConfirmed(r) {
    return r.outcome === 'discarded' && r.discarded !== null && r.removed === true;
}
/** For a refusal: a removed mount whose writes were never confirmed delivered (journal `undelivered`). */
const RETIRED_UNDELIVERED_TEXT = 'a mount of the share was removed before the container confirmed it had sent everything, so it may still hold writes that never reached this machine';
// ─── Processes ───────────────────────────────────────────────────────────
async function waitProcessGone(pid, identity, ms) {
    const deadline = Date.now() + ms;
    for (;;) {
        if (!(await isSameProcessAlive(pid, identity)))
            return true;
        if (Date.now() >= deadline)
            return false;
        await new Promise((r) => setTimeout(r, 100));
    }
}
function signalGroup(pid, signal) {
    try {
        process.kill(-pid, signal);
    }
    catch {
        try {
            process.kill(pid, signal);
        }
        catch {
            // gone
        }
    }
}
/**
 * Stop a recorded child (and its process group) only while `pid` still names
 * the process with start identity `identity`: a pid reused by another process
 * is never signalled. Unix: SIGTERM to the group, SIGKILL after `graceMs`.
 * Windows: `taskkill /T /F` on the verified pid.
 */
export async function killRecordedChild(pid, identity, opts = {}) {
    const current = await processStartIdentity(pid);
    if (current === null)
        return 'gone';
    if (!identity || current !== identity)
        return 'identity-mismatch';
    const graceMs = opts.graceMs ?? SHARE_TIMINGS.killGraceMs;
    if (process.platform === 'win32') {
        await execFile('taskkill', ['/T', '/F', '/PID', String(pid)], { timeout: 10_000 }).catch(() => undefined);
        await waitProcessGone(pid, identity, graceMs);
        return 'killed';
    }
    signalGroup(pid, 'SIGTERM');
    if (await waitProcessGone(pid, identity, graceMs))
        return 'killed';
    if (!(await isSameProcessAlive(pid, identity)))
        return 'killed';
    signalGroup(pid, 'SIGKILL');
    await waitProcessGone(pid, identity, 2000);
    return 'killed';
}
// ─── Defaults ────────────────────────────────────────────────────────────
function abortableSleep(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new Error('aborted'));
            return;
        }
        const onAbort = () => {
            clearTimeout(t);
            reject(new Error('aborted'));
        };
        const t = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}
const defaultDeps = {
    async expose(opts) {
        const { expose } = await import('./tunnel-client.js');
        return expose({
            url: opts.url,
            ...(opts.kitAuth ? { kitAuth: opts.kitAuth } : {}),
            containerPort: opts.containerPort,
            to: opts.to,
        });
    },
    async resume(opts) {
        const { resumeExpose } = await import('./tunnel-client.js');
        const r = await resumeExpose({
            url: opts.url,
            ...(opts.kitAuth ? { kitAuth: opts.kitAuth } : {}),
            sessionId: opts.sessionId,
            to: opts.to,
        });
        return r ? { session: r.session, resumedBinds: r.hello.resumedBinds, close: () => r.close() } : null;
    },
    spawn: (command, args, options) => spawnChild(command, args, options),
    requireVersion: (rclonePath) => requireRcloneVersion(rclonePath, RCLONE_SHARE_MIN_VERSION),
    probe: (port, user, pass) => probeWebdavAuth(port, user, pass),
    startHop: (upstreamPort, now) => startShareHop(upstreamPort, { now }),
    sleep: abortableSleep,
    now: () => Date.now(),
};
/** The files kit's errors for a restored mount (hoody-files `server.rs`). */
export const BACKEND_UNAVAILABLE = 'backend unavailable';
export const OWN_SETTINGS_NOT_STARTED = 'the mount has settings of its own and was not started after the restart; update it to start it';
/** Bind answers for a container port that is still bound (`BIND_ERR: <code> — …`). */
const PORT_HELD = /\b(PORT_IN_USE|ALREADY_BOUND)\b/;
class StopRequested extends Error {
    constructor() {
        super('stop requested');
    }
}
class ShareOwner {
    ctx;
    state = 'starting';
    gen = 0;
    /** Aborted when serving ends (and on a forced stop); a stop's drain gets a fresh one. */
    timers = new AbortController();
    inflight = new Set();
    finalizing = null;
    result = null;
    stopReason = '';
    stopKind = 'requested';
    child = null;
    childClosed = Promise.resolve();
    childGone = false;
    stderr = null;
    /** The hop's port: what the tunnel forwards to. */
    localPort = 0;
    hop = null;
    /** During a stop: keep the tunnel (reconnecting if it drops) while the container drains. */
    serveWhileStopping = false;
    forced = false;
    /** `hoody share stop --force`: the mount's DELETE discards what the container has not sent. */
    discard = false;
    tunnel = null;
    /** The current (or last dropped) session's id and our bind's id, for a resume. */
    resumeId = null;
    bindId;
    tunnelLostWhileStarting = false;
    deliberate = new WeakSet();
    waiters = [];
    repairTimer = null;
    lastReport = '';
    crashed = false;
    resolveDone;
    done;
    scrub;
    constructor(ctx) {
        this.ctx = ctx;
        this.scrub = makeSecretScrubber(ctx.user, ctx.pass);
        this.done = new Promise((r) => {
            this.resolveDone = r;
        });
    }
    get j() {
        return this.ctx.journal;
    }
    setState(s) {
        this.state = s;
        this.gen++;
    }
    emit(level, message) {
        const text = this.scrub(message);
        try {
            this.ctx.opts.onEvent?.({ level, message: text });
        }
        catch {
            // a listener's error is not the share's
        }
        // A `hoody share stop` from another terminal sees the stop's progress too.
        if (this.state === 'stopping') {
            for (const w of this.waiters)
                w.send({ type: 'progress', message: text });
        }
    }
    report(message) {
        if (message === this.lastReport)
            return;
        this.lastReport = message;
        this.emit('warn', message);
    }
    async save() {
        await writeJournal(this.ctx.dir, this.j);
        const hook = this.ctx.deps.afterJournalWrite;
        if (hook) {
            const crash = async () => {
                this.crashed = true;
                await this.ctx.lock.release();
            };
            await hook(JSON.parse(JSON.stringify(this.j)), crash);
        }
    }
    /** Run `p` as an in-flight mutation: the finalizer waits for it before it reads what to delete. */
    track(p) {
        this.inflight.add(p);
        const done = () => {
            this.inflight.delete(p);
        };
        p.then(done, done);
        return p;
    }
    backendBody() {
        return { url: this.j.publicUrl, user: this.ctx.user, pass: this.ctx.pass, vendor: 'other' };
    }
    async run() {
        try {
            await this.save();
        }
        catch (err) {
            await this.ctx.lock.release();
            throw err;
        }
        this.ctx.lock.setHandler((req, conn) => this.onChannel(req, conn));
        const signal = this.ctx.opts.signal;
        if (signal) {
            if (signal.aborted)
                void this.stop('interrupted', 'interrupted');
            else
                signal.addEventListener('abort', () => void this.stop('interrupted', 'interrupted'), { once: true });
        }
        const forceSignal = this.ctx.opts.forceSignal;
        if (forceSignal) {
            if (forceSignal.aborted)
                this.force();
            else
                forceSignal.addEventListener('abort', () => this.force(), { once: true });
        }
        try {
            await this.start();
        }
        catch (err) {
            const stoppedBy = err instanceof StopRequested;
            if (!stoppedBy)
                void this.stop(this.scrub(err.message), 'start-failed');
            const result = await this.finalizing;
            const why = stoppedBy ? `the share stopped before it was ready (${result.reason})` : this.scrub(err.message);
            const tail = result.ok ? '' : `\ncleanup is pending: ${result.leftovers.join('; ')}; run \`hoody share stop ${this.j.name}\``;
            throw new ShareError(why + tail, result);
        }
        return {
            id: this.j.id,
            name: this.j.name,
            containerId: this.j.target.containerId,
            localPath: this.j.localPath,
            mountPath: this.j.mountPath,
            publicUrl: this.j.publicUrl,
            readOnly: this.j.readOnly,
            state: () => this.state,
            stop: (reason, stopOpts) => {
                const p = this.stop(reason ?? 'stopped', 'requested');
                if (stopOpts?.force)
                    this.force();
                return p;
            },
            done: this.done,
        };
    }
    async start() {
        const { opts, deps, timings } = this.ctx;
        const g = this.gen;
        const check = () => {
            if (this.gen !== g || this.state !== 'starting')
                throw new StopRequested();
        };
        const rclonePath = opts.rclonePath ?? 'rclone';
        await deps.requireVersion(rclonePath);
        check();
        // Before anything is made: a kit whose mount DELETE cannot wait for the uploads could not be stopped safely.
        await requireKitFeature(opts.kit, this.j.target.containerId);
        check();
        // Its own process group (detached), so a terminal Ctrl+C reaches only the owner.
        const child = deps.spawn(rclonePath, rcloneServeArgs(this.j.localPath, this.j.readOnly), {
            detached: true,
            stdio: ['ignore', 'ignore', 'pipe'],
            env: buildChildEnv({ RCLONE_USER: this.ctx.user, RCLONE_PASS: this.ctx.pass }),
            windowsHide: true,
        });
        this.child = child;
        let spawnError = null;
        child.on('error', (err) => {
            spawnError = err;
        });
        this.childClosed = new Promise((r) => child.once('close', () => r()));
        child.once('close', (code, sig) => this.onChildClosed(code, sig));
        if (!child.pid) {
            await this.childClosed;
            throw new Error(`could not start rclone: ${spawnError?.message ?? 'no pid'}`);
        }
        const ready = waitForWebdavReady(child, { timeoutMs: timings.readyMs, scrub: this.scrub });
        ready.catch(() => undefined);
        const readyDeadline = deps.now() + timings.readyMs;
        this.j.child = { pid: child.pid, start: await processStartIdentity(child.pid) };
        this.j.stage = 'rclone-started';
        await this.save();
        check();
        const { port, reader } = await ready;
        this.stderr = reader;
        check();
        // The tunnel and the probe both go through the hop, so the probe checks the path the container uses.
        const hop = await deps.startHop(port, deps.now);
        if (this.gen !== g || this.state !== 'starting') {
            // The stop ran while the hop was starting, and did not see it.
            await hop.close().catch(() => undefined);
            throw new StopRequested();
        }
        this.hop = hop;
        this.localPort = hop.port;
        const left = Math.max(1000, readyDeadline - deps.now());
        await Promise.race([
            deps.probe(this.localPort, this.ctx.user, this.ctx.pass),
            new Promise((_, rej) => setTimeout(() => rej(new Error('the local WebDAV server did not answer the probe in time')), left).unref()),
        ]);
        check();
        this.j.stage = 'exposing';
        await this.save();
        check();
        const tunnel = await this.exposeOnce(0, () => this.gen === g && this.state === 'starting');
        if (!tunnel.publicUrl) {
            this.closeTunnel(tunnel);
            throw new Error('the tunnel kit gave no public URL for the share, and none follows from its address: it is not a `<project>-<container>-tunnel-<n>.<server>.<domain>` host');
        }
        this.watchTunnel(tunnel);
        this.j.publicUrl = tunnel.publicUrl;
        this.j.containerPort = tunnel.bind.containerPort;
        this.j.user = this.ctx.user;
        this.j.stage = 'exposed';
        await this.save();
        check();
        this.j.stage = 'backend-creating';
        this.j.pendingCreate = 'backend';
        await this.save();
        check();
        await this.track(this.createBackend());
        check();
        this.j.stage = 'mount-creating';
        this.j.pendingCreate = 'mount';
        await this.save();
        check();
        await this.track(this.createMount());
        check();
        this.j.stage = 'serving';
        await this.save();
        check();
        this.setState('serving');
        this.scheduleRepair();
        if (this.tunnelLostWhileStarting)
            this.beginReconnect();
    }
    /** Lost answers (no answer, or a 5xx a proxy may give while the kit goes on) are looked up. */
    async createBackend() {
        const { opts, timings, deps } = this.ctx;
        let res = null;
        try {
            res = await opts.kit.request('POST', '/api/v1/backends/webdav', this.backendBody());
        }
        catch {
            res = null;
        }
        if (res && res.status < 500) {
            const id = dataOf(res.body).id;
            if (okStatus(res) && typeof id === 'string') {
                this.j.backendId = id;
                delete this.j.pendingCreate;
                this.j.stage = 'backend-created';
                await this.save();
                return;
            }
            delete this.j.pendingCreate;
            await this.save();
            throw new Error(`the files kit refused the share's backend: ${describeKitAnswer(res)}`);
        }
        const found = await findLostCreate(opts.kit, this.j, {
            windowMs: timings.lostCreateWindowMs,
            pollMs: timings.lostCreatePollMs,
            now: deps.now,
        });
        if (!found.backendId) {
            delete this.j.pendingCreate;
            await this.save();
            throw new Error(`creating the share's backend got ${res ? describeKitAnswer(res) : 'no answer'}, and it was not created`);
        }
        this.j.backendId = found.backendId;
        delete this.j.pendingCreate;
        this.j.stage = 'backend-created';
        await this.save();
    }
    async createMount() {
        const { opts, timings, deps } = this.ctx;
        const body = {
            backend_id: this.j.backendId,
            label: `hoody-share:${this.j.name}`,
            mount_path: this.j.requestedMountPath,
            vfs_config: this.j.vfsConfig,
        };
        let res = null;
        try {
            res = await opts.kit.request('POST', '/api/v1/mounts', body);
        }
        catch {
            res = null;
        }
        if (res && res.status < 500) {
            const data = dataOf(res.body);
            if (okStatus(res) && typeof data.id === 'string') {
                this.j.mountId = data.id;
                this.j.mountPath = typeof data.mount_path === 'string' ? data.mount_path : this.j.requestedMountPath;
                delete this.j.pendingCreate;
                await this.save();
                return;
            }
            delete this.j.pendingCreate;
            await this.save();
            const taken = res.status === 409 ? ` (is something already mounted at "${this.j.requestedMountPath}"? pick another --name)` : '';
            throw new Error(`the files kit refused the share's mount: ${describeKitAnswer(res)}${taken}`);
        }
        const found = await findLostCreate(opts.kit, this.j, {
            windowMs: timings.lostCreateWindowMs,
            pollMs: timings.lostCreatePollMs,
            now: deps.now,
        });
        if (!found.mountId) {
            delete this.j.pendingCreate;
            await this.save();
            throw new Error(`creating the share's mount got ${res ? describeKitAnswer(res) : 'no answer'}, and it was not created`);
        }
        this.j.mountId = found.mountId;
        delete this.j.pendingCreate;
        const got = await opts.kit.request('GET', `/api/v1/mounts/${encodeURIComponent(found.mountId)}`).catch(() => null);
        const path = got && okStatus(got) ? got.body?.mount_path : undefined;
        this.j.mountPath = typeof path === 'string' ? path : this.j.requestedMountPath;
        await this.save();
    }
    /** `expose()` without takeover. A tunnel that arrives once `live()` is false is closed. */
    async exposeOnce(containerPort, live) {
        const { opts, deps } = this.ctx;
        const tunnel = await deps.expose({
            url: opts.tunnelUrl,
            ...(opts.kitAuth ? { kitAuth: opts.kitAuth } : {}),
            containerPort,
            to: { host: '127.0.0.1', port: this.localPort },
        });
        if (!live()) {
            this.closeTunnel(tunnel);
            throw new StopRequested();
        }
        return tunnel;
    }
    /**
     * One resume of the dropped session. `refused`: HELLO_OK without resuming.
     * The kit resumes only a parked session, and answers the same for one it
     * has not yet noticed is dead (a silent drop, see `portInUseMs`) as for one
     * it never had (hoody-tunnel src/session/handshake.rs:73-83), so the id is
     * asked again every tick until a fresh bind replaces it. `gone`: resumed,
     * but our binding changed hands (do not ask again). `failed`: no HELLO_OK
     * (unreachable, or the grace ran out mid-handshake). In each case the
     * fresh bind decides.
     */
    async resumeOnce(live) {
        const { opts, deps } = this.ctx;
        let resumed;
        try {
            resumed = await deps.resume({
                url: opts.tunnelUrl,
                ...(opts.kitAuth ? { kitAuth: opts.kitAuth } : {}),
                sessionId: this.resumeId,
                to: { host: '127.0.0.1', port: this.localPort },
            });
        }
        catch {
            return 'failed';
        }
        if (!resumed)
            return 'refused';
        const port = this.j.containerPort;
        const ours = resumed.resumedBinds.find((b) => b.containerPort === port && b.mode === 'expose' && (this.bindId === undefined || b.bindId === this.bindId));
        // The binding is the one BIND_OK gave the recorded URL for: same port, same
        // bind id. HELLO_OK names no URL, so the recorded one is kept, never re-derived.
        const r = resumed;
        const tunnel = {
            publicUrl: this.j.publicUrl,
            bind: { containerPort: port, ...(ours ? { bindId: ours.bindId } : {}) },
            session: r.session,
            close: () => r.close(),
        };
        if (!live()) {
            this.closeTunnel(tunnel);
            throw new StopRequested();
        }
        if (!ours) {
            this.resumeId = null;
            this.closeTunnel(tunnel);
            return 'gone';
        }
        return tunnel;
    }
    closeTunnel(tunnel) {
        this.deliberate.add(tunnel);
        if (this.tunnel === tunnel)
            this.tunnel = null;
        return tunnel.close().catch(() => undefined);
    }
    watchTunnel(tunnel) {
        this.tunnel = tunnel;
        // Read now: the session forgets its id once it closes, and a reconnect resumes by it.
        if (tunnel.session.id)
            this.resumeId = tunnel.session.id;
        if (tunnel.bind.bindId !== undefined)
            this.bindId = tunnel.bind.bindId;
        // onClose listeners fire once per session; every new session registers again.
        tunnel.session.onClose(() => this.onTunnelClosed(tunnel));
    }
    onTunnelClosed(tunnel) {
        if (this.deliberate.has(tunnel) || this.tunnel !== tunnel)
            return;
        this.tunnel = null;
        if (this.state === 'starting') {
            this.tunnelLostWhileStarting = true;
            return;
        }
        if (this.state === 'serving')
            this.beginReconnect();
        else if (this.state === 'stopping' && this.serveWhileStopping)
            this.beginDrainReconnect();
    }
    beginReconnect() {
        this.setState('reconnecting');
        this.emit('warn', 'the tunnel dropped; reconnecting (reads and writes in the container fail with an I/O error until it is back)');
        void this.reconnectLoop('serving');
    }
    /** While a stop drains, the tunnel is reconnected without leaving `stopping`. */
    beginDrainReconnect() {
        this.emit('warn', 'the tunnel dropped while the container was still sending; reconnecting');
        void this.reconnectLoop('draining');
    }
    async reconnectLoop(mode) {
        const { deps, timings } = this.ctx;
        const g = this.gen;
        const live = mode === 'serving'
            ? () => this.gen === g && this.state === 'reconnecting'
            : () => this.gen === g && this.state === 'stopping' && this.serveWhileStopping && !this.tunnel;
        const port = this.j.containerPort;
        let heldSince = null;
        let delay = timings.backoffMinMs;
        for (;;) {
            if (!live())
                return;
            let tunnel = null;
            let resumed = false;
            let error = '';
            try {
                // First reclaim the dropped session (the kit parks it, bindings and
                // all, for its takeover grace); otherwise bind afresh, never with takeover.
                if (this.resumeId) {
                    const r = await this.resumeOnce(live);
                    if (typeof r !== 'string') {
                        tunnel = r;
                        resumed = true;
                    }
                }
                tunnel ??= await this.exposeOnce(port, live);
            }
            catch (err) {
                if (err instanceof StopRequested)
                    return;
                error = err.message ?? String(err);
            }
            if (tunnel) {
                if (tunnel.publicUrl !== this.j.publicUrl) {
                    this.closeTunnel(tunnel);
                    const why = `conflict: the tunnel came back on another URL (${tunnel.publicUrl ?? 'none'})`;
                    if (mode === 'serving')
                        void this.stop(why, 'conflict');
                    else
                        this.emit('warn', why);
                    return;
                }
                this.watchTunnel(tunnel);
                if (mode === 'serving')
                    this.setState('serving');
                this.emit('info', resumed ? 'the tunnel is back (session resumed)' : 'the tunnel is back');
                return;
            }
            if (PORT_HELD.test(error))
                heldSince ??= deps.now();
            if (heldSince !== null && PORT_HELD.test(error) && deps.now() - heldSince >= timings.portInUseMs) {
                const why = `conflict: container port ${port} has been held by another tunnel binding for ${Math.round(timings.portInUseMs / 1000)} s; the share does not evict it`;
                if (mode === 'serving')
                    void this.stop(why, 'conflict');
                else
                    this.emit('warn', why);
                return;
            }
            try {
                await deps.sleep(delay, this.timers.signal);
            }
            catch {
                return;
            }
            delay = Math.min(delay * 2, timings.backoffMaxMs);
        }
    }
    scheduleRepair() {
        const { timings } = this.ctx;
        const tick = async () => {
            this.repairTimer = null;
            if (this.state !== 'serving' && this.state !== 'reconnecting')
                return;
            if (this.state === 'serving')
                await this.track(this.repairOnce()).catch(() => undefined);
            if (this.state === 'serving' || this.state === 'reconnecting') {
                this.repairTimer = setTimeout(() => void tick(), timings.repairPollMs);
            }
        };
        this.repairTimer = setTimeout(() => void tick(), timings.repairPollMs);
    }
    vfsMatches(v) {
        return vfsConfigMatches(this.j.vfsConfig, v, this.j.readOnly);
    }
    /**
     * One restart check. After a files-kit or container restart the mount comes
     * back as a placeholder with one of two errors, and only those two are
     * repaired: `backend unavailable` (re-post the same backend, then PATCH) and
     * the own-settings error (PATCH with the recorded vfs_config). Anything
     * else is reported and left alone; nothing is deleted as a repair.
     */
    async repairOnce() {
        const { opts, deps, timings } = this.ctx;
        const g = this.gen;
        const live = () => this.gen === g && this.state === 'serving';
        const mountUrl = `/api/v1/mounts/${encodeURIComponent(this.j.mountId)}`;
        let res;
        try {
            res = await opts.kit.request('GET', mountUrl);
        }
        catch {
            return;
        }
        if (!live())
            return;
        if (res.status === 404) {
            this.report(`the container mount ${this.j.mountPath} was removed by someone else; stop this share with Ctrl+C`);
            return;
        }
        if (!okStatus(res))
            return;
        const mount = (res.body ?? {});
        if (mount.status !== 'error') {
            this.lastReport = '';
            return;
        }
        if (mount.error === BACKEND_UNAVAILABLE) {
            this.emit('info', 'the files kit restarted; connecting the share again');
            let posted;
            try {
                posted = await opts.kit.request('POST', '/api/v1/backends/webdav', this.backendBody());
            }
            catch (err) {
                this.report(`reconnecting the share's backend got no answer: ${err.message}`);
                return;
            }
            if (!live())
                return;
            if (!okStatus(posted) || dataOf(posted.body).id !== this.j.backendId) {
                this.report(`reconnecting the share's backend failed: ${describeKitAnswer(posted)}`);
                return;
            }
        }
        else if (mount.error !== OWN_SETTINGS_NOT_STARTED) {
            this.report(`the container mount reports an error: ${String(mount.error ?? mount.status_message ?? 'unknown')}`);
            return;
        }
        else {
            this.emit('info', 'the files kit restarted; starting the share\'s mount again');
        }
        let patched;
        try {
            patched = await opts.kit.request('PATCH', mountUrl, { vfs_config: this.j.vfsConfig });
        }
        catch (err) {
            this.report(`restarting the container mount got no answer: ${err.message}`);
            return;
        }
        if (!live())
            return;
        if (!okStatus(patched)) {
            this.report(`restarting the container mount failed: ${describeKitAnswer(patched)}`);
            return;
        }
        const deadline = deps.now() + timings.repairVerifyMs;
        for (;;) {
            let got = null;
            try {
                got = await opts.kit.request('GET', mountUrl);
            }
            catch {
                got = null;
            }
            if (!live())
                return;
            const m = got && okStatus(got) ? (got.body ?? {}) : null;
            if (m && m.status === 'active' && m.mount_path === this.j.mountPath && this.vfsMatches(m.vfs_config)) {
                this.lastReport = '';
                this.emit('info', 'the share works again');
                return;
            }
            if (deps.now() >= deadline) {
                this.report(`the container mount did not come back as it was: ${m ? `${String(m.status)} ${String(m.error ?? '')}`.trim() : 'no answer'}`);
                return;
            }
            try {
                await deps.sleep(1000, this.timers.signal);
            }
            catch {
                return;
            }
        }
    }
    onChildClosed(code, signal) {
        this.childGone = true;
        if (this.crashed)
            return;
        // Before its ready line, start() is waiting on readiness, which fails with
        // rclone's own (scrubbed) last lines; that is the error to show.
        if (this.state === 'starting' && !this.stderr)
            return;
        if (this.state === 'starting' || this.state === 'serving' || this.state === 'reconnecting') {
            const lines = this.stderr?.tail().slice(-5).join('\n');
            void this.stop(`rclone exited (${signal ? `signal ${signal}` : `code ${code}`})${lines ? `:\n${this.scrub(lines)}` : ''}`, 'child-exited');
        }
    }
    onChannel(req, conn) {
        if (req.op === 'status') {
            conn.send({
                type: 'result',
                ok: true,
                state: this.state,
                name: this.j.name,
                containerId: this.j.target.containerId,
                mountPath: this.j.mountPath ?? null,
                publicUrl: this.j.publicUrl ?? null,
            });
            conn.end();
            return;
        }
        if (this.result) {
            conn.send({ type: 'result', ...this.result });
            conn.end();
            return;
        }
        conn.send({ type: 'progress', message: `stopping ${this.j.name}` });
        this.waiters.push(conn);
        void this.stop('stop requested from another terminal', 'requested');
        if (req.force) {
            this.discard = true;
            this.force();
        }
    }
    stop(reason, kind) {
        // A simulated crash (afterJournalWrite) runs nothing more, like a dead process.
        if (this.crashed)
            return new Promise(() => undefined);
        if (!this.finalizing) {
            this.stopReason = reason;
            this.stopKind = kind;
            this.finalizing = this.finalize();
        }
        return this.finalizing;
    }
    /** A second Ctrl+C: the stop no longer waits for the container. Starts a stop if none runs. */
    force() {
        if (this.crashed)
            return;
        this.forced = true;
        this.timers.abort();
        if (!this.finalizing)
            void this.stop('interrupted', 'interrupted');
    }
    /**
     * Stop step 1 (plan v3.1): poll the mount, still serving, until its
     * `uploads.state` is `idle` on two polls `drainPollMs` apart. Bounded by the
     * drain timeout and a forced stop. When this machine cannot serve (rclone
     * exited, or the tunnel conflicts) the container cannot deliver anything,
     * so it only looks (two polls) and does not wait.
     */
    async drain(canServe) {
        const { opts, deps, timings } = this.ctx;
        const timeoutMs = opts.drainTimeoutMs ?? SHARE_DRAIN_TIMEOUT_MS;
        let deadline = deps.now() + (canServe ? timeoutMs : timings.drainPollMs);
        let idleSeen = 0;
        let shown = '';
        for (;;) {
            const view = await readUploads(opts.kit, this.j.mountId);
            if (view.state === 'gone')
                return { ...view, confirmed: true, deadline };
            if (view.state === 'idle') {
                idleSeen++;
                if (idleSeen >= 2)
                    return { ...view, confirmed: true, deadline };
            }
            else {
                idleSeen = 0;
                const line = pendingText(view);
                if (line !== shown) {
                    shown = line;
                    this.emit('info', `waiting for ${line} (up to ${Math.max(0, Math.ceil((deadline - deps.now()) / 1000))} s more)`);
                }
            }
            if (canServe && this.childGone) {
                canServe = false;
                deadline = Math.min(deadline, deps.now() + timings.drainPollMs);
            }
            if (this.forced || deps.now() >= deadline)
                return { ...view, confirmed: false, deadline };
            try {
                await deps.sleep(timings.drainPollMs, this.timers.signal);
            }
            catch {
                return { ...view, confirmed: false, deadline };
            }
        }
    }
    /**
     * After `delivered`: the container holds nothing more, so this only lets
     * the hop finish what it is serving (a read, a listing), at most `settleMs`.
     * Delivery never rests on it.
     */
    async settleHop() {
        const { deps, timings } = this.ctx;
        const hop = this.hop;
        if (!hop)
            return;
        const until = deps.now() + timings.settleMs;
        while (hop.inFlight() > 0 && deps.now() < until && !this.forced && !this.childGone) {
            try {
                await deps.sleep(timings.drainPollMs, this.timers.signal);
            }
            catch {
                return;
            }
        }
    }
    /**
     * DELETE the mount once the journal says what it held may be undelivered:
     * the kit removes the mount before it answers, and an answer lost to a
     * crash or Ctrl+C must not read as delivered on the next stop. Only
     * `delivered`, or a confirmed discard of the backend, clears it.
     */
    async removeMountRecorded(mountId, mode, signal) {
        this.j.undelivered = true;
        try {
            await this.save();
        }
        catch (err) {
            return { outcome: 'failed', why: `not removed: the journal could not record it first (${err.message})` };
        }
        return mode.uploads === 'discard' ? discardMount(this.ctx.opts.kit, mountId, this.j) : removeMount(this.ctx.opts.kit, mountId, mode, signal);
    }
    /** The one finalizer. */
    async finalize() {
        const { opts, timings, deps, dir, lock } = this.ctx;
        await Promise.resolve();
        // 1. stopping: no new step starts; the serving timers and reconnects end.
        // The drain below gets timers of its own.
        this.setState('stopping');
        this.timers.abort();
        this.timers = new AbortController();
        if (this.forced)
            this.timers.abort();
        if (this.repairTimer)
            clearTimeout(this.repairTimer);
        this.emit('info', `stopping: ${this.stopReason.split('\n')[0]}`);
        const leftovers = [];
        this.j.stage = 'stopping';
        await this.save().catch(() => undefined);
        // An HTTP step in flight decides what exists; wait for it to land in the journal.
        while (this.inflight.size > 0)
            await Promise.allSettled([...this.inflight]);
        if (this.j.pendingCreate) {
            try {
                const found = await findLostCreate(opts.kit, this.j, {
                    windowMs: timings.lostCreateWindowMs,
                    pollMs: timings.lostCreatePollMs,
                    now: deps.now,
                });
                if (found.backendId)
                    this.j.backendId = found.backendId;
                if (found.mountId)
                    this.j.mountId = found.mountId;
                delete this.j.pendingCreate;
            }
            catch (err) {
                leftovers.push(`a ${this.j.pendingCreate} whose create answer was lost: ${err.message}`);
            }
            await this.save().catch(() => undefined);
        }
        // 2. drain, then DELETE the mount with `?uploads=wait`, still serving:
        // the kit answers `delivered` once the mount holds no open file and
        // nothing unsent. Anything else keeps the backend and the journal.
        let drained = true;
        let discarded = false;
        // Why the backend stays (null: it goes). A mount whose create answer was
        // lost may exist: deleting its backend would delete it too, unchecked.
        let backendKept = this.j.pendingCreate === 'mount' ? 'kept: a mount whose create answer was lost may still use it' : null;
        if (backendKept)
            drained = false;
        // Without --force, why the backend stays for a mount removed undelivered.
        let undeliveredKept = null;
        if (this.j.mountId) {
            const mountId = this.j.mountId;
            const where = `mount ${mountId} (${this.j.mountPath ?? this.j.requestedMountPath})`;
            const canServe = !this.childGone && this.hop !== null && this.j.containerPort !== undefined && this.stopKind !== 'conflict';
            this.serveWhileStopping = canServe;
            if (canServe && !this.tunnel)
                this.beginDrainReconnect();
            let removal = null;
            if (!this.discard) {
                const view = await this.drain(canServe);
                if (view.state === 'gone') {
                    removal = { outcome: 'gone' };
                }
                else if (view.confirmed) {
                    const waitSeconds = waitSecondsFor(view.deadline - deps.now());
                    this.emit('info', `removing the mount once the container has sent what it still holds (up to ${waitSeconds} s)`);
                    removal = await this.removeMountRecorded(mountId, { uploads: 'wait', waitSeconds }, this.timers.signal);
                }
                else if (!this.discard) {
                    // What the container still holds stays there with its mount:
                    // deleting it now would drop writes this machine has not got.
                    const held = view.state === 'idle' ? 'writes the container has not confirmed it sent' : pendingText(view);
                    this.emit('warn', `stopping with ${held}; they stay in the container (\`hoody share stop ${this.j.name} --force\` discards them)`);
                    leftovers.push(`${where} is kept: it holds ${held}`);
                    backendKept = 'kept for the mount';
                    drained = false;
                }
            }
            if (this.discard && (removal === null || removal.outcome === 'failed' || removal.outcome === 'gone')) {
                // The discard is by id: a mount already gone (a wait cut short, or
                // removed elsewhere) still has what it left discarded.
                removal = await this.removeMountRecorded(mountId, { uploads: 'discard' });
            }
            if (removal) {
                if (removal.outcome !== 'delivered')
                    drained = false;
                if (removal.outcome === 'failed') {
                    // The kit may have removed the mount before the answer was lost (an abort is `keep`):
                    // `undelivered` stays recorded.
                    leftovers.push(`${where}: ${removal.why}`);
                    backendKept = 'kept for the mount';
                }
                else {
                    delete this.j.mountId;
                    // Every generation of the mount ended clean: nothing of the run is left undelivered.
                    // Anything else, a mount found gone included, is not confirmed: only --force ends it.
                    if (removal.outcome === 'delivered')
                        delete this.j.undelivered;
                    else
                        this.j.undelivered = true;
                    await this.save().catch(() => undefined);
                }
                if (removal.outcome === 'delivered') {
                    await this.settleHop();
                }
                else if (removal.outcome === 'gone') {
                    this.emit('warn', `${where} was already gone, so the container never confirmed it had sent everything here`);
                }
                else if (removal.outcome === 'discarded' && removal.discarded !== null) {
                    // `undelivered` stays recorded: the backend's discard below confirms nothing else is left.
                    discarded = true;
                    if (removal.discarded)
                        this.emit('warn', `discarded ${filesText(removal.discarded)} the container had not sent here`);
                }
                else if (removal.outcome === 'undelivered') {
                    const held = pendingText(removal.view);
                    this.emit('warn', `the container did not send everything in time: it still holds ${held}`);
                    undeliveredKept = `kept: the container still held ${held} when ${where} was removed`;
                }
                // A `discarded: null`: what the kit could not stop goes on as `keep`, and the backend's discard below drops it.
            }
            this.serveWhileStopping = false;
        }
        this.timers.abort();
        // 3. the backend, only once no mount of the share may still use it (its
        // DELETE removes the backend's mounts too).
        if (this.j.backendId) {
            if (backendKept) {
                leftovers.push(`backend ${this.j.backendId}: ${backendKept}`);
            }
            else if (this.discard) {
                // --force, read now (it may have come in during the mount's removal):
                // the backend's discard drops what any mount of it left, whatever this run saw.
                const r = await discardBackend(opts.kit, this.j.backendId);
                if (discardConfirmed(r)) {
                    discarded = true;
                    if (r.discarded)
                        this.emit('warn', `discarded ${filesText(r.discarded)} the container had not sent here`);
                    delete this.j.backendId;
                    delete this.j.undelivered;
                }
                else {
                    leftovers.push(`backend ${this.j.backendId}: ${backendDiscardFailure(r, this.j)}`);
                }
            }
            else if (this.j.undelivered) {
                leftovers.push(`backend ${this.j.backendId}: ${undeliveredKept ?? `kept: ${RETIRED_UNDELIVERED_TEXT}`}`);
            }
            else {
                const r = await deleteResource(opts.kit, `/api/v1/backends/${encodeURIComponent(this.j.backendId)}`);
                if (r === 'gone')
                    delete this.j.backendId;
                else
                    leftovers.push(`backend ${this.j.backendId}: ${r}`);
            }
        }
        // 4. the tunnel, the hop, then rclone.
        if (this.tunnel)
            await this.closeTunnel(this.tunnel);
        if (this.hop)
            await this.hop.close().catch(() => undefined);
        if (this.child && !this.childGone && this.child.pid) {
            await killRecordedChild(this.child.pid, this.j.child?.start, { graceMs: timings.killGraceMs });
            await Promise.race([this.childClosed, new Promise((r) => setTimeout(r, 2000).unref())]);
        }
        // 5. the journal goes only when everything it records is confirmed gone.
        const clean = !this.j.mountId && !this.j.backendId && !this.j.pendingCreate;
        let result;
        if (clean) {
            await deleteJournal(dir, this.j).catch(() => undefined);
            this.setState('done');
            result = { ok: true, drained, discarded, state: 'done', kind: this.stopKind, reason: this.scrub(this.stopReason), leftovers: [] };
        }
        else {
            this.j.stage = 'cleanup-pending';
            this.j.leftovers = leftovers.map(this.scrub);
            await this.save().catch(() => undefined);
            this.setState('cleanup-pending');
            result = {
                ok: false,
                drained,
                discarded,
                state: 'cleanup-pending',
                kind: this.stopKind,
                reason: this.scrub(this.stopReason),
                leftovers: leftovers.map(this.scrub),
            };
        }
        this.result = result;
        for (const w of this.waiters.splice(0)) {
            w.send({ type: 'result', ...result });
            w.end();
        }
        // 6. the stop channel.
        await lock.release();
        this.resolveDone(result);
        return result;
    }
}
// ─── Public entry points ─────────────────────────────────────────────────
function withDefaults(opts) {
    return { timings: { ...SHARE_TIMINGS, ...opts.timings }, deps: { ...defaultDeps, ...opts.deps } };
}
/**
 * Share `localPath` into the container. Resolves once the folder is mounted
 * in the container (`handle.mountPath`); the share then runs until
 * `handle.stop()`, `opts.signal`, `stopShare()` from another process, rclone
 * exiting, or a reconnect conflict. A failed start cleans up what it made and
 * throws a ShareError.
 */
export async function share(opts) {
    const localPath = await resolveShareDir(opts.localPath);
    const name = opts.name ?? basename(localPath);
    const problem = shareNameProblem(name);
    if (problem) {
        throw new Error(`${problem}. Example: --name ${suggestName(name)}`);
    }
    if (!opts.target.containerId)
        throw new Error('target.containerId is required');
    const apiOrigin = normalizeApiOrigin(opts.target.apiOrigin);
    const { timings, deps } = withDefaults(opts);
    const dir = sharesDir(opts.home);
    await ensureSharesDir(dir);
    const id = computeShareId(apiOrigin, opts.target.containerId, name);
    const runToken = newRunToken();
    const flavor = opts.lockFlavor ?? defaultLockFlavor();
    const acquired = await acquireOwnerLock({ dir, id, flavor, token: runToken });
    if (!acquired.won) {
        throw new Error(acquired.reason === 'reclaim-busy'
            ? `another hoody share of "${name}" is starting or stopping on this machine; try again in a moment`
            : `"${name}" is already shared to container ${opts.target.containerId} by a running hoody share; stop it with \`hoody share stop ${name}\``);
    }
    const lock = acquired.lock;
    try {
        const earlier = (await listJournals(dir, id)).filter((j) => j.runToken !== runToken);
        if (earlier.length > 0) {
            throw new Error(`an earlier share of "${name}" was not cleaned up: run \`hoody share stop ${name}\``);
        }
    }
    catch (err) {
        await lock.release();
        throw err;
    }
    const user = `hs-${randomBytes(6).toString('hex')}`;
    const pass = randomBytes(32).toString('base64url');
    const now = new Date().toISOString();
    const target = {
        apiOrigin,
        containerId: opts.target.containerId,
        ...(opts.target.server ? { server: opts.target.server } : {}),
        ...(opts.target.projectId ? { projectId: opts.target.projectId } : {}),
    };
    const journal = {
        version: 1,
        id,
        runToken,
        target,
        name,
        localPath,
        readOnly: Boolean(opts.readOnly),
        stage: 'starting',
        requestedMountPath: name,
        vfsConfig: shareVfsConfig(Boolean(opts.readOnly)),
        owner: { pid: process.pid, start: await processStartIdentity(process.pid) },
        startedAt: now,
        updatedAt: now,
    };
    const owner = new ShareOwner({ opts, deps, timings, dir, lock, journal, user, pass });
    return owner.run();
}
/** Every share this user has a journal for, with its owner's live state. */
export async function listShares(opts = {}) {
    const dir = sharesDir(opts.home);
    const flavor = opts.lockFlavor ?? defaultLockFlavor();
    const journals = await listJournals(dir);
    const out = [];
    const liveState = new Map();
    for (const j of journals) {
        if (!liveState.has(j.id)) {
            const reply = await requestOwner({ dir, id: j.id, flavor }, 'status', { timeoutMs: 3000 });
            const result = reply.reached ? reply.replies.find((r) => r.type === 'result') : undefined;
            liveState.set(j.id, {
                token: reply.reached ? await readOwnerToken(dir, j.id) : null,
                state: result && typeof result.state === 'string' ? result.state : null,
            });
        }
        const live = liveState.get(j.id);
        const status = live.token === j.runToken && live.state ? live.state : j.stage === 'cleanup-pending' ? 'cleanup pending' : 'dead';
        out.push({
            id: j.id,
            name: j.name,
            containerId: j.target.containerId,
            apiOrigin: j.target.apiOrigin,
            localPath: j.localPath,
            mountPath: j.mountPath,
            publicUrl: j.publicUrl,
            readOnly: j.readOnly,
            status,
            leftovers: j.leftovers,
            startedAt: j.startedAt,
        });
    }
    return out;
}
/** `stopShare` without an owner, refused: the container holds writes that stopping would discard. */
export class UndeliveredWritesError extends Error {
    constructor(message) {
        super(message);
        this.name = 'UndeliveredWritesError';
    }
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
export async function stopShare(opts) {
    const dir = sharesDir(opts.home);
    const flavor = opts.lockFlavor ?? defaultLockFlavor();
    const timings = { ...SHARE_TIMINGS, ...opts.timings };
    const apiOrigin = opts.apiOrigin ? normalizeApiOrigin(opts.apiOrigin) : undefined;
    const emit = (level, message) => opts.onEvent?.({ level, message });
    const matches = (await listJournals(dir)).filter((j) => j.name === opts.name &&
        (!opts.containerId || j.target.containerId === opts.containerId) &&
        (!apiOrigin || j.target.apiOrigin === apiOrigin));
    const ids = [...new Set(matches.map((j) => j.id))];
    if (ids.length === 0) {
        throw new Error(`no share named "${opts.name}"${opts.containerId ? ` on container ${opts.containerId}` : ''}`);
    }
    if (ids.length > 1) {
        const choices = ids.map((id) => {
            const j = matches.find((m) => m.id === id);
            return { containerId: j.target.containerId, apiOrigin: j.target.apiOrigin };
        });
        throw new AmbiguousShareError(opts.name, choices);
    }
    const id = ids[0];
    const containerId = matches[0].target.containerId;
    for (let attempt = 0; attempt < 5; attempt++) {
        const asked = await requestOwner({ dir, id, flavor }, 'stop', {
            onReply: (r) => {
                if (r.type === 'progress' && typeof r.message === 'string')
                    emit('info', r.message);
            },
            ...(opts.force ? { force: true } : {}),
        });
        if (asked.reached) {
            const final = [...asked.replies].reverse().find((r) => r.type === 'result');
            if (final?.retry === true) {
                await new Promise((r) => setTimeout(r, 200));
                continue;
            }
            if (!final) {
                return { ok: false, name: opts.name, containerId, via: 'owner', leftovers: [], message: 'the owner ended the connection without a result' };
            }
            const leftovers = Array.isArray(final.leftovers) ? final.leftovers : [];
            const cleaned = final.ok === true;
            const drained = final.drained !== false;
            // Asked for with --force: discarded writes are what this stop was for.
            const discarded = final.discarded === true && opts.force === true;
            const message = typeof final.error === 'string'
                ? final.error
                : !cleaned
                    ? `cleanup is pending: ${leftovers.join('; ')}`
                    : drained
                        ? 'stopped'
                        : discarded
                            ? 'stopped; what the container had not sent here was discarded'
                            : 'stopped, but the container never confirmed it had sent everything here; a recent write may not have reached this machine';
            return { ok: cleaned && (drained || discarded), name: opts.name, containerId, via: 'owner', leftovers, message };
        }
        if (asked.reason === 'no-token') {
            throw new Error(`share "${opts.name}" has a running owner whose run token this user cannot read`);
        }
        const token = newRunToken();
        const acquired = await acquireOwnerLock({ dir, id, flavor, token });
        if (!acquired.won) {
            await new Promise((r) => setTimeout(r, 200));
            continue;
        }
        acquired.lock.setHandler((req, conn) => {
            conn.send(req.op === 'status'
                ? { type: 'result', ok: true, state: 'stopping' }
                : { type: 'result', ok: false, error: 'another `hoody share stop` is cleaning this share up; try again when it ends' });
            conn.end();
        });
        try {
            return await cleanupWithoutOwner(dir, id, opts, timings, emit);
        }
        finally {
            await acquired.lock.release();
        }
    }
    throw new Error(`could not stop "${opts.name}": its owner kept changing; try again`);
}
async function cleanupWithoutOwner(dir, id, opts, timings, emit) {
    const journals = await listJournals(dir, id);
    const containerId = journals[0]?.target.containerId ?? opts.containerId ?? '';
    const leftovers = [];
    const kits = new Map();
    const kitOf = (j) => {
        let k = kits.get(j.runToken);
        if (!k) {
            k = Promise.resolve().then(() => opts.kitFor(j.target));
            k.catch(() => undefined);
            kits.set(j.runToken, k);
        }
        return k;
    };
    // 1. Creates whose answer was lost: what they made is found and recorded
    // first, so the check below sees every mount. One not found for sure stays
    // pending, and its backend is not deleted (that would delete the mount).
    const unresolved = new Map();
    for (const j of journals) {
        if (!j.pendingCreate)
            continue;
        let kit;
        try {
            kit = await kitOf(j);
        }
        catch {
            continue; // reported below
        }
        try {
            emit('info', `looking for a ${j.pendingCreate} whose create answer was lost`);
            const found = await findLostCreate(kit, j, { windowMs: timings.lostCreateWindowMs, pollMs: timings.lostCreatePollMs });
            if (found.backendId)
                j.backendId = found.backendId;
            if (found.mountId)
                j.mountId = found.mountId;
            delete j.pendingCreate;
        }
        catch (err) {
            unresolved.set(j.runToken, err.message);
        }
        await writeJournal(dir, j);
    }
    // 2. Before anything is stopped or deleted: what would be discarded. Without
    // an owner nothing serves the folder (and the password is gone), so the
    // container's unsent writes can never be delivered.
    const views = new Map();
    const undelivered = [];
    for (const j of journals) {
        let view = null;
        if (j.mountId) {
            try {
                view = await readUploads(await kitOf(j), j.mountId);
            }
            catch {
                view = UNKNOWN_UPLOADS;
            }
            views.set(j.runToken, view);
            if (view.state === 'busy' || view.state === 'unknown')
                undelivered.push(undeliveredText(view));
        }
        // A mount removed before it confirmed delivery (by an earlier stop, or
        // found gone now) may still hold writes, and with no mount left to wait
        // on, only --force (the discards by id) ends it.
        if (view?.state === 'gone' || (!view && j.undelivered && j.backendId))
            undelivered.push(RETIRED_UNDELIVERED_TEXT);
    }
    if (undelivered.length > 0) {
        const what = undelivered.join('; ');
        if (!opts.force) {
            throw new UndeliveredWritesError(`share "${opts.name}" is not running, and ${what}. They cannot be delivered, and stopping discards them: ` +
                `run \`hoody share stop ${opts.name} --force\` to discard them`);
        }
        emit('warn', `discarding what never reached this machine: ${what}`);
    }
    // 3. Each journal: rclone, the mount, then its backend once the mount is
    // confirmed gone (a backend DELETE removes its mounts too).
    for (const j of journals) {
        const left = [];
        if (j.child) {
            const r = await killRecordedChild(j.child.pid, j.child.start, { graceMs: timings.killGraceMs });
            if (r === 'killed')
                emit('info', `stopped the share's rclone (pid ${j.child.pid})`);
            if (r === 'identity-mismatch')
                emit('info', `pid ${j.child.pid} now belongs to another process; not signalled`);
            delete j.child;
        }
        const lost = unresolved.get(j.runToken);
        if (lost)
            left.push(lost);
        let kit = null;
        if (j.mountId || j.backendId || j.pendingCreate) {
            try {
                kit = await kitOf(j);
            }
            catch (err) {
                left.push(`container ${j.target.containerId} could not be reached: ${err.message}`);
            }
        }
        if (kit) {
            j.stage = 'stopping';
            await writeJournal(dir, j);
            let backendKept = j.pendingCreate === 'mount' ? 'kept: a mount whose create answer was lost may still use it' : null;
            if (j.mountId) {
                const where = `mount ${j.mountId} (${j.mountPath ?? j.requestedMountPath})`;
                // Recorded before the DELETE (see ShareOwner.removeMountRecorded), and
                // before a mount found gone is dropped: an answer lost to Ctrl+C or a
                // crash leaves the next stop refusing, not taking a 404 for delivery.
                j.undelivered = true;
                await writeJournal(dir, j);
                let removal = { outcome: 'gone' };
                if (opts.force) {
                    // The discard is by id: a mount already gone still has what it left discarded.
                    removal = await discardMount(kit, j.mountId, j);
                }
                else if (views.get(j.runToken)?.state !== 'gone') {
                    removal = await removeMount(kit, j.mountId, { uploads: 'wait', waitSeconds: waitSecondsFor(timings.cleanupWaitMs) });
                }
                if (removal.outcome === 'failed') {
                    left.push(`${where}: ${removal.why}`);
                    backendKept = 'kept for the mount';
                }
                else {
                    delete j.mountId;
                    // Every generation of the mount ended clean: nothing of the run is left undelivered.
                    if (removal.outcome === 'delivered')
                        delete j.undelivered;
                    // Otherwise `undelivered` stays until the backend's discard below confirms nothing is left.
                    if (removal.outcome === 'discarded' && removal.discarded)
                        emit('info', `discarded ${filesText(removal.discarded)} the container had not sent here`);
                    if (removal.outcome === 'undelivered') {
                        const held = pendingText(removal.view);
                        emit('warn', `${where} was removed while the container still held ${held}`);
                        backendKept = `kept: the container still held ${held} when ${where} was removed`;
                    }
                    await writeJournal(dir, j);
                }
            }
            if (j.backendId) {
                if (backendKept) {
                    left.push(`backend ${j.backendId}: ${backendKept}`);
                }
                else if (opts.force) {
                    // Whatever this stop saw: the backend's discard drops what any mount of it left.
                    const r = await discardBackend(kit, j.backendId);
                    if (discardConfirmed(r)) {
                        if (r.discarded)
                            emit('info', `discarded ${filesText(r.discarded)} the container had not sent here`);
                        delete j.backendId;
                        delete j.undelivered;
                    }
                    else {
                        left.push(`backend ${j.backendId}: ${backendDiscardFailure(r, j)}`);
                    }
                }
                else if (j.undelivered) {
                    // The mount went between the check above and its DELETE.
                    left.push(`backend ${j.backendId}: kept: ${RETIRED_UNDELIVERED_TEXT}`);
                }
                else {
                    const r = await deleteResource(kit, `/api/v1/backends/${encodeURIComponent(j.backendId)}`);
                    if (r === 'gone')
                        delete j.backendId;
                    else
                        left.push(`backend ${j.backendId}: ${r}`);
                }
            }
        }
        if (!j.mountId && !j.backendId && !j.pendingCreate) {
            await deleteJournal(dir, j);
        }
        else {
            j.stage = 'cleanup-pending';
            j.leftovers = left;
            await writeJournal(dir, j);
            leftovers.push(...left);
        }
    }
    const ok = leftovers.length === 0;
    return {
        ok,
        name: opts.name,
        containerId,
        via: 'cleanup',
        leftovers,
        message: ok ? 'cleaned up' : `cleanup is pending: ${leftovers.join('; ')}`,
    };
}

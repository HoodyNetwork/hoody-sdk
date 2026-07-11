/**
 * `@hoody-ai/hoody-sdk/mount` — programmatic and CLI-facing module for
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
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { homedir, platform, userInfo } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile as execFileCb } from 'node:child_process';
import { checkLiveness, claimState, computeMountId, configFilePath, deleteState, ensureMountpointParent, getStateDir, isMountpointEmpty, listStates, pruneStale, readState, stateFilePath, } from './mount-state.js';
const execFile = promisify(execFileCb);
const RCLONE_HEADERS_MIN_VERSION = [1, 61];
// ─── Public entry points ─────────────────────────────────────────────────
export async function listMounts(home) {
    const records = await listStates(home);
    const out = [];
    for (const r of records) {
        const liveness = await checkLiveness(r);
        out.push({
            id: r.id,
            containerId: r.containerId,
            kitUrl: r.kitUrl,
            subpath: r.subpath,
            localPath: r.localPath,
            mode: r.mode,
            pid: r.pid,
            alive: liveness.alive,
            startedAt: r.startedAt,
        });
    }
    return out;
}
export async function pruneStaleMounts(home) {
    return pruneStale(home);
}
export async function probeKit(kitUrl, auth, timeoutMs = 10000) {
    const headers = {};
    applyAuthToHeaders(headers, auth);
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(kitUrl, {
            method: 'OPTIONS',
            headers,
            signal: controller.signal,
        });
        const dav = res.headers.get('dav') ?? undefined;
        if (res.status === 401 || res.status === 403) {
            return { ok: false, status: res.status, davHeader: dav, needsAuth: true, detail: `${res.status} ${res.statusText}` };
        }
        if (res.status >= 200 && res.status < 300) {
            return { ok: true, status: res.status, davHeader: dav, needsAuth: false };
        }
        return { ok: false, status: res.status, davHeader: dav, needsAuth: false, detail: `${res.status} ${res.statusText}` };
    }
    catch (err) {
        return { ok: false, status: 0, needsAuth: false, detail: err.message };
    }
    finally {
        clearTimeout(t);
    }
}
/**
 * Resolve a kit URL from MountTarget. The full path the WebDAV remote
 * mounts is `<kit base URL>/<subpath>` (subpath stripped of leading
 * slashes and percent-encoded segment-by-segment).
 */
export function resolveKitUrl(target) {
    const subpath = normalizeSubpath('subpath' in target ? target.subpath : undefined);
    if ('kitUrl' in target) {
        if (!/^https?:\/\//.test(target.kitUrl)) {
            throw new Error(`kitUrl must start with http:// or https:// (got ${JSON.stringify(target.kitUrl)})`);
        }
        return {
            kitUrl: stripTrailingSlash(target.kitUrl),
            subpath,
            containerId: extractContainerIdFromUrl(target.kitUrl),
        };
    }
    const c = target.container;
    const server = typeof c.server_name === 'string'
        ? c.server_name
        : (typeof c.server === 'string' ? c.server : undefined);
    if (!c.id || !c.project_id || !server) {
        throw new Error('container must include id, project_id, and server_name (or server)');
    }
    const idx = target.serviceIndex ?? 1;
    const kitUrl = `https://${c.project_id}-${c.id}-files-${idx}.${server}.containers.hoody.com`;
    return { kitUrl, subpath, containerId: c.id };
}
export async function mount(opts) {
    const { kitUrl, subpath, containerId } = resolveKitUrl(opts);
    const localPath = resolve(opts.localPath);
    if (opts.background && platform() === 'win32') {
        throw new Error('--background is not supported on Windows. WinFsp does not expose a daemonize flag. ' +
            'Run hoody mount in a separate terminal (foreground), or use Windows Task Scheduler.');
    }
    await ensureMountpointParent(localPath);
    const empty = await isMountpointEmpty(localPath);
    if (!empty) {
        throw new Error(`mountpoint ${localPath} is not empty (rclone requires an empty directory)`);
    }
    await fs.mkdir(localPath, { recursive: true, mode: 0o700 }).catch(() => undefined);
    const rclonePath = opts.rclonePath ?? 'rclone';
    await assertRcloneInstalled(rclonePath);
    const rcloneVersion = await detectRcloneVersion(rclonePath);
    const supportsHeadersConfig = isVersionAtLeast(rcloneVersion, RCLONE_HEADERS_MIN_VERSION);
    const id = computeMountId(localPath, userInfo().uid);
    const url = subpath ? `${kitUrl}/${subpath}` : kitUrl;
    const auth = opts.auth ?? { type: 'ip' };
    const { configBody, authMethod, headerArgs } = await buildAuthDelivery({
        auth,
        url,
        rclonePath,
        supportsHeadersConfig,
    });
    await fs.mkdir(getStateDir(opts.home), { recursive: true, mode: 0o700 });
    const confPath = configFilePath(id, opts.home);
    const record = {
        id,
        version: 1,
        containerId,
        kitUrl: url,
        subpath,
        localPath,
        mode: opts.background ? 'background' : 'foreground',
        pid: null,
        rclonePid: null,
        auth: { method: authMethod },
        startedAt: new Date().toISOString(),
        platform: platform(),
    };
    await claimState(record, opts.home);
    try {
        await fs.writeFile(confPath, configBody, { mode: 0o600 });
    }
    catch (err) {
        await deleteState(id, opts.home);
        throw err;
    }
    const args = [
        'mount',
        'hoody:',
        localPath,
        '--config',
        confPath,
        ...(opts.noVfsCache ? [] : ['--vfs-cache-mode', 'writes']),
        ...(opts.readOnly ? ['--read-only'] : []),
        ...headerArgs,
        ...(opts.extraRcloneArgs ?? []),
    ];
    const env = { ...process.env };
    delete env.RCLONE_WEBDAV_USER;
    delete env.RCLONE_WEBDAV_PASS;
    delete env.RCLONE_WEBDAV_BEARER_TOKEN;
    delete env.RCLONE_WEBDAV_HEADERS;
    if (opts.background) {
        args.push('--daemon', '--daemon-timeout', '10m');
        let child;
        try {
            child = spawn(rclonePath, args, {
                detached: true,
                stdio: 'ignore',
                env,
            });
        }
        catch (err) {
            await deleteState(id, opts.home);
            throw err;
        }
        child.unref();
        let parentExit = null;
        await new Promise((res) => {
            child.once('exit', (code) => {
                parentExit = code ?? -1;
                res();
            });
            const t = setTimeout(() => res(), 12000);
            child.once('exit', () => clearTimeout(t));
        });
        if (parentExit !== 0 && parentExit !== null) {
            await deleteState(id, opts.home);
            throw new Error(`rclone --daemon parent exited with code ${parentExit} — mount failed`);
        }
        const daemonPid = await pollDaemonPid(rclonePath, localPath);
        record.pid = daemonPid;
        record.rclonePid = daemonPid;
        await fs.writeFile(stateFilePath(id, opts.home), JSON.stringify(record, null, 2), { mode: 0o600 });
        return {
            id,
            pid: daemonPid,
            rclonePid: daemonPid,
            localPath,
            kitUrl: url,
            mode: 'background',
            wait: () => Promise.resolve(0),
            unmount: () => unmountById(id, opts.home),
        };
    }
    let child;
    try {
        child = spawn(rclonePath, args, {
            stdio: opts.stdio ?? 'inherit',
            env,
        });
    }
    catch (err) {
        await deleteState(id, opts.home);
        throw err;
    }
    const childPid = child.pid ?? null;
    record.pid = childPid;
    record.rclonePid = childPid;
    await fs.writeFile(stateFilePath(id, opts.home), JSON.stringify(record, null, 2), { mode: 0o600 });
    const cleanup = makeForegroundCleanup(child, id, opts.home, localPath);
    const signalHandler = installSignalHandlers(cleanup);
    return {
        id,
        pid: childPid,
        rclonePid: childPid,
        localPath,
        kitUrl: url,
        mode: 'foreground',
        wait: () => new Promise((resolveExit) => {
            child.once('exit', (code) => {
                uninstallSignalHandlers(signalHandler);
                deleteState(id, opts.home).catch(() => undefined);
                resolveExit(code ?? -1);
            });
        }),
        unmount: () => cleanup(),
    };
}
export async function unmountById(id, home) {
    let rec;
    try {
        rec = await readState(id, home);
    }
    catch (err) {
        if (err.code === 'ENOENT') {
            throw new Error(`no mount found with id ${id}`);
        }
        throw err;
    }
    if (rec.pid !== null) {
        try {
            process.kill(rec.pid, 'SIGTERM');
        }
        catch {
            // pid may be gone
        }
    }
    await fusermountFallback(rec.localPath);
    await deleteState(id, home);
}
export async function unmount(idOrPath, home) {
    if (/^[a-f0-9]{16}$/.test(idOrPath)) {
        return unmountById(idOrPath, home);
    }
    const localPath = resolve(idOrPath);
    const id = computeMountId(localPath, userInfo().uid);
    try {
        await readState(id, home);
        return unmountById(id, home);
    }
    catch (err) {
        if (err.code !== 'ENOENT')
            throw err;
    }
    const records = await listStates(home);
    const match = records.find((r) => resolve(r.localPath) === localPath);
    if (!match)
        throw new Error(`no mount found for ${idOrPath}`);
    return unmountById(match.id, home);
}
export async function unmountAll(home) {
    const records = await listStates(home);
    let count = 0;
    for (const r of records) {
        try {
            await unmountById(r.id, home);
            count++;
        }
        catch {
            // best effort
        }
    }
    return count;
}
export async function unmountByContainer(containerId, home) {
    const records = await listStates(home);
    let count = 0;
    for (const r of records.filter((x) => x.containerId === containerId)) {
        try {
            await unmountById(r.id, home);
            count++;
        }
        catch {
            // best effort
        }
    }
    return count;
}
export async function buildAuthDelivery(opts) {
    const { auth, url, rclonePath, supportsHeadersConfig } = opts;
    const base = `[hoody]\ntype = webdav\nurl = ${url}\nvendor = other\n`;
    switch (auth.type) {
        case 'ip':
            return { configBody: base, authMethod: 'ip', headerArgs: [] };
        case 'password': {
            const obscured = await rcloneObscure(rclonePath, auth.password);
            return {
                configBody: `${base}user = ${auth.username}\npass = ${obscured}\n`,
                authMethod: 'password',
                headerArgs: [],
            };
        }
        case 'jwt':
        case 'token': {
            const tokenValue = auth.type === 'jwt' ? auth.token : auth.value;
            const headerName = auth.header;
            if (!headerName || /^authorization$/i.test(headerName)) {
                return { configBody: `${base}bearer_token = ${tokenValue}\n`, authMethod: 'token', headerArgs: [] };
            }
            if (supportsHeadersConfig) {
                const csv = csvEncodeHeader(headerName, tokenValue);
                return { configBody: `${base}headers = ${csv}\n`, authMethod: 'header', headerArgs: [] };
            }
            return {
                configBody: base,
                authMethod: 'header',
                headerArgs: ['--header', `${headerName}: ${tokenValue}`],
            };
        }
        case 'containerClaim': {
            if (supportsHeadersConfig) {
                const csv = csvEncodeHeaders([
                    ['X-Hoody-Container-Claim', auth.claim],
                    ['X-Hoody-Token', auth.token],
                ]);
                return { configBody: `${base}headers = ${csv}\n`, authMethod: 'containerClaim', headerArgs: [] };
            }
            return {
                configBody: base,
                authMethod: 'containerClaim',
                headerArgs: [
                    '--header',
                    `X-Hoody-Container-Claim: ${auth.claim}`,
                    '--header',
                    `X-Hoody-Token: ${auth.token}`,
                ],
            };
        }
        default: {
            const _exhaustive = auth;
            throw new Error(`unsupported ProxyAuth: ${JSON.stringify(_exhaustive)}`);
        }
    }
}
function csvEncodeHeader(name, value) {
    return `${csvField(name)},${csvField(value)}`;
}
function csvEncodeHeaders(pairs) {
    return pairs.map(([k, v]) => csvEncodeHeader(k, v)).join(',');
}
function csvField(s) {
    if (/[",\n]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}
function applyAuthToHeaders(headers, auth) {
    if (!auth || auth.type === 'ip')
        return;
    if (auth.type === 'password') {
        const b64 = base64(`${auth.username}:${auth.password}`);
        headers['authorization'] = `Basic ${b64}`;
        return;
    }
    if (auth.type === 'jwt') {
        headers[auth.header?.toLowerCase() ?? 'authorization'] = `Bearer ${auth.token}`;
        return;
    }
    if (auth.type === 'token') {
        headers[auth.header?.toLowerCase() ?? 'authorization'] = `Bearer ${auth.value}`;
        return;
    }
    if (auth.type === 'containerClaim') {
        headers['x-hoody-container-claim'] = auth.claim;
        headers['x-hoody-token'] = auth.token;
    }
}
function base64(s) {
    if (typeof Buffer !== 'undefined')
        return Buffer.from(s).toString('base64');
    return btoa(s);
}
async function rcloneObscure(rclonePath, plaintext) {
    // execFile (no shell): plaintext password cannot contain shell syntax
    // that would inject commands. Worst case is a weird-but-literal value
    // passed to rclone obscure, which rclone handles fine.
    const { stdout } = await execFile(rclonePath, ['obscure', plaintext], { timeout: 10000 });
    return stdout.trim();
}
async function detectRcloneVersion(rclonePath) {
    try {
        const { stdout } = await execFile(rclonePath, ['version'], { timeout: 5000 });
        const m = stdout.match(/rclone v(\d+)\.(\d+)(?:\.(\d+))?/);
        if (!m)
            return null;
        return [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
    }
    catch {
        return null;
    }
}
async function assertRcloneInstalled(rclonePath) {
    try {
        await execFile(rclonePath, ['version'], { timeout: 5000 });
    }
    catch (err) {
        void err;
        throw new Error(`rclone not found at "${rclonePath}". Install rclone from https://rclone.org/install/ ` +
            '(macOS: brew install rclone; Linux: apt/dnf install rclone; Windows: winget install Rclone.Rclone).');
    }
}
function isVersionAtLeast(v, target) {
    if (!v)
        return false;
    if (v[0] !== target[0])
        return v[0] > target[0];
    return v[1] >= target[1];
}
/**
 * Poll the OS process table for the rclone daemon process matching the
 * given localPath. Uses execFile (no shell) so untrusted-looking
 * characters in `localPath` cannot inject shell syntax.
 */
async function pollDaemonPid(rclonePath, localPath, deadlineMs = 15000) {
    void rclonePath;
    const start = Date.now();
    while (Date.now() - start < deadlineMs) {
        try {
            let stdout;
            if (process.platform === 'win32') {
                const escaped = localPath.replace(/'/g, "''");
                const { stdout: out } = await execFile('wmic', ['process', 'where', `CommandLine like '%${escaped}%'`, 'get', 'processid'], { timeout: 3000 });
                stdout = out;
            }
            else {
                // `pgrep -af <regex>` — pattern is the LAST arg, not concatenated
                // into a shell command, so it cannot inject shell syntax. The regex
                // is anchored loosely (rclone mount ... <localPath>) but exact
                // argv-token matching happens in parseRcloneCandidates anyway.
                const { stdout: out } = await execFile('pgrep', ['-af', `rclone mount.*${escapeForRegex(localPath)}`], { timeout: 3000 });
                stdout = out;
            }
            const candidates = parseRcloneCandidates(stdout, localPath);
            if (candidates.length === 1)
                return candidates[0];
        }
        catch {
            // ignore; retry
        }
        await sleep(500);
    }
    return null;
}
function parseRcloneCandidates(stdout, localPath) {
    const out = [];
    for (const line of stdout.split('\n')) {
        if (!hasExactPathArg(line, localPath))
            continue;
        const m = line.match(/^\s*(\d+)/);
        if (m)
            out.push(Number(m[1]));
    }
    return out;
}
/**
 * Whether `line` contains `localPath` as a *whole argv token*, not as a
 * substring. Avoids false matches when one mountpoint is a prefix of
 * another (e.g. `/mnt/a` and `/mnt/abc`).
 */
function hasExactPathArg(line, localPath) {
    const tokens = line.split(/\s+/);
    return tokens.some((t) => t === localPath || t === `"${localPath}"` || t === `'${localPath}'`);
}
async function fusermountFallback(localPath) {
    if (process.platform === 'linux') {
        try {
            await execFile('fusermount', ['-u', localPath], { timeout: 5000 });
        }
        catch { /* ignore */ }
        return;
    }
    if (process.platform === 'darwin') {
        try {
            await execFile('diskutil', ['unmount', 'force', localPath], { timeout: 5000 });
        }
        catch { /* ignore */ }
        return;
    }
    // win32: WinFsp unmount happens when the rclone process exits
}
function makeForegroundCleanup(child, id, home, localPath) {
    let invoked = false;
    return async () => {
        if (invoked)
            return;
        invoked = true;
        if (!child.killed) {
            try {
                child.kill('SIGTERM');
            }
            catch { /* ignore */ }
        }
        const exitPromise = new Promise((res) => {
            if (child.exitCode !== null)
                return res();
            child.once('exit', () => res());
        });
        await Promise.race([exitPromise, sleep(10000)]);
        await fusermountFallback(localPath);
        await deleteState(id, home);
    };
}
/**
 * Per-mount signal handler. Each foreground mount installs its own
 * handler so concurrent programmatic mounts both clean up on SIGINT.
 * The previous singleton design dropped cleanup for the 2nd+ mount.
 */
function installSignalHandlers(cleanup) {
    const handler = (..._args) => {
        cleanup().finally(() => process.exit(0));
    };
    process.on('SIGINT', handler);
    process.on('SIGTERM', handler);
    process.on('SIGHUP', handler);
    return handler;
}
function uninstallSignalHandlers(handler) {
    process.removeListener('SIGINT', handler);
    process.removeListener('SIGTERM', handler);
    process.removeListener('SIGHUP', handler);
}
function sleep(ms) {
    return new Promise((res) => setTimeout(res, ms));
}
function escapeForRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function stripTrailingSlash(s) {
    return s.endsWith('/') ? s.slice(0, -1) : s;
}
function normalizeSubpath(subpath) {
    if (!subpath || subpath === '/')
        return '';
    let s = subpath.replace(/^\/+/, '').replace(/\/+$/, '');
    if (s.includes('..'))
        throw new Error(`subpath ${JSON.stringify(subpath)} contains '..' (path traversal not allowed)`);
    return s.split('/').map(encodeURIComponent).join('/');
}
function extractContainerIdFromUrl(url) {
    try {
        const u = new URL(url);
        const m = u.hostname.match(/^[a-z0-9]+-([a-z0-9]+)-/i);
        if (m)
            return m[1];
    }
    catch {
        // ignore
    }
    return '';
}
export function parseCliTarget(input) {
    if (/^https?:\/\//.test(input)) {
        const hashIdx = input.indexOf('#');
        if (hashIdx >= 0)
            throw new Error(`URL must not contain '#': ${input}`);
        return { containerId: null, kitUrl: stripTrailingSlash(input), subpath: '' };
    }
    const idOnly = input.match(/^([a-z0-9]{4,64})$/i);
    if (idOnly)
        return { containerId: idOnly[1], kitUrl: null, subpath: '' };
    const withSub = input.match(/^([a-z0-9]{4,64}):\/(.*)$/i);
    if (withSub)
        return { containerId: withSub[1], kitUrl: null, subpath: withSub[2] ?? '' };
    throw new Error(`cannot parse mount target ${JSON.stringify(input)}: ` +
        'expected <containerId>, <containerId>:/path, or https://...');
}
export { homedir as _homedir };

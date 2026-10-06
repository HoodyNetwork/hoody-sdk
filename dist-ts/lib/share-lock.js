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
import { execFile as execFileCb } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import { userInfo } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
const execFile = promisify(execFileCb);
export function defaultLockFlavor(platform = process.platform) {
    if (platform === 'linux')
        return 'abstract';
    if (platform === 'win32')
        return 'pipe';
    return 'file';
}
/** A gate whose writer is dead is removed only once it is older than this. */
export const RECLAIM_GATE_STALE_MS = 30_000;
/** The longest a request line may be, in either direction. */
const MAX_LINE_BYTES = 64 * 1024;
/** How long a connection may stay open without a request the owner accepts. */
export const CHANNEL_AUTH_TIMEOUT_MS = 5000;
/** At release, how long an answered connection gets to read its last line before it is cut. */
const RELEASE_GRACE_MS = 1000;
export function newRunToken() {
    return randomBytes(16).toString('hex');
}
export function ownerTokenPath(dir, id) {
    return join(dir, `${id}.owner`);
}
export function reclaimGatePath(dir, id) {
    return join(dir, `${id}.reclaim`);
}
let cachedWindowsSid;
async function lockUser(paths) {
    if (paths.user !== undefined)
        return paths.user;
    if (paths.flavor === 'pipe') {
        if (cachedWindowsSid === undefined) {
            try {
                const { stdout } = await execFile('whoami', ['/user', '/fo', 'csv', '/nh'], { timeout: 5000 });
                const m = stdout.match(/"(S-[0-9-]+)"/);
                cachedWindowsSid = m ? m[1] : userInfo().username;
            }
            catch {
                cachedWindowsSid = userInfo().username;
            }
        }
        return cachedWindowsSid;
    }
    return String(userInfo().uid);
}
/** The address the owner listens on. */
export async function channelAddress(paths) {
    switch (paths.flavor) {
        case 'abstract':
            return `\0hoody-share-${await lockUser(paths)}-${paths.id}`;
        case 'pipe':
            return `\\\\.\\pipe\\hoody-share-${await lockUser(paths)}-${paths.id}`;
        case 'file':
            return join(paths.dir, `${paths.id}.sock`);
    }
}
// ─── Process identity ────────────────────────────────────────────────────
/**
 * A value that names one process instance: its start time. A pid reused by
 * another process gets another value, so a recorded (pid, identity) pair is
 * signalled only while it still names the same process. Null when the process
 * does not exist or its start time cannot be read.
 */
export async function processStartIdentity(pid) {
    if (!Number.isInteger(pid) || pid <= 0)
        return null;
    if (process.platform === 'linux') {
        try {
            const stat = await fs.readFile(`/proc/${pid}/stat`, 'utf8');
            // Field 2 (comm) may hold spaces and parentheses; fields after the last ')' do not.
            const rest = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
            // rest[0] is field 3 (state); field 22 (starttime) is rest[19]. A zombie has exited.
            if (rest[0] === 'Z' || rest[0] === 'X')
                return null;
            const start = rest[19];
            return start ? `linux:${start}` : null;
        }
        catch {
            return null;
        }
    }
    if (process.platform === 'win32') {
        try {
            const { stdout } = await execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Id ${pid}).StartTime.ToFileTimeUtc()`], { timeout: 10_000 });
            const v = stdout.trim();
            return /^\d+$/.test(v) ? `win:${v}` : null;
        }
        catch {
            return null;
        }
    }
    try {
        const { stdout } = await execFile('ps', ['-o', 'lstart=', '-p', String(pid)], { timeout: 5000 });
        const v = stdout.trim();
        return v ? `ps:${v}` : null;
    }
    catch {
        return null;
    }
}
/** Whether a process with this pid and start identity is still running. */
export async function isSameProcessAlive(pid, identity) {
    if (!identity)
        return false;
    return (await processStartIdentity(pid)) === identity;
}
// ─── Owner token file ────────────────────────────────────────────────────
async function writeOwnerToken(dir, id, token) {
    const target = ownerTokenPath(dir, id);
    const tmp = `${target}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
    const handle = await fs.open(tmp, 'wx', 0o600);
    try {
        await handle.writeFile(token);
        await handle.sync();
    }
    finally {
        await handle.close();
    }
    await fs.rename(tmp, target);
}
export async function readOwnerToken(dir, id) {
    try {
        const v = (await fs.readFile(ownerTokenPath(dir, id), 'utf8')).trim();
        return /^[0-9a-f]{32}$/.test(v) ? v : null;
    }
    catch {
        return null;
    }
}
async function removeOwnerTokenIfOurs(dir, id, token) {
    if ((await readOwnerToken(dir, id)) === token) {
        await fs.unlink(ownerTokenPath(dir, id)).catch(() => undefined);
    }
}
function tokensEqual(a, b) {
    const x = Buffer.from(a);
    const y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
}
function lineSplitter(socket, onLine) {
    let buf = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
        buf += chunk;
        if (Buffer.byteLength(buf) > MAX_LINE_BYTES) {
            socket.destroy();
            return;
        }
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl).replace(/\r$/, '');
            buf = buf.slice(nl + 1);
            if (line)
                onLine(line);
        }
    });
}
function attachHandler(server, token, handler, sockets, authTimeoutMs) {
    server.on('connection', (socket) => {
        socket.on('error', () => undefined);
        // Tracked for release(), whose server.close() waits for every connection.
        sockets.add(socket);
        // Anyone local can connect: one that sends no accepted request is cut, so it cannot hold the channel open.
        const unauthenticated = setTimeout(() => socket.destroy(), authTimeoutMs);
        unauthenticated.unref();
        socket.once('close', () => {
            clearTimeout(unauthenticated);
            sockets.delete(socket);
        });
        let handled = false;
        lineSplitter(socket, (line) => {
            if (handled)
                return;
            handled = true;
            let req = null;
            try {
                const parsed = JSON.parse(line);
                if ((parsed.op === 'stop' || parsed.op === 'status') && typeof parsed.token === 'string') {
                    req = { op: parsed.op, token: parsed.token, ...(parsed.op === 'stop' && parsed.force === true ? { force: true } : {}) };
                }
            }
            catch {
                req = null;
            }
            const conn = {
                send(message) {
                    if (!socket.destroyed)
                        socket.write(`${JSON.stringify(message)}\n`);
                },
                end() {
                    if (!socket.destroyed)
                        socket.end();
                },
            };
            if (!req || !tokensEqual(req.token, token)) {
                conn.send({ type: 'result', ok: false, error: 'refused: the request does not carry this share\'s run token' });
                conn.end();
                return;
            }
            clearTimeout(unauthenticated);
            const h = handler();
            if (!h) {
                // The owner is releasing the channel: the caller asks again once it is gone.
                conn.send({ type: 'result', ok: false, retry: true, error: 'the owner is shutting down' });
                conn.end();
                return;
            }
            h(req, conn);
        });
    });
}
/** A new server listening on `address`, or null when the name is taken (EADDRINUSE). */
async function tryListen(makeServer, address) {
    const server = makeServer();
    try {
        await listen(server, address);
        return server;
    }
    catch (err) {
        server.close();
        if (err.code === 'EADDRINUSE')
            return null;
        throw err;
    }
}
function listen(server, address) {
    return new Promise((resolve, reject) => {
        const onError = (err) => {
            server.removeListener('listening', onListening);
            reject(err);
        };
        const onListening = () => {
            server.removeListener('error', onError);
            resolve();
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(address);
    });
}
/** Whether something accepts connections at `address` (within `timeoutMs`). */
export function canConnect(address, timeoutMs = 2000) {
    return new Promise((resolve) => {
        const socket = createConnection(address);
        const done = (v) => {
            clearTimeout(t);
            socket.removeAllListeners();
            socket.on('error', () => undefined);
            socket.destroy();
            resolve(v);
        };
        const t = setTimeout(() => done(false), timeoutMs);
        socket.once('connect', () => done(true));
        socket.once('error', () => done(false));
    });
}
/**
 * Take the owner lock of share `id`, or report why not. On success the run
 * token is written to `<id>.owner` (0600).
 */
export async function acquireOwnerLock(opts) {
    await fs.mkdir(opts.dir, { recursive: true, mode: 0o700 });
    const address = await channelAddress(opts);
    let handler = null;
    const sockets = new Set();
    const makeServer = () => {
        const s = createServer();
        attachHandler(s, opts.token, () => handler, sockets, opts.authTimeoutMs ?? CHANNEL_AUTH_TIMEOUT_MS);
        return s;
    };
    let server;
    if (opts.flavor === 'file') {
        const r = await acquireFileLock(makeServer, address, opts);
        if (typeof r === 'string')
            return { won: false, reason: r };
        server = r;
    }
    else {
        const s = await tryListen(makeServer, address);
        if (!s)
            return { won: false, reason: 'live-owner' };
        server = s;
    }
    try {
        await writeOwnerToken(opts.dir, opts.id, opts.token);
    }
    catch (err) {
        await closeServer(server, sockets);
        throw err;
    }
    let released = null;
    const lock = {
        address,
        token: opts.token,
        flavor: opts.flavor,
        setHandler(h) {
            handler = h;
        },
        release() {
            released ??= (async () => {
                handler = null;
                await removeOwnerTokenIfOurs(opts.dir, opts.id, opts.token);
                await closeServer(server, sockets);
            })();
            return released;
        },
    };
    return { won: true, lock };
}
async function closeServer(server, sockets = new Set()) {
    // A socket file is never unlinked here: libuv unlinks it inside the close
    // itself, while the descriptor is still ours. An unlink of our own before
    // the close would let a successor bind the name, and the close would then
    // unlink the successor's socket.
    const closed = new Promise((resolve) => server.close(() => resolve()));
    // close() waits for open connections: end them, and cut any still open
    // after the grace (one that never reads, or never sent a request).
    for (const s of sockets)
        s.end();
    const cut = setTimeout(() => {
        for (const s of sockets)
            s.destroy();
    }, RELEASE_GRACE_MS);
    await closed;
    clearTimeout(cut);
}
/**
 * The macOS lock: bind `<id>.sock`; on EADDRINUSE, a connect that succeeds
 * means a live owner. A refused connect means the file is stale, and only the
 * holder of `<id>.reclaim` (created with `wx`) may remove it, after a second
 * connect under the gate is still refused. A process that read the socket as
 * stale before another reclaimed it therefore sees the new owner on its
 * second connect and backs off.
 */
async function acquireFileLock(makeServer, address, opts) {
    const first = await tryListen(makeServer, address);
    if (first)
        return first;
    if (await canConnect(address))
        return 'live-owner';
    await opts.hooks?.afterStaleRead?.();
    const gate = reclaimGatePath(opts.dir, opts.id);
    const deadline = Date.now() + (opts.gateWaitMs ?? 2000);
    for (;;) {
        if (await createGate(gate, opts.token))
            break;
        if (await removeStaleGate(gate))
            continue;
        if (Date.now() >= deadline)
            return 'reclaim-busy';
        await new Promise((r) => setTimeout(r, 50));
    }
    try {
        await opts.hooks?.underGate?.();
        if (await canConnect(address))
            return 'live-owner';
        await fs.unlink(address).catch((err) => {
            if (err.code !== 'ENOENT')
                throw err;
        });
        // Null: a fresh start bound the name between the unlink and this bind.
        return (await tryListen(makeServer, address)) ?? 'live-owner';
    }
    finally {
        await removeGateIfOurs(gate, opts.token);
    }
}
async function createGate(gate, token) {
    let handle;
    try {
        handle = await fs.open(gate, 'wx', 0o600);
    }
    catch (err) {
        if (err.code === 'EEXIST')
            return false;
        throw err;
    }
    try {
        const rec = { pid: process.pid, start: await processStartIdentity(process.pid), token, createdAt: Date.now() };
        await handle.writeFile(JSON.stringify(rec));
        await handle.sync();
    }
    finally {
        await handle.close();
    }
    return true;
}
async function readGate(gate) {
    try {
        const rec = JSON.parse(await fs.readFile(gate, 'utf8'));
        if (typeof rec.pid !== 'number' || typeof rec.token !== 'string')
            return null;
        return { pid: rec.pid, start: rec.start ?? null, token: rec.token, createdAt: Number(rec.createdAt) || 0 };
    }
    catch {
        return null;
    }
}
/**
 * Remove the gate if its writer is dead (pid plus start identity) and it is
 * older than RECLAIM_GATE_STALE_MS. Removing a stale gate is the one residual
 * race (two reclaims inside one window after a crash); the files kit's
 * mount-path uniqueness is the final guard.
 */
async function removeStaleGate(gate) {
    let st;
    try {
        st = await fs.stat(gate);
    }
    catch {
        return true; // gone: try to create it again
    }
    if (Date.now() - st.mtimeMs < RECLAIM_GATE_STALE_MS)
        return false;
    const rec = await readGate(gate);
    if (rec && rec.start && (await isSameProcessAlive(rec.pid, rec.start)))
        return false;
    await fs.unlink(gate).catch(() => undefined);
    return true;
}
async function removeGateIfOurs(gate, token) {
    const rec = await readGate(gate);
    if (rec && rec.token === token)
        await fs.unlink(gate).catch(() => undefined);
}
/**
 * Send `op` to the owner of share `id` and collect its replies until it ends
 * the connection (`onReply` sees each as it arrives). `no-owner` when nothing
 * listens; `no-token` when something listens but `<id>.owner` cannot be read
 * (another user's share, or an owner that has not written it yet).
 */
export async function requestOwner(paths, op, opts = {}) {
    const address = await channelAddress(paths);
    if (!(await canConnect(address)))
        return { reached: false, reason: 'no-owner' };
    let token = await readOwnerToken(paths.dir, paths.id);
    // The owner writes the token right after it wins the channel.
    for (let i = 0; i < 10 && !token; i++) {
        await new Promise((r) => setTimeout(r, 100));
        token = await readOwnerToken(paths.dir, paths.id);
    }
    if (!token)
        return { reached: false, reason: 'no-token' };
    const t = token;
    return new Promise((resolve) => {
        const replies = [];
        const socket = createConnection(address);
        let settled = false;
        const finish = (outcome) => {
            if (settled)
                return;
            settled = true;
            if (timer)
                clearTimeout(timer);
            socket.destroy();
            resolve(outcome);
        };
        const timer = opts.timeoutMs ? setTimeout(() => finish({ reached: true, replies }), opts.timeoutMs) : null;
        socket.on('error', () => {
            if (replies.length === 0)
                finish({ reached: false, reason: 'no-owner' });
            else
                finish({ reached: true, replies });
        });
        socket.on('close', () => {
            if (replies.length === 0)
                finish({ reached: false, reason: 'no-owner' });
            else
                finish({ reached: true, replies });
        });
        socket.once('connect', () => {
            socket.write(`${JSON.stringify({ op, token: t, ...(opts.force ? { force: true } : {}) })}\n`);
        });
        lineSplitter(socket, (line) => {
            try {
                const reply = JSON.parse(line);
                if (reply && typeof reply.type === 'string') {
                    replies.push(reply);
                    opts.onReply?.(reply);
                }
            }
            catch {
                // not a reply line
            }
        });
    });
}

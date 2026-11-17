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
import { createHash, } from 'node:crypto';
import { promises as fs, } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { exec as execCb, execFile as execFileCb } from 'node:child_process';
import { randomBytes } from 'node:crypto';
const exec = promisify(execCb);
const execFile = promisify(execFileCb);
const STATE_VERSION = 1;
/**
 * The directory holding the mount records: `<home>/.hoody/sdk/mounts`. `home` defaults to the user's home
 * directory.
 */
export function getStateDir(home = homedir()) {
    return join(home, '.hoody', 'sdk', 'mounts');
}
/**
 * The stable 16-hex id of a mount: a SHA-256 of the uid and the resolved absolute `localPath`. The path is
 * resolved, not followed through symbolic links, so the same folder reached by two spellings gets two ids.
 */
export function computeMountId(localPath, uid = userInfo().uid) {
    const canonical = resolve(localPath);
    return createHash('sha256').update(`${uid}:${canonical}`).digest('hex').slice(0, 16);
}
/** Path of the JSON record of mount `id`. */
export function stateFilePath(id, home) {
    return join(getStateDir(home), `${id}.json`);
}
/** Path of the rclone config file kept beside the record of mount `id`. */
export function configFilePath(id, home) {
    return join(getStateDir(home), `${id}.conf`);
}
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
export function cacheDirPath(id, kitUrl, home) {
    const key = createHash('sha256').update(`${id}\n${kitUrl}`).digest('hex').slice(0, 16);
    return join(getStateDir(home), 'cache', key);
}
async function ensureStateDir(home) {
    await fs.mkdir(getStateDir(home), { recursive: true, mode: 0o700 });
}
// ─── Process identity ─────────────────────────────────────────────────────
/**
 * The start time of process `pid` as an opaque string, or null when the OS cannot tell (the
 * process is gone, Windows). Linux: field 22 of `/proc/<pid>/stat` (clock ticks since boot);
 * macOS: `ps -o lstart=`. Two processes that had the same pid one after the other have
 * different start times.
 */
export async function processStartTime(pid) {
    try {
        if (process.platform === 'linux') {
            const stat = await fs.readFile(`/proc/${pid}/stat`, 'utf8');
            // The command name (field 2) is in parentheses and may hold spaces and parentheses.
            const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
            const start = fields[19];
            return start !== undefined && /^\d+$/.test(start) ? start : null;
        }
        if (process.platform === 'darwin') {
            const { stdout } = await execFile('ps', ['-o', 'lstart=', '-p', String(pid)], { timeout: 3000 });
            const start = stdout.trim();
            return start === '' ? null : start;
        }
    }
    catch {
        // gone, or unreadable
    }
    return null;
}
/**
 * The command line of process `pid`: its argv on Linux (`/proc/<pid>/cmdline`), the joined
 * command (`ps -o command=`) on macOS, null when it cannot be read.
 */
async function processCommand(pid) {
    try {
        if (process.platform === 'linux') {
            const raw = await fs.readFile(`/proc/${pid}/cmdline`, 'utf8');
            const argv = raw.split('\0');
            if (argv[argv.length - 1] === '')
                argv.pop();
            return argv.length > 0 ? argv : null;
        }
        if (process.platform === 'darwin') {
            const { stdout } = await execFile('ps', ['-ww', '-o', 'command=', '-p', String(pid)], { timeout: 3000 });
            const command = stdout.replace(/\n$/, '');
            return command === '' ? null : command;
        }
    }
    catch {
        // gone, or unreadable
    }
    return null;
}
/** Whether `arg` names an rclone executable: its last path segment is `rclone` (`rclone.exe`). */
function isRcloneName(arg) {
    return /^rclone(\.exe)?$/i.test(arg.split(/[\\/]/).pop() ?? '');
}
/**
 * Whether an argv (or a joined command line) is the rclone mount the library spawns for
 * `localPath`: an rclone executable (or `launch.binary`, also when an interpreter runs it as a
 * script) followed by exactly `mount hoody: <localPath>`, and, when `launch.confPath` is given,
 * `--config <confPath>` after it. A wrapper (`sudo hoody mount <url> <path>`, `timeout 60 hoody
 * mount …`) or any other program that only carries the same words is not.
 */
export function isMountCommandOf(command, localPath, launch = {}) {
    const { binary, confPath } = launch;
    if (Array.isArray(command)) {
        let k;
        if (command.length > 0 && (isRcloneName(command[0]) || (binary !== undefined && command[0] === binary)))
            k = 1;
        else if (binary !== undefined && command[1] === binary)
            k = 2; // an interpreter running the launched script
        else
            return false;
        if (command[k] !== 'mount' || command[k + 1] !== 'hoody:' || command[k + 2] !== localPath)
            return false;
        if (confPath === undefined)
            return true;
        for (let i = k + 3; i < command.length - 1; i++) {
            if (command[i] === '--config' && command[i + 1] === confPath)
                return true;
        }
        return false;
    }
    // A joined line (macOS) cannot say where an argument with a space ends: ` mount hoody: <path>`
    // must end at a space or the end of the line, and what comes before it must be the rclone
    // executable (a path whose last segment is rclone) or the launched binary. A directory name
    // with a space in it is read as part of that path, so `sudo /usr/bin/rclone mount hoody: <path>`
    // passes this check; the `--config` check, whose file is this mount's own, still refuses it.
    const marker = ` mount hoody: ${localPath}`;
    for (let at = command.indexOf(marker); at >= 0; at = command.indexOf(marker, at + 1)) {
        const end = at + marker.length;
        if (end < command.length && command[end] !== ' ')
            continue;
        const head = command.slice(0, at);
        const headIsRclone = /(^|\/)rclone(\.exe)?$/i.test(head)
            || (binary !== undefined && (head === binary || head.endsWith(` ${binary}`)));
        if (!headIsRclone)
            continue;
        if (confPath === undefined)
            return true;
        const tail = command.slice(end);
        const conf = ` --config ${confPath}`;
        for (let c = tail.indexOf(conf); c >= 0; c = tail.indexOf(conf, c + 1)) {
            const e = c + conf.length;
            if (e === tail.length || tail[e] === ' ')
                return true;
        }
    }
    return false;
}
/**
 * Whether `pid` is still the rclone process of a mount at `localPath`: `same`, `other` (the pid
 * now belongs to another process: a different start time than `recordedStart`, or a command
 * line that is not an rclone mount of `localPath`), `gone`, or `unknown` (it runs, but the OS
 * gives neither its start time nor its command line: Windows, or an unreadable /proc).
 */
export async function mountProcessIdentity(pid, localPath, recordedStart, launch = {}) {
    if (!pidRunning(pid))
        return 'gone';
    const start = await processStartTime(pid);
    if (recordedStart && start !== null && start !== recordedStart)
        return 'other';
    const command = await processCommand(pid);
    if (command !== null && !isMountCommandOf(command, localPath, launch))
        return 'other';
    if (start === null && command === null)
        return pidRunning(pid) ? 'unknown' : 'gone';
    return 'same';
}
/**
 * The processes running now. Linux reads every `/proc/<pid>/cmdline` (NUL-separated, so a path
 * with spaces is one argument); macOS lists every process with `ps -axww -o pid=,command=`, with
 * no name pattern, so an rclone launched under another name (`rclonePath: '/opt/bin/cloud-sync'`)
 * is listed too. Empty elsewhere and when nothing can be read.
 */
async function listProcesses() {
    const out = [];
    try {
        if (process.platform === 'linux') {
            for (const name of await fs.readdir('/proc')) {
                if (!/^\d+$/.test(name))
                    continue;
                const command = await processCommand(Number(name));
                if (command !== null)
                    out.push({ pid: Number(name), command });
            }
        }
        else if (process.platform === 'darwin') {
            const { stdout } = await execFile('ps', ['-axww', '-o', 'pid=,command='], { timeout: 3000, maxBuffer: 16 * 1024 * 1024 });
            out.push(...parsePsLines(stdout));
        }
    }
    catch {
        // nothing readable
    }
    return out;
}
/** The `<pid> <command line>` lines of `ps -o pid=,command=`. */
export function parsePsLines(stdout) {
    const out = [];
    for (const line of stdout.split('\n')) {
        const m = line.match(/^\s*(\d+) (.*)$/);
        if (m)
            out.push({ pid: Number(m[1]), command: m[2] });
    }
    return out;
}
/**
 * The pids of the rclone mounts of `localPath` now running, other than `exclude` and this
 * process: every listed process ({@link listProcesses}, or `list` in tests) that
 * {@link isMountCommandOf} accepts.
 */
export async function findMountProcesses(localPath, exclude, launch = {}, list = listProcesses) {
    const keep = (pid) => Number.isInteger(pid) && pid > 0 && pid !== exclude && pid !== process.pid;
    return (await list()).filter((p) => keep(p.pid) && isMountCommandOf(p.command, localPath, launch)).map((p) => p.pid);
}
function pidRunning(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (err) {
        return err.code === 'EPERM';
    }
}
/** The starter marker for a record this process is about to claim. */
export async function starterMarker() {
    return { pid: process.pid, start: await processStartTime(process.pid) };
}
/**
 * Whether `rec` is a mount still starting: no rclone pid recorded yet, and the process starting
 * it (its starter, by pid and start time) still runs. That process owns the record until it
 * writes the pid.
 */
export async function isStarting(rec) {
    return rec.pid === null && rec.starter !== undefined && (await starterRunning(rec.starter));
}
/** Whether the process a starter marker names is still the one that wrote it. */
async function starterRunning(starter) {
    if (typeof starter.pid !== 'number' || starter.pid <= 0 || !pidRunning(starter.pid))
        return false;
    if (!starter.start)
        return true;
    const now = await processStartTime(starter.pid);
    return now === null || now === starter.start;
}
// ─── The state lock ───────────────────────────────────────────────────────
/** How long a claim or a prune waits for another one to finish. */
const STATE_LOCK_WAIT_MS = 30_000;
/**
 * Run `fn` holding the state directory's lock file (`<state dir>/.lock`), so a claim, a
 * reclaim and a prune never run at the same time: one cannot remove or take over a record the
 * other is judging. The lock names its holder (pid and start time) and a random token; a lock
 * whose holder has ended is broken ({@link breakLock}). The file is created whole (written
 * beside it, then hard-linked into place), so it is never seen empty.
 */
export async function withStateLock(home, fn) {
    await ensureStateDir(home);
    const dir = getStateDir(home);
    const lockPath = join(dir, '.lock');
    const mine = await lockContent();
    const deadline = Date.now() + STATE_LOCK_WAIT_MS;
    for (;;) {
        if (await createWhole(dir, lockPath, mine))
            break;
        const held = await readLockGeneration(lockPath);
        if (held === null)
            continue; // released meanwhile
        // A lock that is not broken now (another process is breaking it, or its break slots are
        // used up) is waited for like a held one.
        if (!(await lockHolderRunning(held.content, held.mtimeMs)) && (await breakLock(dir, lockPath, held)))
            continue;
        if (Date.now() >= deadline) {
            throw new Error(`the mount state directory ${dir} is locked by another hoody process (${describeHolder(held.content)}); try again when it has finished`);
        }
        await new Promise((r) => setTimeout(r, 50));
    }
    try {
        return await fn();
    }
    finally {
        // Remove the lock only while it is still ours.
        try {
            if ((await fs.readFile(lockPath, 'utf8')) === mine)
                await fs.unlink(lockPath);
        }
        catch {
            // already gone
        }
    }
}
/** What a lock (or a break slot) holds: this process, its start time and a random token. */
async function lockContent() {
    return JSON.stringify({ pid: process.pid, start: await processStartTime(process.pid), token: randomBytes(8).toString('hex') });
}
/**
 * Create `path` holding `content`, only if it does not exist: written beside it, then
 * hard-linked into place, so it is never seen empty. False when it exists.
 */
async function createWhole(dir, path, content) {
    const tmp = join(dir, `.lock.${process.pid}.${randomBytes(4).toString('hex')}`);
    await fs.writeFile(tmp, content, { mode: 0o600 });
    try {
        await fs.link(tmp, path);
        return true;
    }
    catch (err) {
        const code = err.code;
        if (code === 'EEXIST')
            return false;
        // A filesystem without hard links: create the file in place (it is briefly empty).
        if (code !== 'EPERM' && code !== 'ENOTSUP' && code !== 'EOPNOTSUPP' && code !== 'ENOSYS')
            throw err;
        return createLockInPlace(path, content);
    }
    finally {
        await fs.unlink(tmp).catch(() => undefined);
    }
}
async function createLockInPlace(lockPath, content) {
    try {
        const handle = await fs.open(lockPath, 'wx', 0o600);
        try {
            await handle.writeFile(content);
        }
        finally {
            await handle.close();
        }
        return true;
    }
    catch (err) {
        if (err.code === 'EEXIST')
            return false;
        throw err;
    }
}
/** Read the lock at `path` through one open file, so content and inode are of the same file. Null when there is none. */
async function readLockGeneration(path) {
    let handle;
    try {
        handle = await fs.open(path, 'r');
    }
    catch (err) {
        if (err.code === 'ENOENT')
            return null;
        throw err;
    }
    try {
        const st = await handle.stat();
        const content = await handle.readFile('utf8');
        return { content, dev: st.dev, ino: st.ino, mtimeMs: st.mtimeMs };
    }
    finally {
        await handle.close();
    }
}
async function lockHolderRunning(held, heldSince) {
    let holder;
    try {
        holder = JSON.parse(held);
    }
    catch {
        // Not a lock withStateLock wrote whole: one being created in place is younger than 5 s.
        return Date.now() - heldSince < 5000;
    }
    if (typeof holder.pid !== 'number')
        return false;
    return starterRunning({ pid: holder.pid, start: typeof holder.start === 'string' ? holder.start : null });
}
function describeHolder(held) {
    try {
        const pid = JSON.parse(held).pid;
        return typeof pid === 'number' ? `pid ${pid}` : 'unknown holder';
    }
    catch {
        return 'unknown holder';
    }
}
/** How many break slots one stale lock has; past them it is left for a person to remove. */
const BREAK_SLOTS = 32;
/**
 * Remove the lock `judged`, whose holder has ended, without ever removing a lock taken after it.
 * True once that lock is gone; false when it is left (another process is breaking it, or its
 * slots are used up), and the caller waits as for a held lock.
 *
 * Breaking is exclusive per lock: the breaker first creates a break slot named after that one
 * lock file (its inode and content: `.lock.break.<digest>.<n>`), exclusively, then reads `.lock`
 * again and removes it only while it is still that file and its holder has still ended. Every
 * breaker of the same lock contends for the same slot, and nothing else removes a lock whose
 * holder has ended (its holder cannot release it), so between that read and the removal `.lock`
 * cannot become another lock. A breaker that finds `.lock` replaced does nothing: a lock taken
 * since is never removed, and never moved aside where a third process could take the free path.
 *
 * A slot is held only for that read and removal. A slot whose breaker ended inside it (a crash)
 * is never removed while the lock it names may still be there: the next breaker takes the next
 * slot (`.1`, `.2`, …), so two breakers never hold slots of one lock at once. Up to
 * {@link BREAK_SLOTS} breakers can crash inside one lock's slots; after that the lock is not
 * broken and the wait for it ends in the "locked by another hoody process" error. Once the lock
 * is gone, its slots are removed.
 *
 * Remaining limit: a lock created in place (a filesystem without hard links) is briefly empty,
 * and two empty locks that reuse one inode are the same lock to this check; the holder check
 * still runs again under the slot, and an empty lock younger than 5 s counts as held.
 */
async function breakLock(dir, lockPath, judged) {
    const digest = createHash('sha256').update(`${judged.dev}:${judged.ino}:${judged.content}`).digest('hex').slice(0, 16);
    const slotOf = (n) => join(dir, `.lock.break.${digest}.${n}`);
    const mine = await lockContent();
    let n = 0;
    for (let attempts = 0; n < BREAK_SLOTS && attempts < BREAK_SLOTS * 4; attempts++) {
        const slot = slotOf(n);
        if (await createWhole(dir, slot, mine)) {
            let gone = false;
            try {
                const now = await readLockGeneration(lockPath);
                if (now === null || now.dev !== judged.dev || now.ino !== judged.ino || now.content !== judged.content) {
                    gone = true; // released, or broken and taken again since: not this breaker's to remove
                }
                else if (!(await lockHolderRunning(now.content, now.mtimeMs))) {
                    await fs.unlink(lockPath);
                    gone = true;
                }
            }
            finally {
                // This slot first; the lower ones (their breakers ended) only once the lock is gone.
                await fs.unlink(slot).catch(() => undefined);
                if (gone)
                    for (let k = 0; k < n; k++)
                        await fs.unlink(slotOf(k)).catch(() => undefined);
            }
            return gone;
        }
        const owner = await readLockGeneration(slot);
        if (owner === null)
            continue; // its breaker finished meanwhile: try the slot again
        if (await lockHolderRunning(owner.content, owner.mtimeMs))
            return false; // another process is breaking it now
        n++; // its breaker ended inside it
    }
    return false;
}
/**
 * Attempt to claim a state record, holding the state lock ({@link withStateLock}). Uses
 * `fs.open(path, 'wx', 0o600)` for atomic exclusive-create. On EEXIST runs a reclaim probe:
 * if the prior mount is dead (its rclone gone and its path not mounted, and no live process is
 * still starting it), the stale record is atomically overwritten via tmp-write + rename.
 * Otherwise throws. The lock makes the probe and the overwrite one step, so two reclaims, or a
 * reclaim and a prune, cannot both act on the same record. A path that is already a mount point
 * is refused.
 */
export async function claimState(record, home) {
    await withStateLock(home, () => claimStateLocked(record, home));
}
async function claimStateLocked(record, home) {
    await claimRecord(record, home);
    // A path that is a mount point already (an empty FUSE mount passes the empty check) is not
    // claimed: the new mount's stop would unmount what another program mounted there.
    if ((await mountTableHas(record.localPath)) === true) {
        await deleteState(record.id, home);
        throw new Error(`${record.localPath} is already a mount point: unmount it first, or mount at another path`);
    }
}
async function claimRecord(record, home) {
    const target = stateFilePath(record.id, home);
    const data = JSON.stringify(record, null, 2);
    try {
        const handle = await fs.open(target, 'wx', 0o600);
        try {
            await handle.writeFile(data);
        }
        finally {
            await handle.close();
        }
        return;
    }
    catch (err) {
        if (err.code !== 'EEXIST')
            throw err;
    }
    let existing;
    try {
        existing = await readState(record.id, home);
    }
    catch {
        await atomicOverwrite(target, data);
        return;
    }
    const liveness = await checkLiveness(existing);
    if (liveness.alive === 'dead') {
        await atomicOverwrite(target, data);
        return;
    }
    throw new Error(`a mount is already registered at ${record.localPath} ` +
        `(state file ${record.id}.json, pid=${existing.pid}, ` +
        `status=${liveness.alive}). ` +
        `Run \`hoody mount --list\` for details, or \`hoody unmount ${record.id}\` to force cleanup.`);
}
async function atomicOverwrite(target, data) {
    const tmp = `${target}.tmp.${process.pid}.${randomBytes(4).toString('hex')}`;
    try {
        await fs.writeFile(tmp, data, { mode: 0o600 });
        await fs.rename(tmp, target);
    }
    catch (err) {
        await fs.unlink(tmp).catch(() => undefined);
        throw err;
    }
}
/**
 * Whether `current` (the record on disk) is still the claim `record` made: the same claim
 * token, or for a record written before tokens, the same start and the same starter.
 */
function sameClaim(current, record) {
    if (record.claimToken !== undefined || current.claimToken !== undefined)
        return current.claimToken === record.claimToken;
    return current.startedAt === record.startedAt && current.starter?.pid === record.starter?.pid;
}
/**
 * Rewrite a record this process claimed (a pid found after the claim), only while the record on
 * disk is still that claim ({@link sameClaim}); written beside it and renamed over it, so a
 * reader (list, prune) never sees it half written. False, and nothing written, when the record
 * was removed or claimed by another mount since: the caller has lost the mount point's record.
 */
export async function writeOwnState(record, home) {
    return withStateLock(home, async () => {
        let current;
        try {
            current = await readState(record.id, home);
        }
        catch {
            return false;
        }
        if (!sameClaim(current, record))
            return false;
        await atomicOverwrite(stateFilePath(record.id, home), JSON.stringify(record, null, 2));
        return true;
    });
}
/**
 * Remove the record (and its .conf) only while it is still the one `record` names
 * ({@link sameClaim}). A mount that fails, and an unmount, remove that mount's record and never
 * one another mount has claimed since.
 */
export async function deleteOwnState(record, home) {
    await withStateLock(home, async () => {
        let current;
        try {
            current = await readState(record.id, home);
        }
        catch (err) {
            if (err.code === 'ENOENT') {
                // The record is gone: remove a .conf left beside it only if no other record claims it since.
                await fs.unlink(configFilePath(record.id, home)).catch(() => undefined);
                return;
            }
            // Unreadable: claims hold the lock and write whole files, so it is the record read before.
            await deleteState(record.id, home);
            return;
        }
        if (!sameClaim(current, record))
            return;
        await deleteState(record.id, home);
    });
}
/**
 * Read the record of mount `id`. Throws when the file is missing, is not JSON, or carries a version this code does
 * not read. A record written under the older field names is returned with the current ones.
 */
export async function readState(id, home) {
    const raw = await fs.readFile(stateFilePath(id, home), 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed.version !== STATE_VERSION) {
        throw new Error(`unsupported state file version ${parsed.version} (id=${id})`);
    }
    return withCurrentNames(parsed);
}
/**
 * A record written before the computer rename names the computer `containerId` and the claim
 * authentication `containerClaim`. Both are read as the current names, so an old mount still lists,
 * unmounts by computer and unmounts by id; a record written from here on carries only the new names.
 * (The version stays 1: the record layout did not change, two names did.)
 */
function withCurrentNames(rec) {
    const old = rec;
    const out = { ...rec };
    if (typeof out.computerId !== 'string' && typeof old.containerId === 'string')
        out.computerId = old.containerId;
    delete out.containerId;
    if (old.auth !== null && typeof old.auth === 'object' && old.auth.method === 'containerClaim') {
        out.auth = { ...rec.auth, method: 'computerClaim' };
    }
    return out;
}
/**
 * Delete the record of mount `id` and its rclone config file. Never throws: a file that is already gone, or cannot
 * be removed, is ignored.
 */
export async function deleteState(id, home) {
    const jsonPath = stateFilePath(id, home);
    const confPath = configFilePath(id, home);
    await Promise.allSettled([
        fs.unlink(jsonPath),
        fs.unlink(confPath),
    ]);
}
/**
 * The ids of every mount record in the state directory (one per `.json` file, readable or not). Creates the
 * directory if it is missing.
 */
export async function listStateIds(home) {
    await ensureStateDir(home);
    let entries;
    try {
        entries = await fs.readdir(getStateDir(home), { withFileTypes: true });
    }
    catch (err) {
        if (err.code === 'ENOENT')
            return [];
        throw err;
    }
    return entries
        .filter((e) => e.isFile() && e.name.endsWith('.json'))
        .map((e) => e.name.slice(0, -5));
}
/**
 * Every readable mount record, newest first by `startedAt`. A record that cannot be read or parsed is left out,
 * not reported.
 */
export async function listStates(home) {
    const ids = await listStateIds(home);
    const out = [];
    for (const id of ids) {
        try {
            out.push(await readState(id, home));
        }
        catch {
            continue;
        }
    }
    out.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
    return out;
}
/**
 * Liveness algorithm:
 *   0. pid === null → skip 1+2; go to step 3 (mount table authoritative).
 *   1. pid <= 0 → 'dead' (legacy/corrupt file).
 *   2. kill -0 pid; if ESRCH → 'dead'.
 *   3. stat(localPath) with 1500ms timeout; on timeout hold pending step 4.
 *   4. mount table check; combined verdict.
 */
export async function checkLiveness(rec) {
    if (rec.pid !== null && rec.pid <= 0) {
        return { alive: 'dead', reason: 'legacy state file with non-positive pid' };
    }
    // A mount still starting (its pid not known yet) is alive while the process starting it runs.
    if (await isStarting(rec)) {
        return { alive: 'alive', reason: `mount is starting (pid ${rec.starter.pid})` };
    }
    if (rec.pid !== null) {
        let gone = false;
        try {
            process.kill(rec.pid, 0);
        }
        catch (err) {
            const code = err.code;
            gone = code === 'ESRCH' || code === 'ENOENT';
        }
        // A pid that now has another start time belongs to another process: the mount's has ended.
        if (!gone && rec.pidStart) {
            const start = await processStartTime(rec.pid);
            gone = start !== null && start !== rec.pidStart;
        }
        if (gone) {
            // A mount that outlived its rclone (left busy) keeps its record until it is unmounted.
            if ((await mountTableHas(rec.localPath)) === true) {
                return { alive: 'stale', reason: `pid ${rec.pid} no longer running but mountpoint still in OS mount table` };
            }
            return { alive: 'dead', reason: `pid ${rec.pid} no longer running` };
        }
    }
    let statOk = null;
    try {
        const s = await statWithTimeout(rec.localPath, 1500);
        statOk = s !== null;
    }
    catch {
        statOk = null;
    }
    const inTable = await isInMountTable(rec.localPath);
    if (inTable) {
        return rec.pid === null
            ? { alive: 'alive', reason: 'mountpoint present in OS mount table (pid was null)' }
            : { alive: 'alive', reason: 'pid alive AND mountpoint present in OS mount table' };
    }
    if (statOk === false) {
        return { alive: rec.pid === null ? 'dead' : 'stale', reason: 'mountpoint missing AND not in OS mount table' };
    }
    if (statOk === null) {
        return { alive: 'stale', reason: 'stat() blocked beyond 1500ms — FUSE mount likely hung' };
    }
    return rec.pid === null
        ? { alive: 'dead', reason: 'mountpoint absent (pid was null)' }
        : { alive: 'stale', reason: 'pid alive but mountpoint not in OS mount table' };
}
async function statWithTimeout(path, ms) {
    return new Promise((resolveP, rejectP) => {
        const timer = setTimeout(() => rejectP(new Error('stat timeout')), ms);
        fs.stat(path).then((s) => {
            clearTimeout(timer);
            resolveP(s);
        }, (err) => {
            clearTimeout(timer);
            if (err.code === 'ENOENT')
                resolveP(null);
            else
                rejectP(err);
        });
    });
}
async function isInMountTable(localPath) {
    const canonical = resolve(localPath);
    try {
        if (process.platform === 'win32') {
            const { stdout } = await exec('wmic logicaldisk get name,providername', { timeout: 5000 });
            return stdout.includes(canonical);
        }
        const { stdout } = await exec('mount', { timeout: 5000 });
        for (const line of stdout.split('\n')) {
            if (line.includes(` ${canonical} `) || line.endsWith(` ${canonical}`))
                return true;
        }
        return false;
    }
    catch {
        return false;
    }
}
/**
 * Whether `localPath` is a mount point in the OS mount table: true or false, or null when the
 * table cannot be read (and on Windows). Reads the table only and never touches the path,
 * which hangs on a dead FUSE mount. Compares both the path as given and the path with its
 * parent's symlinks resolved (macOS lists /private/tmp for /tmp).
 */
export async function mountTableHas(localPath) {
    const given = resolve(localPath);
    const candidates = new Set([given]);
    try {
        candidates.add(join(await fs.realpath(dirname(given)), basename(given)));
    }
    catch {
        // parent gone: the path as given is all there is
    }
    try {
        if (process.platform === 'linux') {
            const table = await fs.readFile('/proc/self/mounts', 'utf8');
            for (const line of table.split('\n')) {
                const field = line.split(' ')[1];
                if (field === undefined)
                    continue;
                // The kernel writes space, tab, newline and backslash as octal escapes.
                const target = field.replace(/\\([0-7]{3})/g, (_m, o) => String.fromCharCode(parseInt(o, 8)));
                if (candidates.has(target))
                    return true;
            }
            return false;
        }
        if (process.platform === 'darwin') {
            const { stdout } = await exec('mount', { timeout: 5000 });
            for (const line of stdout.split('\n')) {
                const m = line.match(/ on (.+) \([^()]*\)$/);
                if (m && candidates.has(m[1]))
                    return true;
            }
            return false;
        }
        return null;
    }
    catch {
        return null;
    }
}
/**
 * Prune dead state files AND their sibling .conf files. After the main
 * sweep, also removes orphan .conf files (no matching .json) — these can
 * appear if a crash interrupted the unmount path between unlinking .json
 * and unlinking .conf. Holds the state lock ({@link withStateLock}), so it
 * never judges a record a claim is writing; a mount still starting counts as alive.
 */
export async function pruneStale(home) {
    return withStateLock(home, () => pruneStaleLocked(home));
}
async function pruneStaleLocked(home) {
    const ids = await listStateIds(home);
    let removed = 0;
    for (const id of ids) {
        try {
            const rec = await readState(id, home);
            const liveness = await checkLiveness(rec);
            if (liveness.alive === 'dead') {
                await deleteState(id, home);
                removed++;
            }
        }
        catch {
            try {
                await deleteState(id, home);
                removed++;
            }
            catch {
                // ignore
            }
        }
    }
    let orphans = 0;
    try {
        const entries = await fs.readdir(getStateDir(home), { withFileTypes: true });
        for (const e of entries) {
            // A lock's temporary file (`.lock.<pid>.<random>`) left by a process that has ended.
            const tmpOf = e.isFile() ? /^\.lock\.(\d+)\.[0-9a-f]{8}$/.exec(e.name) : null;
            if (tmpOf && !pidRunning(Number(tmpOf[1]))) {
                await fs.unlink(join(getStateDir(home), e.name)).catch(() => undefined);
                continue;
            }
            if (!e.isFile() || !e.name.endsWith('.conf'))
                continue;
            const id = e.name.slice(0, -5);
            try {
                await fs.access(stateFilePath(id, home));
            }
            catch {
                try {
                    await fs.unlink(join(getStateDir(home), e.name));
                    orphans++;
                }
                catch {
                    // ignore
                }
            }
        }
    }
    catch {
        // empty dir or doesn't exist
    }
    return { removed, orphans };
}
/**
 * Best-effort empty-mountpoint check used as a pre-flight UX courtesy.
 * Race-free correctness is delegated to rclone (which refuses non-empty
 * mountpoints). Returns true if path is missing OR exists+empty.
 */
export async function isMountpointEmpty(localPath) {
    try {
        const s = await fs.stat(localPath);
        if (!s.isDirectory())
            return false;
        const entries = await fs.readdir(localPath);
        return entries.length === 0;
    }
    catch (err) {
        if (err.code === 'ENOENT')
            return true;
        return false;
    }
}
/** Create the parent directory of `localPath` (and any missing ancestors). The mountpoint itself is not created. */
export async function ensureMountpointParent(localPath) {
    const parent = dirname(resolve(localPath));
    await fs.mkdir(parent, { recursive: true });
}

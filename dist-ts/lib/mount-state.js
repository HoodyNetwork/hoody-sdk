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
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { exec as execCb } from 'node:child_process';
const exec = promisify(execCb);
const STATE_VERSION = 1;
export function getStateDir(home = homedir()) {
    return join(home, '.hoody', 'sdk', 'mounts');
}
export function computeMountId(localPath, uid = userInfo().uid) {
    const canonical = resolve(localPath);
    return createHash('sha256').update(`${uid}:${canonical}`).digest('hex').slice(0, 16);
}
export function stateFilePath(id, home) {
    return join(getStateDir(home), `${id}.json`);
}
export function configFilePath(id, home) {
    return join(getStateDir(home), `${id}.conf`);
}
async function ensureStateDir(home) {
    await fs.mkdir(getStateDir(home), { recursive: true, mode: 0o700 });
}
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
export async function claimState(record, home) {
    await ensureStateDir(home);
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
    const tmp = `${target}.tmp.${process.pid}`;
    await fs.writeFile(tmp, data, { mode: 0o600 });
    await fs.rename(tmp, target);
}
export async function readState(id, home) {
    const raw = await fs.readFile(stateFilePath(id, home), 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed.version !== STATE_VERSION) {
        throw new Error(`unsupported state file version ${parsed.version} (id=${id})`);
    }
    return parsed;
}
export async function deleteState(id, home) {
    const jsonPath = stateFilePath(id, home);
    const confPath = configFilePath(id, home);
    await Promise.allSettled([
        fs.unlink(jsonPath),
        fs.unlink(confPath),
    ]);
}
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
    if (rec.pid !== null) {
        try {
            process.kill(rec.pid, 0);
        }
        catch (err) {
            const code = err.code;
            if (code === 'ESRCH' || code === 'ENOENT') {
                return { alive: 'dead', reason: `pid ${rec.pid} no longer running` };
            }
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
 * Prune dead state files AND their sibling .conf files. After the main
 * sweep, also removes orphan .conf files (no matching .json) — these can
 * appear if a crash interrupted the unmount path between unlinking .json
 * and unlinking .conf.
 */
export async function pruneStale(home) {
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
export async function ensureMountpointParent(localPath) {
    const parent = dirname(resolve(localPath));
    await fs.mkdir(parent, { recursive: true });
}

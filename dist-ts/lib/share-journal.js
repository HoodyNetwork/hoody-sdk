/**
 * Per-run journals of `hoody share` (plans/share-local-folder.md, "Journals").
 *
 * Layout, in `~/.hoody/sdk/shares/` (0700):
 *   <id>.<run token>.json   one journal per run (this module)
 *   <id>.owner              the owner's run token (lib/share-lock.ts)
 *   <id>.sock, <id>.reclaim macOS only (lib/share-lock.ts)
 *
 * `id` is `sha256(<api origin>\n<container id>\n<name>)` cut to 16 hex. A
 * journal is written atomically (temp file, fsync, rename) before every remote
 * mutation, and records what that mutation may leave behind. It never holds
 * the password. It is deleted only once every remote resource it records is
 * confirmed gone; until then `hoody share stop` can finish it.
 */
import { createHash, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
export function sharesDir(home = homedir()) {
    return join(home, '.hoody', 'sdk', 'shares');
}
export function computeShareId(apiOrigin, containerId, name) {
    return createHash('sha256').update(`${apiOrigin}\n${containerId}\n${name}`).digest('hex').slice(0, 16);
}
const JOURNAL_FILE_RE = /^([0-9a-f]{16})\.([0-9a-f]{32})\.json$/;
export function journalPath(dir, id, runToken) {
    return join(dir, `${id}.${runToken}.json`);
}
export async function ensureSharesDir(dir) {
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
}
/** Write `journal` atomically: a 0600 temp file, fsync, rename, then fsync the directory. */
export async function writeJournal(dir, journal) {
    await ensureSharesDir(dir);
    journal.updatedAt = new Date().toISOString();
    const target = journalPath(dir, journal.id, journal.runToken);
    const tmp = `${target}.${randomBytes(6).toString('hex')}.tmp`;
    const handle = await fs.open(tmp, 'wx', 0o600);
    try {
        await handle.writeFile(`${JSON.stringify(journal, null, 2)}\n`);
        await handle.sync();
    }
    finally {
        await handle.close();
    }
    try {
        await fs.rename(tmp, target);
    }
    catch (err) {
        await fs.unlink(tmp).catch(() => undefined);
        throw err;
    }
    if (process.platform !== 'win32') {
        const d = await fs.open(dir, 'r').catch(() => null);
        if (d) {
            await d.sync().catch(() => undefined);
            await d.close();
        }
    }
}
export async function readJournalFile(path) {
    try {
        const j = JSON.parse(await fs.readFile(path, 'utf8'));
        if (j?.version !== 1 || typeof j.id !== 'string' || typeof j.runToken !== 'string')
            return null;
        return j;
    }
    catch {
        return null;
    }
}
/** Every readable journal in `dir`, optionally only those of share `id`. */
export async function listJournals(dir, id) {
    let names;
    try {
        names = await fs.readdir(dir);
    }
    catch (err) {
        if (err.code === 'ENOENT')
            return [];
        throw err;
    }
    const out = [];
    for (const n of names.sort()) {
        const m = n.match(JOURNAL_FILE_RE);
        if (!m || (id && m[1] !== id))
            continue;
        const j = await readJournalFile(join(dir, n));
        if (j && j.id === m[1] && j.runToken === m[2])
            out.push(j);
    }
    return out;
}
export async function deleteJournal(dir, journal) {
    await fs.unlink(journalPath(dir, journal.id, journal.runToken)).catch((err) => {
        if (err.code !== 'ENOENT')
            throw err;
    });
}
function rows(body, key) {
    if (!body || typeof body !== 'object')
        return null;
    const b = body;
    if (Array.isArray(b[key]))
        return b[key];
    const data = b.data;
    if (data && Array.isArray(data[key]))
        return data[key];
    return null;
}
/** Whether a listed mount sits at the path this journal asked for. */
export function mountPathMatches(journal, path) {
    if (journal.mountPath)
        return path === journal.mountPath;
    return path === journal.requestedMountPath || path.endsWith(`/${journal.requestedMountPath}`);
}
/**
 * Look for the resource a lost create response may have made. The files kit
 * finishes a create after the client leaves, within its 25 s update deadline,
 * so this looks every 2 s for 40 s before it concludes the resource is
 * absent. It adopts only exact matches: the backend whose user name is this
 * run's, and the mount at the recorded path whose `backend_id` is that
 * backend. Absence needs an answer to a lookup that started after `settleMs`:
 * an earlier empty answer may predate the commit. Throws when no such lookup
 * got an answer (the outcome is not known; the caller keeps `pendingCreate`).
 */
export async function findLostCreate(kit, journal, opts = {}) {
    const windowMs = opts.windowMs ?? 40_000;
    const pollMs = opts.pollMs ?? 2000;
    const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    const now = opts.now ?? Date.now;
    const kind = journal.pendingCreate;
    if (!kind)
        return {};
    if (kind === 'backend' && !journal.user)
        return {};
    if (kind === 'mount' && !journal.backendId)
        return {};
    const settleMs = opts.settleMs ?? Math.floor((windowMs * 3) / 4);
    const start = now();
    let answered = false;
    let settled = false;
    for (;;) {
        const at = now();
        try {
            if (kind === 'backend') {
                const res = await kit.request('GET', '/api/v1/backends');
                const list = res.status === 200 ? rows(res.body, 'backends') : null;
                if (list) {
                    answered = true;
                    if (at - start >= settleMs)
                        settled = true;
                    const hit = list.find((b) => b.user === journal.user && typeof b.id === 'string');
                    if (hit)
                        return { backendId: hit.id };
                }
            }
            else {
                const res = await kit.request('GET', '/api/v1/mounts');
                const list = res.status === 200 ? rows(res.body, 'mounts') : null;
                if (list) {
                    answered = true;
                    if (at - start >= settleMs)
                        settled = true;
                    const hit = list.find((m) => m.backend_id === journal.backendId &&
                        typeof m.id === 'string' &&
                        typeof m.mount_path === 'string' &&
                        mountPathMatches(journal, m.mount_path));
                    if (hit)
                        return { mountId: hit.id };
                }
            }
        }
        catch {
            // no answer: look again
        }
        if (now() - start + pollMs > windowMs)
            break;
        await sleep(pollMs);
    }
    if (!answered) {
        throw new Error(`could not reach the files kit of container ${journal.target.containerId} to look for a ${kind} whose create answer was lost`);
    }
    if (!settled) {
        throw new Error(`the files kit of container ${journal.target.containerId} stopped answering while this looked for a ${kind} whose create answer was lost; whether it exists is not known`);
    }
    return {};
}

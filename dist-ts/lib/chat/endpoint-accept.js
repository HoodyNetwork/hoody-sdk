/**
 * endpoint-accept — normalized-origin acceptance for non-default LLM and
 * docs-tool endpoints.
 *
 * Stores accepted origins at ~/.hoody/chats/chat-accept.json so the user only
 * confirms a non-allowlisted origin once. Atomic write via fs.open(path,
 * 'wx', 0o600) + rename; parent dir prepared by prepareChatsDir.
 *
 * Built-in allowlist (no prompt needed, always accepted):
 *   - chatbot.hoody.com         (docs-chatbot service)
 *   - localhost / 127.0.0.1 / ::1 / RFC1918 (local/LAN endpoints)
 *
 * For any other origin, a caller must pass `--accept-endpoint <origin>`
 * or set `HOODY_CHAT_ACCEPT_ENDPOINT` env. In TTY mode, a prompt is
 * offered. In non-TTY, the request is refused.
 */
import { open, rename, readFile, readdir, stat, lstat, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { hoodyHomeDir, platformEnvHint } from './home-dir.js';
import { join } from 'node:path';
import { normalizeOrigin, isLocalOrigin } from '../ai/provider-resolve.js';
import { prepareChatsDir } from './prepare-dir.js';
/**
 * Built-in origins that never require user acceptance. Stored as already-normalized
 * origins (scheme + lowercase host + non-default port).
 */
export const BUILTIN_ACCEPTED_ORIGINS = new Set([
    'https://chatbot.hoody.com',
]);
/** Compute the path to the per-user accept file. */
export function acceptFilePath() {
    return join(hoodyHomeDir(), '.hoody', 'chats', 'chat-accept.json');
}
/**
 * Read the accept file if it exists. Returns an empty record on:
 *   - file missing
 *   - malformed JSON
 *   - unexpected shape
 * (Never crashes chat over a corrupted preferences file.)
 */
export async function readAcceptFile() {
    const path = acceptFilePath();
    try {
        // Parity with writeAcceptFile: refuse to follow a symlinked accept
        // file. Without this, a local attacker could symlink
        // ~/.hoody/chats/chat-accept.json → ~/.ssh/id_rsa (or /etc/passwd,
        // ~/.bash_history, etc.) and then force the chat REPL to readFile
        // through the link, leaking file contents into the in-memory accept
        // list. Writing had an lstat guard already; reading did not.
        // ENOENT is the normal case (no accept file yet) → fall through.
        const s = await lstat(path);
        if (s.isSymbolicLink()) {
            if (process.stderr.isTTY) {
                process.stderr.write(`[hoody chat] Refusing to read accept file through a symlink: ${path}. ` +
                    `Delete or replace it with a regular file. Falling back to session-only acceptance.\n`);
            }
            return { origins: {} };
        }
        const raw = await readFile(path, 'utf-8');
        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && 'origins' in parsed &&
                parsed.origins !== null &&
                typeof parsed.origins === 'object') {
                return parsed;
            }
            throw new Error('accept-file shape mismatch');
        }
        catch {
            // Corrupt JSON or wrong shape. Quarantine the file before returning
            // empty so the next write doesn't silently wipe the prior file. A
            // readAcceptFile → {} → recordAcceptance → writeAcceptFile cycle
            // would otherwise overwrite a partially-damaged file that might
            // still contain recoverable origins, losing user state forever.
            try {
                const quarantine = `${path}.corrupt-${Date.now()}`;
                await rename(path, quarantine);
                if (process.stderr.isTTY) {
                    process.stderr.write(`[hoody chat] Accept file corrupted; quarantined to ${quarantine}. ` +
                        `Starting with a fresh acceptance list.\n`);
                }
            }
            catch { /* rename failed — accept the double-wipe risk */ }
            return { origins: {} };
        }
    }
    catch {
        /* missing (ENOENT) → treat as empty, no quarantine needed */
    }
    return { origins: {} };
}
/**
 * Atomically write an accept file:
 *   1. fs.open(`${path}.tmp-${rand}`, 'wx', 0o600) → create-with-mode, fail-if-exists.
 *   2. Write JSON.
 *   3. rename to final path.
 * Parent dir is prepared by prepareChatsDir. No TOCTOU between open and chmod
 * (mode is set atomically by fs.open).
 */
async function writeAcceptFile(file) {
    const dir = await prepareChatsDir();
    const path = acceptFilePath();
    // Refuse to write through a symlink. A local attacker with write access
    // to ~/.hoody/chats could otherwise pre-create chat-accept.json as a
    // symlink to ~/.bashrc (or /etc/motd, etc.); the rename() below would
    // atomically overwrite the link target. lstat resolves exactly one
    // level — if lstat says "symbolic link," we bail with an error rather
    // than silently escalating the write. ENOENT (file doesn't exist yet)
    // is the common case and is fine.
    try {
        const s = await lstat(path);
        if (s.isSymbolicLink()) {
            throw new Error(`Refusing to write accept file through a symlink: ${path}. ` +
                `Delete or replace it with a regular file before retrying.`);
        }
    }
    catch (err) {
        if (err.code !== 'ENOENT')
            throw err;
    }
    // Sweep orphan .tmp-* siblings from PRIOR crashes (mtime > 60s old). A
    // naive "unlink any .tmp-*" sweep would race with concurrent writers —
    // writer B could delete writer A's live temp file before A reaches
    // rename(), turning A's acceptance into a session-only fallback. Gating
    // on mtime keeps fresh in-flight files safe; the cleanup-after-crash
    // intent is preserved because a crash leaves the orphan untouched for
    // well over a minute before the next sweep.
    try {
        const entries = await readdir(dir);
        const now = Date.now();
        const STALE_MS = 60_000;
        for (const name of entries) {
            if (!name.startsWith('chat-accept.json.tmp-'))
                continue;
            const p = join(dir, name);
            try {
                const s = await stat(p);
                if (now - s.mtimeMs >= STALE_MS) {
                    try {
                        await unlink(p);
                    }
                    catch { /* ignore */ }
                }
            }
            catch { /* file vanished mid-sweep — fine */ }
        }
    }
    catch { /* dir missing or unreadable → fall through to write */ }
    // 8 random bytes → 16 hex chars via crypto.randomBytes. Math.random would
    // be "good enough" for a temp-file suffix in a single-process CLI, but
    // cryptographic randomness costs the same here and avoids any smell of
    // weak RNG on the filesystem.
    const suffix = randomBytes(8).toString('hex');
    const tmp = `${path}.tmp-${suffix}`;
    const handle = await open(tmp, 'wx', 0o600);
    let renamed = false;
    try {
        await handle.writeFile(JSON.stringify(file, null, 2) + '\n', 'utf-8');
        await handle.close();
        await rename(tmp, path);
        renamed = true;
    }
    finally {
        if (!renamed) {
            // Best-effort cleanup of the orphan temp file. Swallow cleanup errors —
            // the caller's error is the real one, and leaving a stray .tmp- in
            // ~/.hoody/chats/ is preferable to masking the primary failure.
            try {
                await handle.close();
            }
            catch { /* already closed */ }
            try {
                await unlink(tmp);
            }
            catch { /* nothing we can do */ }
        }
    }
}
/**
 * Check whether a given raw URL is accepted.
 *
 *   1. Normalize to an origin. Invalid URL → refused.
 *   2. Local/RFC1918 → ok (no prompt).
 *   3. Built-in allowlist → ok.
 *   4. Accept file → ok.
 *   5. `flag` override (from `--accept-endpoint`) matches this origin → ok,
 *      and persist to the accept file.
 *   6. `env` override matches → ok, persist.
 *   7. In TTY: status 'needs-tty-prompt' (caller must prompt and re-invoke
 *      confirmAcceptance()).
 *   8. Non-TTY: refused with actionable message.
 */
export async function checkAcceptance(rawUrl, opts = {}) {
    let origin;
    try {
        origin = normalizeOrigin(rawUrl);
    }
    catch (e) {
        return {
            status: 'refused',
            origin: rawUrl,
            reason: `invalid URL: ${e.message}`,
        };
    }
    if (isLocalOrigin(origin))
        return { status: 'ok', origin, reason: 'local' };
    if (BUILTIN_ACCEPTED_ORIGINS.has(origin))
        return { status: 'ok', origin, reason: 'builtin' };
    if (!opts.sessionOnly) {
        const file = await readAcceptFile();
        if (file.origins[origin])
            return { status: 'ok', origin, reason: 'file' };
    }
    if (opts.flagValue && matchesOrigin(opts.flagValue, origin)) {
        if (!opts.sessionOnly)
            await recordAcceptance(origin, 'flag');
        return { status: 'ok', origin, reason: 'flag' };
    }
    if (opts.envValue && matchesOrigin(opts.envValue, origin)) {
        if (!opts.sessionOnly)
            await recordAcceptance(origin, 'env');
        return { status: 'ok', origin, reason: 'env' };
    }
    if (opts.isTty) {
        return { status: 'needs-tty-prompt', origin };
    }
    return {
        status: 'refused',
        origin,
        reason: `${origin} is not in your accept list. Re-run with --accept-endpoint ${origin}, or persist via: ${platformEnvHint('HOODY_CHAT_ACCEPT_ENDPOINT', origin)}`,
    };
}
/** Called after a TTY prompt resolves to "y" — persist and return ok. */
export async function confirmAcceptance(origin) {
    await recordAcceptance(origin, 'tty-prompt');
    return { status: 'ok', origin, reason: 'prompt' };
}
/**
 * Match a user-supplied flag/env value (a URL or bare origin) against the
 * normalized origin we're checking.
 */
function matchesOrigin(input, normalized) {
    try {
        return normalizeOrigin(input) === normalized;
    }
    catch {
        // Input may be a bare hostname — try upgrading it to a URL for normalization.
        try {
            return normalizeOrigin(`https://${input}`) === normalized;
        }
        catch {
            return false;
        }
    }
}
/**
 * Best-effort persistence: if the write fails (readonly home, disk full,
 * parent dir vanished), we still return so the in-process acceptance stands
 * for this invocation. The only user-visible consequence is that the next
 * invocation re-prompts / re-requires the flag.
 */
async function recordAcceptance(origin, from) {
    try {
        const file = await readAcceptFile();
        file.origins[origin] = {
            acceptedAt: new Date().toISOString(),
            from,
        };
        await writeAcceptFile(file);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[hoody chat] Could not persist endpoint acceptance for ${origin} (${msg}); accepted for this session only.\n`);
    }
}

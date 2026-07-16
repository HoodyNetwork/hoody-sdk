/**
 * sessions — JSONL session store for `hoody chat`.
 *
 * Layout:
 *   ~/.hoody/chats/YYYYMMDD-HHMMSS-<shortid>.jsonl
 *
 * Each file:
 *   Line 1: {"type":"meta","id","title","createdAt","model","tier"}
 *   Line N: {"type":"turn","role","content","ts"}
 *
 * No index.json — list by readdir + first-line parse + mtime. No shared
 * mutable state → concurrent REPLs can't race (each process writes a
 * distinct file).
 *
 * All writes go through prepareChatsDir + fs.open(path, 'wx', 0o600)
 * atomic-create-with-mode. Body content and title-line are redacted
 * (chat-redact.SECRET_PATTERNS) before hitting disk — in-memory API
 * history keeps raw text so the LLM still sees what the user typed.
 *
 * Malformed JSONL → rename to <name>.bad-<unixts>.jsonl + stderr warning
 * + fresh start. No auto-delete (user may want to recover).
 */

import { open, rename, readFile, readdir, unlink, stat } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { hoodyHomeDir } from './home-dir.js';
import { prepareChatsDir } from './prepare-dir.js';
import { redactForDisk } from './redact.js';

export type TurnRole = 'user' | 'assistant' | 'system';

export interface SessionMeta {
  type: 'meta';
  id: string;
  title: string;
  createdAt: string;
  model: string;
  tier: string;
}

export interface SessionTurn {
  type: 'turn';
  role: TurnRole;
  content: string;
  ts: string;
}

export interface SessionSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  model: string;
  tier: string;
  turnCount: number;
  filePath: string;
}

export interface SessionFull {
  meta: SessionMeta;
  turns: SessionTurn[];
  filePath: string;
}

const TITLE_MAX_CHARS = 60;

/** Session filename format: YYYYMMDD-HHMMSS-<8hex>.jsonl */
const SESSION_FILE_RE = /^\d{8}-\d{6}-[0-9a-f]{8}\.jsonl$/;

function sessionsDir(): string {
  return join(hoodyHomeDir(), '.hoody', 'chats');
}

function sessionPath(fileName: string): string {
  return join(sessionsDir(), fileName);
}

function formatTimestamp(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${y}${mo}${da}-${hh}${mm}${ss}`;
}

function randomShortId(): string {
  // Cryptographic RNG keeps session IDs unguessable even across forks — not
  // security-critical (collisions are handled by retry) but removes any
  // smell of Math.random in filenames on shared hosts.
  return randomBytes(4).toString('hex');
}

/** Compose the title from the first user message (redacted, truncated). */
export function titleFromUserMessage(firstUserContent: string): string {
  const redacted = redactForDisk(firstUserContent);
  // Collapse whitespace then truncate.
  const flat = redacted.replace(/\s+/g, ' ').trim();
  return flat.length <= TITLE_MAX_CHARS ? flat : flat.slice(0, TITLE_MAX_CHARS - 1) + '…';
}

// ---------------------------------------------------------------------------
// ===== createSession =====
// ---------------------------------------------------------------------------

export interface CreateSessionOptions {
  firstUserMessage: string;
  model: string;
  tier: string;
  /** For deterministic tests. */
  now?: Date | undefined;
  id?: string | undefined;
}

/**
 * Create a new session file atomically. Returns the meta + path.
 *
 * Retention: after successful create, prune sessions beyond
 * `HOODY_CHAT_MAX_SESSIONS` (default 50) oldest-first.
 */
export async function createSession(opts: CreateSessionOptions): Promise<{
  meta: SessionMeta;
  filePath: string;
}> {
  await prepareChatsDir();
  const now = opts.now ?? new Date();
  const ts = formatTimestamp(now);
  let id = opts.id ?? randomShortId();
  let fileName = `${ts}-${id}.jsonl`;
  let filePath = sessionPath(fileName);
  let meta: SessionMeta = buildMeta(opts, now, id);

  // Atomic create-with-mode — fail if exists. Regenerate the id on collision
  // (virtually impossible given timestamp+random, but try twice to be safe).
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fh = await open(filePath, 'wx', 0o600);
      try {
        await fh.writeFile(JSON.stringify(meta) + '\n', 'utf-8');
      } finally {
        await fh.close();
      }
      await enforceRetention();
      return { meta, filePath };
    } catch (e: any) {
      if (e?.code === 'EEXIST' && !opts.id) {
        // Regenerate the random id and path — the collision is with a
        // same-second sibling, not this file.
        id = randomShortId();
        fileName = `${ts}-${id}.jsonl`;
        filePath = sessionPath(fileName);
        meta = buildMeta(opts, now, id);
        continue;
      }
      throw e;
    }
  }
  // Exhausted retries — rare enough to surface to the caller.
  throw new Error(`createSession: could not create session file after 2 attempts at ${filePath}`);
}

function buildMeta(
  opts: CreateSessionOptions,
  now: Date,
  id: string,
): SessionMeta {
  return {
    type: 'meta',
    id,
    title: titleFromUserMessage(opts.firstUserMessage),
    createdAt: now.toISOString(),
    model: opts.model,
    tier: opts.tier,
  };
}

// ---------------------------------------------------------------------------
// ===== appendTurn =====
// ---------------------------------------------------------------------------

export async function appendTurn(
  filePath: string,
  turn: Omit<SessionTurn, 'type'>,
): Promise<void> {
  await prepareChatsDir();
  const safe: SessionTurn = {
    type: 'turn',
    role: turn.role,
    content: redactForDisk(turn.content),
    ts: turn.ts,
  };
  // Open in `r+` mode: fail if the file does NOT exist. `'a'` would
  // silently create a turn-only orphan when the session file had been
  // deleted mid-REPL (e.g. the user ran `sessions delete` in another
  // terminal), leaving a JSONL lacking its meta header — unreadable by
  // `readSession`. `r+` throws ENOENT; the REPL's persistence-error path
  // then disables persistence for this session cleanly.
  const fh = await open(filePath, 'r+');
  try {
    // Manually seek to end to preserve append semantics.
    const { size } = await fh.stat();
    await fh.write(JSON.stringify(safe) + '\n', size, 'utf-8');
  } finally {
    await fh.close();
  }
}

// ---------------------------------------------------------------------------
// ===== readSession / listSessions =====
// ---------------------------------------------------------------------------

/**
 * Narrow a parsed JSON value to `SessionMeta`. Every field is type-checked
 * so a user who hand-edits a session file to put `title: 42` doesn't crash
 * `listSessions()` via `title.replace(...)` later.
 */
function coerceMeta(parsed: unknown): SessionMeta | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const p = parsed as Record<string, unknown>;
  if (p.type !== 'meta') return null;
  if (typeof p.id !== 'string' || p.id.length === 0) return null;
  if (typeof p.title !== 'string') return null;
  if (typeof p.createdAt !== 'string') return null;
  if (typeof p.model !== 'string') return null;
  if (typeof p.tier !== 'string') return null;
  return {
    type: 'meta',
    id: p.id,
    title: p.title,
    createdAt: p.createdAt,
    model: p.model,
    tier: p.tier,
  };
}

/** Narrow a parsed JSON value to `SessionTurn`. Shape-invalid lines drop. */
function coerceTurn(parsed: unknown): SessionTurn | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const p = parsed as Record<string, unknown>;
  if (p.type !== 'turn') return null;
  if (p.role !== 'user' && p.role !== 'assistant' && p.role !== 'system') return null;
  if (typeof p.content !== 'string') return null;
  if (typeof p.ts !== 'string') return null;
  return { type: 'turn', role: p.role, content: p.content, ts: p.ts };
}

/** Read a session file fully. Returns null if malformed (and quarantines it). */
export async function readSession(filePath: string): Promise<SessionFull | null> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
  const lines = raw.split(/\r?\n/).filter(l => l.length > 0);
  if (lines.length === 0) {
    await quarantine(filePath, 'empty session file');
    return null;
  }
  let meta: SessionMeta | null = null;
  try {
    meta = coerceMeta(JSON.parse(lines[0]!));
  } catch {
    /* fall through to quarantine */
  }
  if (!meta) {
    await quarantine(filePath, 'bad meta line (shape-invalid or non-JSON)');
    return null;
  }
  const turns: SessionTurn[] = [];
  for (let i = 1; i < lines.length; i++) {
    try {
      const turn = coerceTurn(JSON.parse(lines[i]!));
      if (turn) turns.push(turn);
    } catch {
      // Skip malformed individual lines. Partial-corruption tolerance is
      // intentional — a power-loss mid-write shouldn't lose the entire
      // session's earlier turns.
    }
  }
  return { meta, turns, filePath };
}

/** List all sessions sorted by mtime descending. Quarantines malformed files. */
export async function listSessions(): Promise<SessionSummary[]> {
  await prepareChatsDir();
  const dir = sessionsDir();
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const results: Array<SessionSummary & { mtime: number }> = [];
  for (const name of entries) {
    if (!SESSION_FILE_RE.test(name)) continue;
    const filePath = join(dir, name);
    // Cheap path: read the file once, JSON.parse ONLY the meta line, and
    // estimate turnCount by counting remaining non-empty lines. Avoids the
    // N-parses-per-session blowup of readSession() on big histories.
    const meta = await readSessionMetaOnly(filePath);
    if (!meta) continue; // readSession-side quarantine happens on real load
    results.push({
      id: meta.meta.id,
      title: meta.meta.title,
      createdAt: meta.meta.createdAt,
      updatedAt: new Date(meta.mtime).toISOString(),
      model: meta.meta.model,
      tier: meta.meta.tier,
      turnCount: meta.turnCount,
      filePath,
      mtime: meta.mtime,
    });
  }
  // Sort newest-first by mtime, breaking ties by createdAt DESC. On
  // filesystems with millisecond mtime granularity (or coarser), sessions
  // created in a tight loop can share an mtime — createdAt disambiguates.
  results.sort((a, b) => {
    if (b.mtime !== a.mtime) return b.mtime - a.mtime;
    return b.createdAt.localeCompare(a.createdAt);
  });
  // Strip the private mtime key before returning.
  return results.map(({ mtime: _m, ...r }) => r);
}

/**
 * Lightweight session summary — parses only the meta line and counts turn
 * lines without parsing them. Used by listSessions() so a directory of N
 * sessions with M turns each costs O(N) JSON.parse calls, not O(N·M).
 * Returns null for files that can't even yield a meta line; full
 * readSession() quarantines those on the next explicit load.
 */
async function readSessionMetaOnly(
  filePath: string,
): Promise<{ meta: SessionMeta; turnCount: number; mtime: number } | null> {
  let raw: string;
  let mtime = 0;
  try {
    raw = await readFile(filePath, 'utf-8');
    try {
      const s = await stat(filePath);
      mtime = s.mtime.getTime();
    } catch { /* ignore */ }
  } catch {
    return null;
  }
  const lines = raw.split(/\r?\n/).filter(l => l.length > 0);
  if (lines.length === 0) return null;
  let meta: SessionMeta | null = null;
  try {
    meta = coerceMeta(JSON.parse(lines[0]!));
  } catch {
    return null;
  }
  if (!meta) return null;
  return { meta, turnCount: Math.max(0, lines.length - 1), mtime };
}

/**
 * Find a session by prefix-of-id (8-hex). Used by /load, /delete with an id arg.
 * Exact match wins; otherwise the most-recent by mtime.
 *
 * Returns the single best match — callers that need to surface ambiguity
 * to the user should use `findMatchingSessions(...)` instead.
 */
export async function findSessionById(idOrPrefix: string): Promise<SessionSummary | null> {
  const matches = await findMatchingSessions(idOrPrefix);
  return matches[0] ?? null;
}

/**
 * Return ALL sessions whose id starts with `idOrPrefix`, newest-first.
 * Exact match (full 8-hex id) returns a single-element array.
 *
 * Destructive callers (`delete`, `show`) should prefer this over
 * `findSessionById` so they can detect ambiguity and error out rather than
 * silently acting on the newest match.
 */
export async function findMatchingSessions(idOrPrefix: string): Promise<SessionSummary[]> {
  const all = await listSessions();
  const exact = all.find(s => s.id === idOrPrefix);
  if (exact) return [exact];
  return all.filter(s => s.id.startsWith(idOrPrefix));
}

// ---------------------------------------------------------------------------
// ===== Delete / wipe =====
// ---------------------------------------------------------------------------

export async function deleteSession(filePath: string): Promise<void> {
  try { await unlink(filePath); } catch { /* best-effort */ }
}

/**
 * Atomically truncate a persistent session to the first `keepCount` turns.
 * Reads the current file, slices to meta + first N turns, writes to a
 * `.tmp-*` sidecar + `rename()`. `keepCount === 0` keeps only the meta
 * line (no turns).
 *
 * Used by `/retry` to drop the last exchange from disk before re-running
 * the user's question, so `--resume` later shows a clean history with the
 * retried reply only.
 */
export async function truncateSessionTurns(
  filePath: string,
  keepCount: number,
): Promise<void> {
  // Read the RAW file so the meta line is preserved byte-for-byte (including
  // any future-shape fields `coerceMeta` would drop). A quarantine-triggering
  // validation error returns early — the file is already broken; retry
  // shouldn't paper over it.
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch {
    return;
  }
  const rawLines = raw.split(/\r?\n/);
  // Trailing newline splits to '' at end; drop so indexing matches turns.
  if (rawLines.length > 0 && rawLines[rawLines.length - 1] === '') rawLines.pop();
  if (rawLines.length === 0) return; // empty → leave alone
  // Validate meta still parses; otherwise bail without rewriting.
  try { JSON.parse(rawLines[0]!); } catch { return; }
  // Line 0 is meta, lines 1..N are turns. Keep first `keepCount` turns.
  const keep = rawLines.slice(1, 1 + Math.max(0, keepCount));
  const payload = [rawLines[0]!, ...keep].join('\n') + '\n';
  // Cryptographic RNG for consistency with `randomShortId` (above) so no
  // filename on disk depends on the weaker Math.random source.
  const suffix = randomBytes(8).toString('hex');
  const tmp = `${filePath}.tmp-${suffix}`;
  const handle = await open(tmp, 'wx', 0o600);
  let renamed = false;
  try {
    await handle.writeFile(payload, 'utf-8');
    await handle.close();
    await rename(tmp, filePath);
    renamed = true;
  } finally {
    if (!renamed) {
      try { await handle.close(); } catch { /* ignore */ }
      try { await unlink(tmp); } catch { /* ignore */ }
    }
  }
}

export async function wipeAllSessions(): Promise<number> {
  const all = await listSessions();
  let count = 0;
  for (const s of all) {
    try { await unlink(s.filePath); count++; } catch { /* skip */ }
  }
  return count;
}

// ---------------------------------------------------------------------------
// ===== Retention =====
// ---------------------------------------------------------------------------

async function enforceRetention(): Promise<void> {
  const max = Number(process.env.HOODY_CHAT_MAX_SESSIONS) || 50;
  const all = await listSessions();
  if (all.length <= max) return;
  // Sort by `createdAt` ASCENDING — earliest first. `listSessions()` sorts
  // by mtime descending which is the right default for listing, but tests
  // (and strict retention ordering) need wall-clock-stable ordering that
  // doesn't depend on filesystem mtime granularity.
  const byAge = [...all].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const toDelete = byAge.slice(0, all.length - max);
  for (const s of toDelete) {
    try { await unlink(s.filePath); } catch { /* skip */ }
  }
}

// ---------------------------------------------------------------------------
// ===== Quarantine =====
// ---------------------------------------------------------------------------

async function quarantine(filePath: string, reason: string): Promise<void> {
  const ts = Math.floor(Date.now() / 1000);
  const quarantinePath = filePath.replace(/\.jsonl$/, `.bad-${ts}.jsonl`);
  try {
    await rename(filePath, quarantinePath);
    process.stderr.write(
      `[hoody chat] Session file corrupted (${reason}), quarantined to ${quarantinePath}. Starting fresh.\n`,
    );
  } catch {
    // If rename fails, there's nothing more we can do without risking
    // data loss — leave the file in place and warn.
    process.stderr.write(
      `[hoody chat] Session file corrupted (${reason}) but could not be quarantined: ${filePath}\n`,
    );
  }
}

// ---------------------------------------------------------------------------
// ===== /save promotion =====
// ---------------------------------------------------------------------------

/**
 * Promote an in-memory ephemeral session to persistent by writing all
 * collected turns atomically. Used by the REPL `/save` slash command.
 */
export async function saveEphemeralSession(params: {
  firstUserMessage: string;
  model: string;
  tier: string;
  turns: Array<Omit<SessionTurn, 'type'>>;
  now?: Date;
}): Promise<{ meta: SessionMeta; filePath: string }> {
  const created = await createSession({
    firstUserMessage: params.firstUserMessage,
    model: params.model,
    tier: params.tier,
    now: params.now,
  });
  for (const turn of params.turns) {
    await appendTurn(created.filePath, turn);
  }
  return created;
}

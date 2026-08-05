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
export type TurnRole = 'user' | 'assistant';
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
/** Compose the title from the first user message (redacted, truncated). */
export declare function titleFromUserMessage(firstUserContent: string): string;
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
export declare function createSession(opts: CreateSessionOptions): Promise<{
    meta: SessionMeta;
    filePath: string;
}>;
export declare function appendTurn(filePath: string, turn: Omit<SessionTurn, 'type'>): Promise<void>;
/** Read a session file fully. Returns null if malformed (and quarantines it). */
export declare function readSession(filePath: string): Promise<SessionFull | null>;
/** List all sessions sorted by mtime descending. Quarantines malformed files. */
export declare function listSessions(): Promise<SessionSummary[]>;
/**
 * Find a session by prefix-of-id (8-hex). Used by /load, /delete with an id arg.
 * Exact match wins; otherwise the most-recent by mtime.
 *
 * Returns the single best match — callers that need to surface ambiguity
 * to the user should use `findMatchingSessions(...)` instead.
 */
export declare function findSessionById(idOrPrefix: string): Promise<SessionSummary | null>;
/**
 * Return ALL sessions whose id starts with `idOrPrefix`, newest-first.
 * Exact match (full 8-hex id) returns a single-element array.
 *
 * Destructive callers (`delete`, `show`) should prefer this over
 * `findSessionById` so they can detect ambiguity and error out rather than
 * silently acting on the newest match.
 */
export declare function findMatchingSessions(idOrPrefix: string): Promise<SessionSummary[]>;
/** Throws on a real failure; a already-absent file is success. */
export declare function deleteSession(filePath: string): Promise<void>;
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
export declare function truncateSessionTurns(filePath: string, keepCount: number): Promise<void>;
export declare function wipeAllSessions(): Promise<{
    deleted: number;
    failed: number;
}>;
/**
 * Promote an in-memory ephemeral session to persistent by writing all
 * collected turns atomically. Used by the REPL `/save` slash command.
 */
export declare function saveEphemeralSession(params: {
    firstUserMessage: string;
    model: string;
    tier: string;
    turns: Array<Omit<SessionTurn, 'type'>>;
    now?: Date;
}): Promise<{
    meta: SessionMeta;
    filePath: string;
}>;

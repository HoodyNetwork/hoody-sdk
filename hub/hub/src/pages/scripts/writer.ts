// The writing assistant: one session of the agent's product-owned script-writer per ask, one turn in it, its reply read back
// from the session's own record. Nothing here writes a script: the reply is a proposal the person reviews.
//
// Order of one ask: create the session (Idempotency-Key) -> check what it reports (binding, owner, and that its tools are
// fixed to the script-writer ceiling) -> only then send the turn (Idempotency-Key) -> read the turn's receipt until it ends
// -> read the transcript for the answer. The session names New chat's default model (the free Hoody model), as New chat does:
//    without one the agent takes the computer's default chat agent's pin, which may be a provider with no key there.
//
// C9. A turn is sent once. If its answer is lost, the session's own list of receipts says whether it was admitted (a fresh
// session holds only this ask's turn); an empty list proves nothing, so it stays pending and is read again, never sent
// again. The session create is the one request that may be asked again, with the same Idempotency-Key: the agent answers a
// repeat of a keyed create with the same session (replayed) and never makes a second one. A turn that runs long, or a read
// that cannot be answered, is pending, never failed.
//
// Who owns an ask. The stored copy (core's hub.v3.script-asks: ids, phase, idempotency keys and time, never the prompt or the
// reply) is the one owner of whether an ask is open at a place. Each phase is written before the request it allows is sent
// (compare-and-set from the record the run last wrote: the loser sends nothing), a view that shows the answer takes it with one
// claim (compare-and-set delete: the winner shows it, the loser shows nothing and unlocks nothing), and the warned close is the
// same claim. So a view opened again, another tab, or a reload finds the ask open at its place (pending, with Check again and
// the warned close), a press there continues it, and nothing a late read or press returns can settle, deliver or replace the
// ask of another moment. What a run keeps in memory (the prompt until the turn is sent, the context of its reads, the one
// flight driving it) is only the way to continue it from the stored phase. A final answer is not kept anywhere: while the ask
// stays stored a Check again derives it again from the session's own record.
import { agentLoginOf, alive, api, capture, versionRoute, claimScriptAsk, onBump, outcomeOf, providers, putScriptAsk, readScriptAsks, budgetedStream, subscribeScriptAsks, subscribeScriptAsksVersion, stringOrEmpty as str, type Ctx, type ScriptAsk, type ScriptAskPhase, type Target } from '@core';
import { bindsComputer, checkStarted, gatedCreate } from '@ask/io';
import { newKey } from './logic';
import { routes as R } from './routes';
import type { AgentCaps } from './types';

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const SEG = /^[A-Za-z0-9._~-]{1,128}$/;

/** The agent of the script-writer: the session it starts reports this as started.tool_ceiling. */
export const WRITER_AGENT = 'script-writer';

// ── what the agent reports about itself ──────────────────────────────────────────────────────────

/** /version lists the capability as supported and available. */
export function capOn(version: unknown, name: string): boolean {
  const caps = isObj(version) && Array.isArray(version.capabilities) ? (version.capabilities as unknown[]) : [];
  for (const c of caps) if (isObj(c) && c.name === name && c.supported === true && c.available === true) return true;
  return false;
}

export type WriterState =
  | { state: 'ready'; owner: string }
  /** An agent without the script_writer capability. */
  | { state: 'old' }
  /** The agent is not signed in to an account, or its login was rejected. */
  | { state: 'login' }
  /** The agent is signed in to another account than the one the Hub shows. */
  | { state: 'account' }
  /** The login names no identity yet, or a restriction that cannot be read. */
  | { state: 'identity' };

/**
 * Whether the agent of a computer may take a writing turn for this account: it lists script_writer, it is signed in as the
 * account the Hub shows, and its identity and realm restriction are known (the session reports the owner fingerprint, which the
 * answer is checked against). `connected: true` alone proves nothing.
 */
export function writerState(version: unknown, status: unknown, account: unknown): WriterState {
  if (!capOn(version, 'script_writer')) return { state: 'old' };
  // A create names its computer (`computer`, `expected_binding.computer`): a gateway below session protocol 3, or without computer_binding, would ignore it.
  if (!bindsComputer(version)) return { state: 'old' };
  // The login part is core's one projection of the agent status (agent-signin.ts), the same the sign-in proves itself by.
  const login = agentLoginOf(status, account);
  if (login !== 'ready') return { state: login };
  return { state: 'ready', owner: String((status as Record<string, unknown>).owner_fingerprint) };
}

// ── what a session, a turn and a transcript say ──────────────────────────────────────────────────

/**
 * What the created session must say before a turn is sent to it: the binding asked for, the owner the agent reported, and the
 * script-writer ceiling. A session without that ceiling has every tool, so nothing is ever sent to it.
 */
export function startedProblem(res: unknown, want: { realm: string; container: string; owner: string }): 'BINDING' | 'NO_CEILING' | null {
  const s = isObj(res) ? res.started : undefined;
  if (!isObj(res) || !SEG.test(str(res.session_id)) || !isObj(s)) return 'BINDING';
  // The same validator as Ask's (ask/logic.ts checkStarted: the retired `container_id` is never identity evidence, alone or beside `computer_id`), then the stricter checks below.
  if (checkStarted(res, want) !== null) return 'BINDING';
  // Both fields are on every session the agent starts (only a daemon that predates them leaves them out, and it cannot prove it
  // runs on this computer in this realm): a missing or malformed one is no match.
  if (typeof s.realm_selector !== 'string' || s.realm_selector !== want.realm) return 'BINDING';
  if (typeof s.computer_id !== 'string' || s.computer_id !== want.container) return 'BINDING';
  if (typeof s.owner_fingerprint !== 'string' || s.owner_fingerprint !== want.owner) return 'BINDING';
  return s.tool_ceiling === WRITER_AGENT ? null : 'NO_CEILING';
}

const ENDED = ['completed', 'failed', 'cancelled', 'interrupted'];
export interface Receipt {
  turnId: string;
  state: string;
  ended: boolean;
  /** The agent's error code of a turn that did not complete, else its state. */
  code: string;
}
/** A turn receipt as the agent's published schema has it; null when it is not one. */
export function receiptOf(x: unknown): Receipt | null {
  if (!isObj(x) || !SEG.test(str(x.turn_id)) || typeof x.state !== 'string') return null;
  const ec = str(x.error_code);
  return { turnId: str(x.turn_id), state: x.state, ended: ENDED.includes(x.state), code: /^[a-z0-9_.-]{1,64}$/i.test(ec) ? ec : x.state };
}

/** What a transcript says about the answer: its text, that the turn has none, or that it cannot be told (read again). */
export type Reply = { kind: 'text'; text: string } | { kind: 'none' } | { kind: 'unreadable' };

// A block the agent publishes has a kind, and its text (omitted when empty) is a string. Anything else is not a block of the record.
const blockOk = (b: unknown): boolean => isObj(b) && typeof b.kind === 'string' && (b.text === undefined || typeof b.text === 'string');
const hasText = (m: Record<string, unknown>): boolean => (m.blocks as unknown[]).some((b) => isObj(b) && b.kind === 'text' && typeof b.text === 'string' && b.text.trim() !== '');

/**
 * The assistant's answer to the ask's prompt: the text blocks of the last assistant message after the prompt that has any (earlier
 * ones are talk between its tool calls). The prompt is the last user message with text (tool results are user messages without
 * any). Thinking, tool calls and their results are never part of it. A transcript that is not whole (no list, a message that is not
 * one, a block that is not one, no prompt, nothing of the assistant after it) is unreadable, never "no answer": an earlier turn's text is never taken for
 * this one, and an answer that cannot be read is not a failure of the ask.
 */
export function replyOf(transcript: unknown): Reply {
  const unreadable: Reply = { kind: 'unreadable' };
  if (!isObj(transcript) || !Array.isArray(transcript.messages)) return unreadable;
  // A transcript that says no turn was completed holds only a mid-turn tail (persisting is best effort, so a completed receipt does not
  // prove the turn's end was saved): what it holds is not the answer, nor proof there is none.
  if (transcript.turns_total !== undefined && !(typeof transcript.turns_total === 'number' && transcript.turns_total >= 1)) return unreadable;
  const msgs = transcript.messages as unknown[];
  for (const m of msgs) if (!isObj(m) || typeof m.role !== 'string' || !Array.isArray(m.blocks) || !m.blocks.every(blockOk)) return unreadable;
  const list = msgs as Array<Record<string, unknown>>;
  let from = -1;
  for (let i = list.length - 1; i >= 0; i--) if (list[i]!.role === 'user' && hasText(list[i]!)) { from = i; break; }
  if (from < 0) return unreadable;
  let seen = false;
  for (let i = list.length - 1; i > from; i--) {
    const m = list[i]!;
    if (m.role !== 'assistant') continue;
    seen = true;
    if (!hasText(m)) continue;
    const text = (m.blocks as unknown[]).filter((b) => isObj(b) && b.kind === 'text' && typeof b.text === 'string').map((b) => str((b as Record<string, unknown>).text)).join('\n');
    return { kind: 'text', text };
  }
  return seen ? { kind: 'none' } : unreadable;
}

/**
 * The prompt the ask sent, as the session's own record holds it: the text of its FIRST user message with text (an attempt's
 * session is fresh, so its first prompt is the attempt's). Never first_message (a 120-rune preview), never an assistant echo.
 * null when the transcript is not whole or holds no prompt yet.
 */
export function userPromptOf(transcript: unknown): string | null {
  if (!isObj(transcript) || !Array.isArray(transcript.messages)) return null;
  const msgs = transcript.messages as unknown[];
  for (const m of msgs) if (!isObj(m) || typeof m.role !== 'string' || !Array.isArray(m.blocks) || !m.blocks.every(blockOk)) return null;
  const first = (msgs as Array<Record<string, unknown>>).find((m) => m.role === 'user' && hasText(m));
  if (!first) return null;
  return (first.blocks as unknown[]).filter((b) => isObj(b) && b.kind === 'text' && typeof b.text === 'string').map((b) => str((b as Record<string, unknown>).text)).join('\n');
}

// ── one ask ──────────────────────────────────────────────────────────────────────────────────────

export type AiOutcome = 'done' | 'pending' | 'failed' | 'not_sent' | 'stale';
export interface AiAnswer {
  outcome: AiOutcome;
  data?: { reply: string };
  code?: string;
}

/** Where an ask stands: each phase is entered once, and a Check again resumes the phase it stopped in. */
type Phase = 'create' | 'turn' | 'lost' | 'wait' | 'read';

export interface WriterRun {
  ctx: Ctx;
  target: Target;
  /** The place this ask belongs to (computer, script, realm, owner) as its stored id: what finds it again after the view is reopened. */
  key: string;
  compId: string;
  path: string | null;
  realm: string;
  owner: string;
  createKey: string;
  turnKey: string;
  /** The prompt, kept only until the turn is sent (it holds the masked code, never a secret). */
  text: string | null;
  /** What the caller hid from the prompt: moved into `held` once the store has admitted the ask (never kept on the run after that). */
  values?: unknown;
  sid: string | null;
  turnId: string | null;
  phase: Phase;
  /** The view that is waiting for this ask now: its `stop` ends the wait (the ask stays, to be checked again). */
  signal: { stop: boolean };
  /** The drive that is running this ask, while one is: a second press or a reopened view joins it, never starts another. */
  flight: Promise<AiAnswer> | null;
  /** The record this run last wrote (or restored): the `prev` of its next compare-and-set. Null until the first write. */
  stored: ScriptAsk | null;
  /** The ask was closed, or taken over by another view or tab, since: this run sends and delivers nothing more. */
  dead: boolean;
  /**
   * A New script build's send condition (the Hub shows the bound computer): core's api() asks it at the moment each request would
   * go out (`still`), after every wait before it, so a switch at any point leaves the next request unsent. Requests already sent
   * keep their outcome (a turn that may be out stays read back). Absent: no condition (the shown-computer asks).
   */
  still?: () => boolean;
  /** A session create of this run may have reached the agent (an answer was lost): from then on no later create attempt, of this
   *  drive or a later one, can say it did not, so a refused or unsent one leaves the ask pending (C9), never ended. */
  createOut?: boolean;
}

/** An ask stored at its first phase, with no run, this old never sent a turn (its session create is a matter of seconds). */
const EARLIER_UNSENT_MS = 10 * 60_000;

/** Waiting for a turn: how often its receipt is read, and how long one press waits before it is pending. Tests move them. */
export const timing = { everyMs: 1500, wakeMs: 300, maxMs: 300_000 };

/**
 * The runs of the asks of this page, by the place that made them (computer, script, realm and the agent's owner): a Check again,
 * and a new ask there, continue the one of their place. The realm and the owner are part of the place, so an ask of another
 * realm or account is never taken for this one. A run is only the way to continue a stored ask: whether an ask is open is what
 * the store says.
 */
const runs = new Map<string, WriterRun>();
export interface Place { compId: string; path: string | null; realm?: string | null; owner?: string }
const placeOf = (p: Place): string => [p.compId, p.path ?? '', p.realm ?? '', p.owner ?? ''].join('\u0000');

/** 53-bit string hash (cyrb53): two of them name a place in 22 characters, whatever the length of its script path. */
function hash53(s: string, seed: number): string {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
/** The stored id of an ask: one per place, so two tabs pressing Ask at one place cannot both store one. */
export const askIdOf = (p: Place): string => {
  const k = placeOf(p);
  return `ask-${hash53(k, 0)}-${hash53(k, 1)}`;
};
export const runOf = (p: Place): WriterRun | undefined => runs.get(askIdOf(p));
/** The place path of attempt `n` of a New script draft: each attempt is its own ask, so Build again
 *  never continues the attempt before it. Never a script path (a script path has no `:`). */
/**
 * The place path of a New script attempt: the bound computer's project, the draft and the attempt number. The project is part of
 * the ask's identity (a container id alone is not unique across projects), so an ask of one project is never found, continued or
 * stopped for another, in memory or from the store.
 */
export const attemptPath = (project: string, draftId: string, n: number): string => `new:${project}/${draftId}.${n}`;
const PROJECT = /^[A-Za-z0-9_-]{1,64}$/;
export const projectOk = (p: unknown): p is string => typeof p === 'string' && PROJECT.test(p);
/** An attempt path read back: its project, draft and number; null when the path is not one. */
export function attemptOf(path: unknown): { project: string; draftId: string; n: number } | null {
  const m = typeof path === 'string' ? /^new:([A-Za-z0-9_-]{1,64})\/([0-9a-z]{10})\.([1-9][0-9]{0,2})$/.exec(path) : null;
  return m ? { project: m[1]!, draftId: m[2]!, n: Number(m[3]) } : null;
}
/**
 * Whether a run or record may be used for the computer `t`: an attempt place names its project, which must be t's; a run in
 * memory carries the computer it was made for, which must be t (same project and container). Anything else is another computer's.
 */
export function placeFits(path: string | null, t: Target, run?: WriterRun | null): boolean {
  if (run && (run.target.project.id !== t.project.id || run.target.container.id !== t.container.id)) return false;
  if (typeof path === 'string' && path.startsWith('new:')) { const a = attemptOf(path); return !!a && a.project === t.project.id; }
  return true;
}

// What the page re-renders on: this tab's own writes and other tabs' (their storage events).
let version = 0;
const listeners = new Set<() => void>();
let unwatch: (() => void) | null = null;
const bump = (): void => { version++; for (const f of [...listeners]) f(); };
export function subscribeAsks(fn: () => void): () => void {
  listeners.add(fn);
  if (listeners.size === 1) unwatch = subscribeScriptAsks(bump);
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && unwatch) { unwatch(); unwatch = null; }
  };
}
export const asksVersion = (): number => version;

/** The stored ask of a place: the record, none, or 'unreadable' (storage cannot be read: an absent ask then proves nothing). */
export function storedAsk(p: Place): ScriptAsk | null | 'unreadable' {
  const all = readScriptAsks();
  pruneHeld(all);
  if (all === 'unreadable') return 'unreadable';
  const id = askIdOf(p);
  return all.find((r) => r.askId === id) ?? null;
}
/**
 * Whether an ask is open at the place: it is stored, and so it is pending, never free, until a view claims its answer or the person
 * closes it. 'unreadable': the store could not be read, which proves neither that an ask is out nor that none is.
 */
export const openRun = (p: Place): boolean | 'unreadable' => {
  const s = storedAsk(p);
  if (s === 'unreadable') return s;
  return s !== null;
}

/** The answers of asks whose turn may have been sent, with the record each one was derived from: what a claim removes. */
const via = new WeakMap<AiAnswer, ScriptAsk>();
const isFinal = (a: AiAnswer): boolean => a.outcome === 'done' || a.outcome === 'failed' || a.outcome === 'not_sent';
/** The incarnation of the ask each answer belongs to (its record's create key): two asks at one place never share one. */
const incarnations = new WeakMap<AiAnswer, string>();
/** Which ask an answer came from, or null when it is not known: a view binds what it kept for the ask (masked secrets) to it. */
export const incarnationOf = (a: AiAnswer): string | null => incarnations.get(a) ?? null;
/**
 * The hidden values of the asks this tab started (the plain values the drawer masked out of the prompt, kept to put them back
 * into the answer), by the ask's create key. They live here, in memory only, never in the store and never in a view, and only
 * for an ask the store admitted and only if nothing moved while it was being admitted (a refused ask holds nothing, so it can never
 * push out the values of a live one). They are deleted when the ask ends or is replaced: the claim that delivers it, the warned
 * close, a run that lost its ask or ended before a turn could be sent, and `pruneHeld` whenever the store changes (this tab's own
 * writes, other tabs' storage events, a drop by the sign-out) or is read: an ask the store no longer holds takes its values with
 * it, whether or not a view is mounted. The end of the account clears them all. An ask continued from the store, another tab's or
 * one from before a reload, has none: its answer is not unmasked.
 */
const held = new Map<string, unknown>();
let unwatchHeldStore: (() => void) | null = null;
/** Keeps the registry in step with the store for as long as it holds anything, independent of the views. */
function watchHeld(): void {
  if (unwatchHeldStore === null && held.size > 0) unwatchHeldStore = subscribeScriptAsksVersion(() => pruneHeld());
}
function unwatchHeld(): void {
  if (held.size === 0 && unwatchHeldStore !== null) { const off = unwatchHeldStore; unwatchHeldStore = null; off(); }
}
function holdValues(createKey: string, values: unknown): void {
  if (values === undefined) return;
  held.set(createKey, values);
  watchHeld();
}
const release = (createKey: string | null | undefined): void => {
  if (createKey) held.delete(createKey);
  unwatchHeld();
};
/** The hidden values of the ask an answer came from, or undefined when this tab holds none for it (read before the claim). */
export const valuesOf = (a: AiAnswer): unknown => {
  const inc = incarnations.get(a);
  return inc === undefined ? undefined : held.get(inc);
};
/** Drops the values of every ask the store (as just read, or read now) no longer holds. A store that cannot be read proves nothing. */
function pruneHeld(all: ScriptAsk[] | 'unreadable' = readScriptAsks()): void {
  if (held.size === 0 || all === 'unreadable') return;
  const stored = new Set(all.map((r) => r.createKey));
  for (const k of [...held.keys()]) if (!stored.has(k)) held.delete(k);
  unwatchHeld();
}
/** The store still holds the ask this run wrote (its id and its create key). An unreadable store proves nothing, so it does not. */
function isStored(rec: WriterRun): boolean {
  const all = readScriptAsks();
  return all !== 'unreadable' && all.some((r) => r.askId === rec.key && r.createKey === rec.createKey);
}
/**
 * The account ends (sign-out, a purge, another tab's session replacing this one, suspension) and tests: forget every hidden value,
 * the ones held and the ones still on a run waiting for the store to admit its ask.
 */
export const forgetHeldValues = (): void => {
  held.clear();
  for (const r of runs.values()) r.values = undefined;
  unwatchHeld();
};
// Core's own account-end signal: endAccount bumps with one of these reasons, whether or not an auth purge ran (a logout that finds
// another tab's newer session purges nothing). A realm switch or fallback keeps the asks, so it keeps their values too.
const ENDS_ACCOUNT: ReadonlySet<string> = new Set(['account', 'signout', 'logout', 'suspended']);
onBump((reason) => { if (ENDS_ACCOUNT.has(reason)) forgetHeldValues(); });
/** Tests: how many asks this tab holds hidden values for. */
export const heldCount = (): number => held.size;
/** Answers of an ask this press did not make: it found one already out at its place (a run, a stored record) and continued it
 *  instead of sending its own prompt, so what the presser kept for its own prompt (masked secrets) does not belong to it. */
const joinedAnswers = new WeakSet<AiAnswer>();
/** The answer as the joining press gets it: a copy, so the press that made the ask is never told it joined (the run hands both
 *  one answer), claiming either claims the same record. */
export const markJoined = (a: AiAnswer): AiAnswer => {
  const c: AiAnswer = { ...a };
  const rec = via.get(a);
  if (rec) via.set(c, rec);
  const inc = incarnations.get(a);
  if (inc !== undefined) incarnations.set(c, inc);
  joinedAnswers.add(c);
  return c;
};
export const joinedOf = (a: AiAnswer): boolean => joinedAnswers.has(a);
/**
 * A view that shows the place takes the answer it was handed: one compare-and-set delete of the record the answer came from.
 * True for the winner, who shows it. False for the loser (another view, tab or the warned close took the ask, or it was replaced
 * by a newer ask at that place, or the store refused): it shows nothing, settles nothing and unlocks nothing. An answer of an ask
 * that never reached the turn has no record left and is the caller's.
 */
export async function claimAnswer(a: AiAnswer, eligible?: () => boolean): Promise<boolean> {
  // Only a final answer is delivered: a pending or stale one (the ask was closed or taken) has nothing to hand over.
  if (!isFinal(a)) return false;
  const rec = via.get(a);
  if (!rec) return true;
  // `eligible` is asked while the store is held (the same locked step that removes the record): a view that left the place
  // leaves the ask stored for the next view there (or the warned close), untouched. Nothing is taken out and put back.
  const w = await claimScriptAsk(rec, eligible);
  if (w !== 'ok') return false;
  // The ask ends with this claim, and its hidden values with it (the caller read them before claiming).
  release(rec.createKey);
  bump();
  return true;
}
/**
 * The warned "Close without knowing": the person ends the ask stored at this place knowingly, with the same claim a delivery
 * makes (whichever comes first wins). Its run, if any, sends and delivers nothing more.
 */
/** The warned close: 'ok' when no ask is stored at the place any more (this close removed it, or there was none), 'unknown' when
 *  the store could not be read or refused the removal (the ask may still be stored). `removed` gets the ask exactly as this close
 *  removed it (it may be newer than the caller's copy: another tab can store a turn meanwhile). */
export async function closeAsk(p: Place, removed?: (a: ScriptAsk) => void): Promise<'ok' | 'unknown'> {
  const id = askIdOf(p);
  const run = runs.get(id);
  if (run) { run.dead = true; run.text = null; run.values = undefined; runs.delete(id); release(run.createKey); }
  const s = storedAsk(p);
  if (s === null) return 'ok';
  if (s === 'unreadable') return 'unknown';
  if ((await claimScriptAsk(s)) !== 'ok') return 'unknown';
  bump();
  removed?.(s);
  return 'ok';
}
/** Tests: forget every run in memory (the stored asks are the store's). */
export const forgetRuns = (): void => { runs.clear(); forgetHeldValues(); };

export interface AiVars {
  compId: string;
  path: string | null;
  text: string;
  /** The realm the agent's routes are called in and the owner the agent reported (CompScripts.agentRealm, AgentCaps.writerOwner). */
  realm?: string | null;
  owner?: string;
  /** What the caller hid from `text` to put back into the answer: held in memory under the new ask's create key (see `held`), never stored. */
  values?: unknown;
}

const done = (reply: string): AiAnswer => ({ outcome: 'done', data: { reply } });
const left = (outcome: Exclude<AiOutcome, 'done'>, code: string): AiAnswer => ({ outcome, code });

/** A rejection as an answer: a pending one stays pending (never failed), a refusal the agent made is failed, one never sent is not_sent. */
function answerOf(e: unknown, code: string): AiAnswer {
  const o = outcomeOf(e, true);
  const c = isObj(e) && typeof e.code === 'string' && /^[a-z0-9_.-]{1,64}$/i.test(e.code) ? e.code : code;
  return left(o, o === 'pending' ? code : c);
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export function startRun(v: AiVars, env: { target: Target; realm: string; owner: string; still?: () => boolean }, mint: () => string = () => newKey((n) => crypto.getRandomValues(new Uint8Array(n)))): WriterRun {
  const createKey = mint();
  return { ctx: capture(env.target), target: env.target, key: askIdOf({ compId: v.compId, path: v.path, realm: env.realm, owner: env.owner }), compId: v.compId, path: v.path, realm: env.realm, owner: env.owner, createKey, turnKey: mint(), text: v.text, values: v.values, sid: null, turnId: null, phase: 'create', signal: { stop: false }, flight: null, stored: null, dead: false, ...(env.still ? { still: env.still } : {}) };
}

/**
 * An ask found in the store with no run in memory (a reload, another tab, a view opened again after its tab's run was dropped):
 * continued from its stored phase, with the context of the computer shown now. It has no prompt, so it can only be read, never
 * sent; null when the record lacks what a read needs.
 */
export function restoreRun(s: ScriptAsk, env: { target: Target; still?: () => boolean }): WriterRun | null {
  if (!s.realm || !s.owner || !placeFits(s.path, env.target)) return null;
  return { ctx: capture(env.target), target: env.target, key: s.askId, compId: s.compId, path: s.path, realm: s.realm, owner: s.owner, createKey: s.createKey, turnKey: s.turnKey, text: null, sid: s.sessionId, turnId: s.turnId, phase: s.phase === 'turn' ? 'create' : s.phase, signal: { stop: false }, flight: null, stored: s, dead: false, ...(env.still ? { still: env.still } : {}) };
}

/** The record of a run at a phase: its identity (never the prompt) and where it stands. */
function recordOf(rec: WriterRun, at: { phase: ScriptAskPhase; sessionId?: string; turnId?: string }): ScriptAsk {
  const was = rec.stored;
  const fit = (x: string | null): string | null => (x !== null && x.length > 0 ? x.slice(0, 128) : null);
  return {
    askId: rec.key, compId: rec.compId, path: fit(rec.path), realm: rec.realm, owner: rec.owner,
    sessionId: at.sessionId ?? was?.sessionId ?? null, turnId: at.turnId ?? was?.turnId ?? null, phase: at.phase,
    sentAt: was?.sentAt ?? Date.now(), createKey: rec.createKey, turnKey: rec.turnKey,
  };
}
/**
 * Writes the next phase of the run, a compare-and-set from the record it last wrote: 'ok', 'superseded' (the ask was claimed,
 * closed or moved by another view or tab: this run does nothing more) or 'refused' (the store could not keep it).
 */
async function persist(rec: WriterRun, at: { phase: ScriptAskPhase; sessionId?: string; turnId?: string }): Promise<'ok' | 'superseded' | 'refused'> {
  const next = recordOf(rec, at);
  const w = await putScriptAsk(next, rec.stored);
  if (w === 'ok') { rec.stored = next; bump(); return 'ok'; }
  return w === 'changed' ? 'superseded' : 'refused';
}
/** This run no longer owns its ask: it sends, reads and delivers nothing more. */
function supersede(rec: WriterRun): AiAnswer {
  rec.dead = true;
  rec.text = null;
  if (runs.get(rec.key) === rec) runs.delete(rec.key);
  return left('stale', 'SUPERSEDED');
}

/** An ask continued from an earlier view: it reads with the context of the computer shown now (its own may be gone with that view). */
// The caller's send condition replaces the run's: the view driving it now decides (none: the shown-computer asks).
export function resume(rec: WriterRun, target: Target, still?: () => boolean): WriterRun {
  if (!alive(rec.ctx)) { rec.ctx = capture(target); rec.target = target; }
  if (still) rec.still = still; else delete rec.still;
  return rec;
}

const call = (rec: WriterRun) => ({ ctx: rec.ctx, target: rec.target, realm: rec.realm, recovers: true, ...(rec.still ? { still: rec.still } : {}) }) as const;
/** The run's send condition fails now: its next request is not made (a read waits for a Check again; nothing is decided). */
const paused = (rec: WriterRun): boolean => { try { return !!rec.still && !rec.still(); } catch { return true; } };

/** The session: made with its Idempotency-Key; an answer lost is asked once more with that same key (the agent answers with the same session). */
async function createStep(rec: WriterRun): Promise<AiAnswer | null> {
  // An earlier ask that never got a session (its tab went away, or it is another tab's still): there is no prompt to send and no
  // session to read. It stays open until its own run ends it, or the person closes it knowingly; one that old is nobody's.
  if (rec.text === null) {
    if (rec.stored && Date.now() - rec.stored.sentAt > EARLIER_UNSENT_MS && (await claimScriptAsk(rec.stored)) === 'ok') { bump(); rec.dead = true; return left('not_sent', 'EARLIER_UNSENT'); }
    return left('pending', 'EARLIER_ASK');
  }
  // Stored before anything is sent: a place holds one ask, so another tab or view that stored one first leaves this one unsent.
  if (rec.stored === null) {
    const w = await persist(rec, { phase: 'create' });
    const values = rec.values;
    rec.values = undefined;
    if (w === 'superseded') { rec.dead = true; return left('pending', 'ASK_OPEN'); }
    if (w === 'refused') return left('not_sent', 'NO_RECORD');
    // Handed over only while nothing has moved since the ask began: the account (alive) and the record this run just wrote (still
    // stored, this write's create key). Otherwise the values are dropped, and a run that cannot restore its answer sends nothing:
    // it ends here as not sent (the end of a drive removes its record if it still can) and it never continues, so a later check
    // finds no prompt to send, whatever the store reads then.
    if (!(alive(rec.ctx) && isStored(rec))) {
      rec.text = null;
      return left('not_sent', 'NOT_KEPT');
    }
    holdValues(rec.createKey, values);
  }
  const body = { agent: WRITER_AGENT, model: providers.FREE, realm: rec.realm, computer: rec.compId, tool_mode: 'standard', dir_scope: 'home', approval: { mode: 'default' }, expected_binding: { realm: rec.realm, computer: rec.compId } };
  let res: unknown;
  for (let i = 0; i < 2; i++) {
    try {
      res = await gatedCreate(() => api(versionRoute, { ctx: rec.ctx, target: rec.target, recovers: true, ...(rec.still ? { still: rec.still } : {}) } as never), () => api(R.sessionCreate, { ...call(rec), body, idem: rec.createKey } as never));
      break;
    } catch (e) {
      // A create whose answer was lost may have made the session. Every later attempt carries the same key: one refused or never
      // sent says nothing of that first one, in this drive or a later Check again, so the ask stays pending until an answer names it.
      if (outcomeOf(e, true) === 'pending') rec.createOut = true;
      if (rec.createOut) { if (i === 1 || outcomeOf(e, true) !== 'pending') return left('pending', 'CREATE_UNKNOWN'); continue; }
      return answerOf(e, 'CREATE_FAILED');
    }
  }
  const bad = startedProblem(res, { realm: rec.realm, container: rec.compId, owner: rec.owner });
  // Nothing was sent to it: it has no prompt, so the agent discards it by itself.
  if (bad) return left('not_sent', bad);
  rec.sid = str((res as Record<string, unknown>).session_id);
  rec.phase = 'turn';
  return null;
}

async function turnStep(rec: WriterRun): Promise<AiAnswer | null> {
  if (!rec.sid || rec.text === null) return left('failed', 'NO_SESSION');
  // From here the turn may be admitted whatever comes back: the ask is "lost" until a receipt or the session's list says otherwise,
  // and the prompt is not kept (it is never sent again).
  const text = rec.text;
  // Stored before it is sent, from the record this run wrote: if it was claimed or closed meanwhile (or the store cannot keep it)
  // the turn is not sent at all.
  const w = await persist(rec, { phase: 'lost', sessionId: rec.sid });
  if (w === 'superseded') return supersede(rec);
  if (w === 'refused') return left('not_sent', 'NO_RECORD');
  rec.text = null;
  rec.phase = 'lost';
  try {
    const r = receiptOf(await api(R.turn, { ...call(rec), params: { sid: rec.sid }, body: { text }, idem: rec.turnKey } as never));
    if (!r) return null;
    rec.turnId = r.turnId;
    rec.phase = 'wait';
    return (await persist(rec, { phase: 'wait', turnId: r.turnId })) === 'superseded' ? supersede(rec) : null;
  } catch (e) {
    // A refusal the agent made (or a send that never left) ends the ask; anything that may have gone through is read back.
    return outcomeOf(e, true) === 'pending' ? null : answerOf(e, 'TURN_REFUSED');
  }
}

/** The turn's answer was lost: the session's receipts say whether it was admitted. Never a second send. */
async function lostStep(rec: WriterRun): Promise<AiAnswer | null> {
  if (!rec.sid) return left('failed', 'NO_SESSION');
  if (paused(rec)) return left('pending', 'NOT_SHOWN');
  let raw: unknown;
  try {
    raw = await api(R.turns, { ...call(rec), params: { sid: rec.sid } } as never);
  } catch (e) {
    return outcomeOf(e) === 'stale' ? left('stale', 'STALE') : left('pending', 'TURN_UNKNOWN');
  }
  // The list must be this session's, whole: one element that is not a receipt, or another session's list, proves nothing.
  const list = isObj(raw) && raw.session_id === rec.sid && Array.isArray(raw.turns) ? (raw.turns as unknown[]) : null;
  const rows = list ? list.map(receiptOf) : [];
  // A fresh session holds only this ask's turn: one receipt is it. None proves nothing (it may still be admitted), several are not ours.
  if (!list || rows.length !== 1 || !rows[0]) return left('pending', 'TURN_UNKNOWN');
  rec.turnId = rows[0].turnId;
  rec.text = null;
  rec.phase = 'wait';
  // (A store that cannot keep the phase is not a reason to stop reading: the stored 'lost' is read the same way after a reload.)
  return (await persist(rec, { phase: 'wait', turnId: rows[0].turnId })) === 'superseded' ? supersede(rec) : null;
}

/** Wait for the turn to end. A frame of the session's stream only wakes the next read; the receipt is what decides. */
async function waitStep(rec: WriterRun): Promise<AiAnswer | null> {
  if (!rec.sid || !rec.turnId) return left('failed', 'NO_SESSION');
  if (paused(rec)) return left('pending', 'NOT_SHOWN');
  let wake: (() => void) | null = null;
  let woke = false;
  const nudge = (): void => { woke = true; if (wake) { const w = wake; wake = null; w(); } };
  // The stream only wakes the next receipt read early. A run under a send condition (a New script build) never opens it: core
  // opens a stream when its budget grants a slot, later, and does not ask the condition then, so the receipts are polled instead
  // (each read asks the condition as it goes out).
  const opened = rec.still ? { close: () => {} } : budgetedStream(R.stream, { ctx: rec.ctx, target: rec.target, realm: rec.realm, params: { sid: rec.sid }, onEvent: nudge } as never, { key: `${rec.realm}/${rec.sid}` });
  const t0 = Date.now();
  let bad = 0;
  try {
    for (;;) {
      if (rec.dead) return left('stale', 'SUPERSEDED');
      if (rec.signal.stop || !alive(rec.ctx)) return left('stale', 'STALE');
      if (paused(rec)) return left('pending', 'NOT_SHOWN');
      try {
        const r = receiptOf(await api(R.turnRead, { ...call(rec), params: { sid: rec.sid, tid: rec.turnId } } as never));
        bad = 0;
        if (r?.ended) {
          if (r.state === 'completed') {
            rec.phase = 'read';
            return (await persist(rec, { phase: 'read' })) === 'superseded' ? supersede(rec) : null;
          }
          // An assistant that only reads: a turn that did not complete changed nothing, so it is a plain failure.
          return left('failed', r.code);
        }
      } catch (e) {
        if (outcomeOf(e) === 'stale') return left('stale', 'STALE');
        if (++bad >= 3) return left('pending', 'RECEIPT_UNREADABLE');
      }
      if (Date.now() - t0 >= timing.maxMs) return left('pending', 'TURN_RUNNING');
      // A frame that came while the receipt was being read counts: the next read follows it at once (after a short pause).
      if (!woke) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([new Promise<void>((r) => { timer = setTimeout(r, timing.everyMs); }), new Promise<void>((r) => { wake = r; })]);
        clearTimeout(timer);
      }
      const early = woke;
      woke = false;
      wake = null;
      if (early) await sleep(timing.wakeMs);
    }
  } finally {
    opened.close();
  }
}

async function readStep(rec: WriterRun): Promise<AiAnswer> {
  if (!rec.sid) return left('failed', 'NO_SESSION');
  if (paused(rec)) return left('pending', 'NOT_SHOWN');
  try {
    const reply = replyOf(await api(R.transcript, { ...call(rec), params: { sid: rec.sid } } as never));
    // A transcript that cannot be read whole is read again; only a whole one with no answer text in it ends the ask as failed.
    if (reply.kind === 'unreadable') return left('pending', 'REPLY_UNREADABLE');
    return reply.kind === 'none' ? left('failed', 'NO_REPLY') : done(reply.text);
  } catch (e) {
    return outcomeOf(e) === 'stale' ? left('stale', 'STALE') : left('pending', 'REPLY_UNREADABLE');
  }
}

/**
 * Run an ask from the phase it is in until it ends or must wait for a Check again. A run that is already being driven is joined,
 * never driven twice (the same view pressed again, or reopened: `signal` is then the waiting view's). An ask that ended with an
 * answer, a refusal or no send is forgotten; one that is pending stays, and so does one cut off (stale) after its turn may have
 * been sent: only the person's warned close, or a read that proves the outcome, ends it.
 */
export function advance(rec: WriterRun, signal: { stop: boolean } = { stop: false }): Promise<AiAnswer> {
  if (rec.dead) return Promise.resolve(left('stale', 'SUPERSEDED'));
  rec.signal = signal;
  // A run already registered for the ask stays the one the place's views join: a second one for the same ask (a press that found the
  // place taken) never replaces it.
  const cur = runs.get(rec.key);
  if (!cur || cur === rec || cur.dead) runs.set(rec.key, rec);
  if (rec.flight) return rec.flight;
  const f = drive(rec).finally(() => { rec.flight = null; });
  rec.flight = f;
  return f;
}

async function drive(rec: WriterRun): Promise<AiAnswer> {
  let out: AiAnswer | null = null;
  while (out === null) {
    // Closed or claimed by another view while a step was going on (a step that ends the ask itself returns its answer instead).
    if (rec.dead) { out = left('stale', 'SUPERSEDED'); break; }
    if (!alive(rec.ctx)) { out = left('stale', 'STALE'); break; }
    if (rec.phase === 'create') out = await createStep(rec);
    else if (rec.phase === 'turn') out = await turnStep(rec);
    else if (rec.phase === 'lost') out = await lostStep(rec);
    else if (rec.phase === 'wait') out = await waitStep(rec);
    else out = await readStep(rec);
  }
  // An ask closed (or taken) while its last step was going on has no answer to hand over, whatever that step read.
  if (rec.dead && isFinal(out) && out.code !== 'EARLIER_UNSENT') out = left('stale', 'SUPERSEDED');
  incarnations.set(out, rec.createKey);
  // A turn may have gone out once the 'lost' phase was written; before that nothing was sent, whatever the ask ended with.
  const sent = rec.phase !== 'create' && rec.phase !== 'turn';
  const kept = out.outcome === 'pending' || (out.outcome === 'stale' && sent);
  // What the caller hid never stays on a finished run (the registry holds it for an ask the store keeps: see `held`).
  rec.values = undefined;
  // An ask that was lost or ended before anything was sent can never be answered: its values go whether or not its record can still
  // be removed (an unreadable store). One whose turn may be out keeps them while it is stored.
  if (rec.dead || (!kept && !sent)) release(rec.createKey);
  if (!kept && runs.get(rec.key) === rec) {
    rec.text = null;
    runs.delete(rec.key);
  }
  if (!kept && !rec.dead && rec.stored) {
    // Nothing was sent: no turn can be unknown, so nothing stays stored for it.
    if (!sent && (await claimScriptAsk(rec.stored)) === 'ok') bump();
    // A turn may have gone out: the ask stays stored, for the view that shows the place to take its answer (a claim), or for
    // the person's warned close. The answer itself is kept nowhere; it is read again while the ask is stored.
    else if (sent && isFinal(out)) via.set(out, rec.stored);
  }
  return out;
}

/** Stop the turn of an ask (only the turn it names, never a later one). The turn's receipt then says cancelled. */
export async function cancelRun(rec: WriterRun): Promise<boolean> {
  if (!rec.sid || !rec.turnId) return false;
  return (await cancelTurn({ ctx: rec.ctx, target: rec.target, realm: rec.realm }, rec.sid, rec.turnId)) === true;
}

/**
 * Stop one turn on the computer named by `at` (an explicit target: never the computer shown, unless it is that one). true: the
 * agent took the stop; false: it refused it; 'unknown': the answer was lost, so the stop may have been taken (C9).
 */
export async function cancelTurn(at: { ctx?: Ctx; target: Target; realm: string; still?: () => boolean }, sid: string, turnId: string): Promise<boolean | 'unknown'> {
  if (!SEG.test(sid) || !SEG.test(turnId)) return false;
  try {
    await api(R.cancel, { ctx: at.ctx ?? capture(at.target), target: at.target, realm: at.realm, recovers: true, ...(at.still ? { still: at.still } : {}), params: { sid }, body: { turn_id: turnId }, idem: newKey((n) => crypto.getRandomValues(new Uint8Array(n))) } as never);
    return true;
  } catch (e) {
    return outcomeOf(e, true) === 'pending' ? 'unknown' : false;
  }
}

// ── what a computer's row says about its assistant ───────────────────────────────────────────────

/** The agent's ability to take ideas and writing turns, from what it lists and whose it is. Loading is not a refusal: it shows no note. */
export function agentCapsOf(o: { version: unknown; status: unknown; loading: boolean; account: unknown; realm: string | null; guardedDelete: boolean }): AgentCaps {
  const templates = capOn(o.version, 'script_templates');
  if (o.loading) return { templates, writer: false, writerWhy: 'loading', guardedDelete: o.guardedDelete };
  const w = writerState(o.version, o.status, o.account);
  // Signed out: the press may sign it in (signIn), 'renew' when its login was rejected (a Hub sign-out revokes the key).
  if (w.state === 'login') {
    const rejected = isObj(o.status) && isObj(o.status.last_error) && o.status.last_error.credential_rejected === true;
    return { templates, writer: false, writerWhy: 'login', signIn: rejected ? 'renew' : 'offer', guardedDelete: o.guardedDelete };
  }
  if (w.state !== 'ready') return { templates, writer: false, writerWhy: w.state, guardedDelete: o.guardedDelete };
  // A session names one realm, like every agent route of the page: with none chosen the assistant waits for the person to pick one.
  if (o.realm === null) return { templates, writer: false, writerWhy: 'realm', guardedDelete: o.guardedDelete };
  return { templates, writer: true, writerOwner: w.owner, guardedDelete: o.guardedDelete };
}

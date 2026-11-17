// MCP servers reads and changes, on core. The agent answers MCP requests only for a
// live session, so the section HOLDS the settings session of its place (settings/rules/Session.ts) while it is shown: the
// session is opened first, then the list is read on it; leaving releases the hold and the session closes. A session the agent
// lost (its 404 "session not found", read exactly: notFoundOf) is replaced once, by whichever request saw it (the list, a write
// or a reconnect: ONE budget per place); lost again before a list answered on the replacement, the section stops and offers Try
// again. A 404 the page cannot read as either agent answer starts nothing: no replacement, no resend.
//
// A change is sent once and never resent (C9): at the press it opens the session if needed, mints a nonce for its op and
// layer, then sends the write with the hash of that layer as the person reviewed it (captured when the confirm opened, never a
// later list's). The entry is merged from every layer, so the hashes of ALL layers are captured too, with the entry and its layer
// as reviewed: a fresh list read just before the write must be complete and show all of it unchanged (hashes alone miss a
// skipped file, and the agent reads entries and hashes apart), or nothing is sent (code 'changed', reviewed again in Compare). A
// lost answer is held as "may have gone through" until the person stops tracking it: a Check again reads one fresh list, but
// no list proves a change applied (mcpProved, proveWrite). An import is one more change of that kind: its document goes
// into its preview and its import request only, never into its identity, a log or anything core keeps.
import {
  api, coreSource, heldChanges, hostEnv, refreshFresh, sourceReads, useLockedChange,
  type Ctx, type HeldChange, type HubError, type LockedResult, type SourceTable, type Target,
} from '@core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useHeldIn } from '../../heldIn';
import { SessionError, scopeKeyOf, settingsSessions, type Hold, type SettingsAt } from '../rules/Session';
import { useSessionState } from '../rules/data';
import {
  importedOf, importPreviewOf, importStillReviewed, listOf, mcpProved, nonceOf, reconnectOf, stillReviewed, writtenOf,
  type ImportPreview, type Layers, type McpList, type McpScope, type Seen, type Shape, type WriteIntent,
} from './mcp.logic';
import { mcpRoutes } from './mcp.routes';

export const MCP_SOURCE = 'ai-mcp';
export const MCP_LOCK = 'agent.mcp_servers';
const PAGE = 'ai-mcp';

/** A list read: the place and the session it is read on. */
export interface ListAt extends SettingsAt { sid: string }
const computerOf = (a: { target: Target }) => a.target.container.id;

const table: SourceTable = {
  reads: {
    list: {
      route: mcpRoutes.list,
      input: (p: ListAt) => ({ target: p.target, realm: p.realm, query: { session_id: p.sid } }),
      select: (raw, p: ListAt): McpList | null => listOf(raw, { realm: p.realm, cwd: p.cwd ?? null, sid: p.sid }),
    },
  },
};
const source = coreSource(MCP_SOURCE, table);

/** The read of one session's list (null data: the answer cannot be read as a whole). Nothing is read until there is a place
 *  and a session (`at` is then only the key of a read that stays off). */
export function useMcpList(at: SettingsAt, sid: string | null, enabled: boolean) {
  return source.useQuery<McpList | null, ListAt>('list', { ...at, sid: sid ?? '' }, { enabled: enabled && sid !== null });
}

/** The reads of the lists of `at` read on session `sid` only (another session's list proves nothing about now). */
export function listReadsOf(at: SettingsAt, sid: string | null): (k: readonly unknown[]) => boolean {
  const base = sourceReads(MCP_SOURCE, ['list'], { computer: computerOf(at) });
  return (k) => {
    if (!base(k) || sid === null) return false;
    const p = k[7] as Partial<ListAt> | null;
    return !!p && typeof p === 'object' && p.sid === sid && p.realm === at.realm && (p.cwd ?? null) === (at.cwd ?? null);
  };
}

// ---- the session the section holds ----

/** What a 404 (or 410) says, read exactly: the agent's "session not found", its "no such MCP server in this settings layer", or
 *  unknown (any other code, message or shape). null: not a 404 or 410. Only session_lost starts a replacement. */
export type NotFound = 'session_lost' | 'server_missing' | 'unknown';
export const SESSION_GONE_MSG = 'session not found';
export const SERVER_MISSING_MSG = 'no such MCP server in this settings layer';
export function notFoundOf(e: unknown): NotFound | null {
  const x = (e && typeof e === 'object' ? e : null) as { status?: unknown; code?: unknown; data?: unknown } | null;
  if (!x || (x.status !== 404 && x.status !== 410)) return null;
  if (x.status === 410) return 'session_lost';
  if (x.code !== 'not_found') return 'unknown';
  const d = x.data && typeof x.data === 'object' ? (x.data as { message?: unknown }) : null;
  const msg = d?.message;
  if (msg === SESSION_GONE_MSG) return 'session_lost';
  if (msg === SERVER_MISSING_MSG) return 'server_missing';
  return 'unknown';
}

/** A 404 (or 410) of a SECRET route (upsert, import, parse), read by status and code. Core rebuilds a secret route's refusal
 *  from safe fields only, so the agent's message is gone and notFoundOf could never see "session not found". These routes have
 *  one 404, the session resolver's not_found (mcpJSONErrorResponses): that, or a 410, is the loss; any other 404 is unknown. */
export function secretNotFoundOf(e: unknown): Exclude<NotFound, 'server_missing'> | null {
  const x = (e && typeof e === 'object' ? e : null) as { status?: unknown; code?: unknown } | null;
  if (!x || (x.status !== 404 && x.status !== 410)) return null;
  return x.status === 410 || x.code === 'not_found' ? 'session_lost' : 'unknown';
}

/** A list read's failure that is the session's loss. Core keeps no message on a read's error, so the list cannot read the
 *  agent's words; it does not need them: GET /mcp/servers has one 404, "session not found" (no server is named), so its
 *  404 not_found (or a 410) is the loss. Any other 404 (another code, none) is an ordinary failed read: no replacement. */
export const listSessionLost = (e: unknown): boolean => {
  const x = (e && typeof e === 'object' ? e : null) as { status?: unknown; code?: unknown } | null;
  return !!x && (x.status === 410 || (x.status === 404 && x.code === 'not_found'));
};

/** The agent's answer for a session it does not have, made here so run() replaces that session (once). */
const gone404 = (): Error => Object.assign(new Error('session lost'), { status: 404, code: 'not_found', data: { message: SESSION_GONE_MSG } });

// The recovery budget of each place (its settings scope key): the session whose loss was replaced, while no list has answered
// on its replacement. Shared by the list, the writes and the reconnect, so one loss is replaced once whoever saw it.
const replacedFor = new Map<string, string>();
const gaveUpSubs = new Set<(key: string) => void>();

/** A loss of `sid` seen by a request of place `key`: true when it may be replaced (the budget is then spent on it); false when
 *  a replacement already happened and no list answered on it (the section stops; Try again starts over). */
function spendRecovery(key: string, sid: string): boolean {
  const prev = replacedFor.get(key);
  if (prev !== undefined && prev !== sid) {
    for (const fn of gaveUpSubs) fn(key);
    return false;
  }
  replacedFor.set(key, sid);
  return true;
}

export interface SessionView {
  /** The session the list is read on, once it is open for this place. */
  sid: string | null;
  phase: 'idle' | 'opening' | 'open' | 'failed';
  failure: string | null;
  /** Opens the session again after it could not be opened or was given up (a press). */
  retry: () => void;
  /** The list answered that the session is gone: replace it once and read again. */
  lost: (sid: string) => void;
  /** The list answered on `sid`: a later loss of it may be replaced again. */
  answered: (sid: string) => void;
  /** The session was lost again before a list answered on its replacement (on a list or on a write): nothing reopens it by
   *  itself; Try again does. */
  gaveUp: boolean;
}

/**
 * Holds the settings session of `at` while mounted and opens it once on entering: the MCP list needs it (its first request is
 * the create, then the list). Every replacement is run()'s or lost()'s, one per loss: a session the manager ended (it was lost
 * again right after a replacement, on a list or on a write) is never reopened by this hook on its own.
 */
export function useMcpSession(at: SettingsAt | null, hold: Hold | null): SessionView {
  const st = useSessionState();
  const key = at ? scopeKeyOf(at) : null;
  const mineNow = st.scope === key && hold !== null;
  const sid = mineNow && st.phase === 'open' ? st.sid : null;
  const [lostTwice, setLostTwice] = useState(false);
  // The place this hook opened a session for, and the place whose session was seen live: an idle manager after that is a
  // session that ended, not one to open.
  const openedFor = useRef<string | null>(null);
  const [liveFor, setLiveFor] = useState<string | null>(null);
  const open = useCallback((h: Hold) => {
    void settingsSessions().run(h, async (s) => s).catch(() => undefined);
  }, []);
  useEffect(() => {
    setLostTwice(false);
    if (key === null) return undefined;
    replacedFor.delete(key);
    const fn = (k: string) => { if (k === key) setLostTwice(true); };
    gaveUpSubs.add(fn);
    return () => { gaveUpSubs.delete(fn); };
  }, [key]);
  useEffect(() => {
    if (hold && mineNow && st.phase === 'idle' && openedFor.current !== key) { openedFor.current = key; open(hold); }
  }, [hold, mineNow, st.phase, key, open]);
  useEffect(() => { if (mineNow && st.phase !== 'idle' && liveFor !== key) setLiveFor(key); }, [mineNow, st.phase, liveFor, key]);
  // A page hide ended it (rules/Session.ts closeNow): not a loss. The Listing stays (an open dialog with it), and the session
  // opens again, once, when the page shows again (the first-open path); only a real failure shows the error.
  const ended = mineNow && st.phase === 'idle' && liveFor === key && !st.hidden;
  const hiddenEnd = mineNow && st.phase === 'idle' && st.hidden;
  useEffect(() => {
    if (!hiddenEnd || !hold) return undefined;
    return hostEnv().onLifecycle('pageshow', () => open(hold));
  }, [hiddenEnd, hold, open]);
  const retry = useCallback(() => { setLostTwice(false); if (key !== null) replacedFor.delete(key); if (hold) open(hold); }, [hold, open, key]);
  const lost = useCallback((gone: string) => {
    if (!hold || key === null) return;
    if (!spendRecovery(key, gone)) return;
    // run() replaces a session whose request answered 404 once and runs again on the new one: this request is that 404.
    void settingsSessions().run(hold, async (s) => { if (s === gone) throw gone404(); return s; }).catch(() => { setLostTwice(true); });
  }, [hold, key]);
  const answered = useCallback((on: string) => {
    if (key === null) return;
    const prev = replacedFor.get(key);
    if (prev !== undefined && prev !== on) replacedFor.delete(key);
  }, [key]);
  return { sid, phase: mineNow ? st.phase : 'idle', failure: mineNow ? st.failure : null, retry, lost, answered, gaveUp: lostTwice || ended };
}

// ---- the writes ----

export interface WriteBase extends SettingsAt {
  hold: Hold;
  scope: McpScope;
  /** Every layer's hash as the person reviewed it (captured when the dialog or confirm opened); the write is checked against
   *  layers[scope], and every other one must be unchanged at the send. */
  layers: Layers;
  name: string;
  /** The entry as the person reviewed it (names only); null for an add. */
  before: Shape | null;
  /** The layer that entry came from, as reviewed; null for an add. */
  from: McpScope | null;
}
export type WriteVars =
  | (WriteBase & { op: 'upsert'; server: Record<string, unknown>; shape: Shape; setsValues: boolean })
  | (WriteBase & { op: 'delete' })
  | (WriteBase & { op: 'set_enabled'; enabled: boolean })
  // An import names no single entry: `name` is '', `before` and `from` null. `names` are the previewed names and `seen` their
  // effective entries when the confirm opened (importStillReviewed); `document` is the pasted text exactly as previewed.
  | (WriteBase & { op: 'import'; document: string; replace: boolean; names: string[]; seen: Seen[] });

/** A change as the section names it: the place and the session hold are added at the press. */
export type WriteInput = WriteVars extends infer W ? (W extends WriteVars ? Omit<W, 'hold' | 'target' | 'realm' | 'cwd'> : never) : never;

// The demo's refusal keeps its own code: the kit's words say it is the demo (kit/states/errorWords.ts LOCAL), and no page
// repeats that sentence.
export const sessionCode = (e: SessionError): string => (e.kind === 'demo' && e.code ? e.code : `SETTINGS_${e.kind.toUpperCase()}`);

/** An error as a send that never left. */
function unsent(e: unknown, code?: string): Error {
  const x = (e && typeof e === 'object' ? e : {}) as Partial<HubError> & { message?: string };
  return Object.assign(new Error(typeof x.message === 'string' ? x.message : 'nonce'), x, { kind: 'not_sent', notSent: true, pending: false, stale: false }, code ? { code } : {});
}
/** An answer the page cannot read as the agent's success: the write may have been applied. */
function unreadable(code: string): Error {
  return Object.assign(new Error('unreadable answer'), { kind: 'pending', pending: true, code });
}

/** A session loss of `sid` for the session manager to replace (once per place: see spendRecovery), else the end of the run. */
function lostOn(v: { hold: Hold }, sid: string, e: unknown): never {
  if (spendRecovery(v.hold.scope, sid)) throw e;
  throw new SessionError('lost', 'not_found', 404);
}

async function mint(v: WriteVars, sid: string, ctx: Ctx): Promise<string> {
  let raw: unknown;
  try {
    // recovers: a lost mint is "not sent" here (no write left), so core must not announce a change that may have gone through.
    raw = await api(mcpRoutes.begin, { target: v.target, realm: v.realm, body: { session_id: sid, op: v.op, scope: v.scope }, ctx, recovers: true });
  } catch (e) {
    const nf = notFoundOf(e);
    if (nf === 'session_lost') lostOn(v, sid, e);
    // Any other 404 says nothing the page can read: nothing left, and it must not look like a lost session to the manager.
    throw unsent(e, nf ? 'NOT_FOUND_UNREADABLE' : undefined);
  }
  const nonce = nonceOf(raw);
  if (nonce === null) throw unsent(new Error('nonce'), 'NONCE_UNREADABLE');
  return nonce;
}

/** The list just before the write, on the same session: complete, every hash and the entry with its layer as reviewed
 *  (stillReviewed), or nothing is sent. */
async function stillAsReviewed(v: WriteVars, sid: string, ctx: Ctx): Promise<void> {
  let raw: unknown;
  try {
    raw = await api(mcpRoutes.list, { target: v.target, realm: v.realm, query: { session_id: sid }, ctx, recovers: true });
  } catch (e) {
    const nf = notFoundOf(e);
    if (nf === 'session_lost') lostOn(v, sid, e);
    throw unsent(e, nf ? 'NOT_FOUND_UNREADABLE' : undefined);
  }
  const l = listOf(raw, { realm: v.realm, cwd: v.cwd ?? null, sid });
  if (!l) throw unsent(new Error('list'), 'LIST_UNREADABLE');
  if (!(v.op === 'import' ? importStillReviewed(l, v) : stillReviewed(l, v))) throw unsent(new Error('changed'), 'changed');
}

function writeCall(v: WriteVars, sid: string, nonce: string, ctx: Ctx): Promise<unknown> {
  const base = { session_id: sid, nonce, scope: v.scope, expect_hash: v.layers[v.scope] };
  if (v.op === 'upsert') return api(mcpRoutes.upsert, { target: v.target, realm: v.realm, body: { ...base, server: v.server }, ctx });
  if (v.op === 'delete') return api(mcpRoutes.remove, { target: v.target, realm: v.realm, body: { ...base, name: v.name }, ctx });
  if (v.op === 'import') return api(mcpRoutes.import, { target: v.target, realm: v.realm, body: { ...base, document: v.document, replace: v.replace }, ctx });
  return api(mcpRoutes.enable, { target: v.target, realm: v.realm, body: { ...base, name: v.name, enabled: v.enabled }, ctx });
}

/** A change's answer: the layer's hash after it; an import's also says how many entries the agent wrote. */
export interface Written { hash: string; imported?: number }

/** One send of one change: the nonce, then the write, on the settings session (made first when there is none). */
export async function sendWrite(v: WriteVars, ctx: Ctx): Promise<Written> {
  let sent = false;
  if (!v.layers[v.scope]) throw unsent(new Error('layer'), 'LAYER_UNKNOWN');
  try {
    return await settingsSessions().run(v.hold, async (sid, alive) => {
      sent = false;
      const nonce = await mint(v, sid, ctx);
      await stillAsReviewed(v, sid, ctx);
      // The hold or the session ended while the nonce was minted: the write is not started and the nonce is not used.
      if (!alive()) throw new SessionError('superseded');
      sent = true;
      let raw: unknown;
      try {
        raw = await writeCall(v, sid, nonce, ctx);
      } catch (e) {
        const nf = v.op === 'upsert' || v.op === 'import' ? secretNotFoundOf(e) : notFoundOf(e);
        // The session was not there: the agent refused before applying anything, so the manager may replace it and send again.
        if (nf === 'session_lost') lostOn(v, sid, e);
        // "No such server in this layer" is a refusal made before anything changed: it must not read as a lost session.
        if (nf === 'server_missing') throw Object.assign(Object.create(Object.getPrototypeOf(e) as object) as object, e as object, { code: 'mcp_not_in_layer', notApplied: true });
        // A 404 read as neither: the write may have been applied; held, never resent.
        if (nf === 'unknown') throw unreadable('NOT_FOUND_UNREADABLE');
        throw e;
      }
      const w = v.op === 'import' ? importedOf(raw) : writtenOf(raw);
      if (!w) throw unreadable('MCP_UNREADABLE');
      return w;
    });
  } catch (e) {
    if (e instanceof SessionError) {
      // A write that had left when its session ended may have been applied: held, never "not sent". A session lost twice
      // refused the request before applying anything.
      if (sent && e.kind !== 'lost') throw unreadable(sessionCode(e));
      throw unsent(e, sessionCode(e));
    }
    throw e;
  }
}

/** The lock's place: one change at a time per settings layer of a place (the hash covers the whole layer). */
export const lockKeyOf = (v: WriteVars) => ({ computer: computerOf(v), realm: v.realm, cwd: v.cwd ?? '', scope: v.scope });
/** What a Check again judges: the place, the change, and the hash it was made against. Names only, never a value. */
export function identityOf(v: WriteVars): WriteIntent {
  const copy = (x: Shape): Shape => ({ ...x, args: [...x.args], envKeys: [...x.envKeys], headerKeys: [...x.headerKeys] });
  return {
    ...lockKeyOf(v), op: v.op, name: v.name, expectHash: v.layers[v.scope] ?? '', layers: { ...v.layers }, before: v.before ? copy(v.before) : null,
    ...(v.op === 'set_enabled' ? { enabled: v.enabled } : {}),
    ...(v.op === 'upsert' ? { shape: copy(v.shape), setsValues: v.setsValues } : {}),
    ...(v.op === 'import' ? { names: [...v.names], replace: v.replace } : {}),
  };
}
const keyOfIdentity = (identity: unknown): string => JSON.stringify(identity ?? null);

export interface McpWrite {
  run: (v: WriteVars) => Promise<LockedResult<Written>>;
  state: 'free' | 'running' | 'pending';
  held: HeldChange | null;
  /** A change held in another folder (or the realm) of this computer and realm: it blocks changes here too (one lock). */
  elsewhere: HeldChange | null;
  /** One new list read for the change held now; true when that read ended the hold. Says nothing about the change itself. */
  check: () => Promise<boolean>;
  stopWaiting: () => Promise<boolean>;
}

/**
 * The section's changes. Nothing infers that a change went through: a hold ends by Stop tracking. A Check again reads ONE list
 * (started by that press, on the current session) and judges it by mcpProved, which no list satisfies today (proveWrite).
 */
export function useMcpWrite(at: SettingsAt | null, sid: string | null): McpWrite {
  const probe = useRef<{ hold: string; key: string } | null>(null);
  const atRef = useRef(at);
  atRef.current = at;
  const sidRef = useRef(sid);
  sidRef.current = sid;
  // The place's own values, so a place switch re-picks (a ref would keep the held change of the place left).
  const pc = at ? computerOf(at) : null;
  const pr = at?.realm ?? null;
  const pw = at ? at.cwd ?? '' : null;
  const pick = useCallback((i: Record<string, unknown>) => pc !== null && i.computer === pc && i.realm === pr && i.cwd === pw, [pc, pr, pw]);
  const heldNow = useCallback((): HeldChange | null => {
    const a = atRef.current;
    if (!a) return null;
    return heldChanges(MCP_LOCK, { realm: a.realm }).find((x) => pick((x.identity ?? {}) as Record<string, unknown>)) ?? null;
  }, [pick]);
  const reads = useCallback((): readonly ((k: readonly unknown[]) => boolean)[] => {
    const a = atRef.current;
    return a ? [(k: readonly unknown[]) => listReadsOf(a, sidRef.current)(k)] : [];
  }, []);
  const locked = useLockedChange<WriteVars, Written>(
    (v, _idem, ctx) => sendWrite(v, ctx),
    reads(),
    'ai-mcp.write',
    {
      // Filed under the realm the change names (Global, or under All realms a computer's own), not the context's.
      lock: MCP_LOCK, route: mcpRoutes.upsert, sentIn: at?.realm, lockKey: lockKeyOf, identity: identityOf, page: PAGE,
      proves: (identity, answers) => {
        const pr = probe.current;
        if (!pr || pr.key !== keyOfIdentity(identity)) return undefined;
        const now = heldNow();
        if (!now || now.hold !== pr.hold || keyOfIdentity(now.identity) !== pr.key) return undefined;
        return mcpProved(identity, answers);
      },
    },
  );
  // In the place's realm, where the change is filed (sentIn), never the top bar's: a Global place under a realm keeps its
  // notice, Check again and Stop tracking.
  const held = useHeldIn(MCP_LOCK, pick, pr);
  const pickElsewhere = useCallback((i: Record<string, unknown>) => pc !== null && i.computer === pc && i.realm === pr && i.cwd !== pw, [pc, pr, pw]);
  const elsewhere = useHeldIn(MCP_LOCK, pickElsewhere, pr);
  const epoch = useRef(0);
  // A hold that goes, however it went, makes the shown list stale: read it again (a read only; it claims nothing).
  const prevHeld = useRef<HeldChange | null>(held);
  useEffect(() => {
    const prev = prevHeld.current;
    prevHeld.current = held;
    if (!prev || (held && held.hold === prev.hold)) return;
    for (const r of reads()) { try { void refreshFresh(r).catch(() => undefined); } catch { /* a read that cannot start changes nothing */ } }
  }, [held, reads]);
  const run = useCallback((v: WriteVars) => {
    epoch.current += 1;
    probe.current = null;
    return locked.run(v);
  }, [locked]);
  const check = useCallback(async (): Promise<boolean> => {
    const h = heldNow();
    if (!h || typeof h.hold !== 'string' || h.hold === '') return false;
    const mine = epoch.current;
    const pr = { hold: h.hold, key: keyOfIdentity(h.identity) };
    probe.current = pr;
    // The read this check judges is one this press sends: a read already out is cancelled and answers nobody.
    for (const r of reads()) { try { void refreshFresh(r, { own: true }).catch(() => undefined); } catch { /* proves nothing */ } }
    try { await locked.readBack(); } finally { if (probe.current === pr) probe.current = null; }
    return epoch.current === mine && heldNow() === null;
  }, [locked, heldNow, reads]);
  const stopWaiting = useCallback(async (): Promise<boolean> => {
    const h = heldNow();
    epoch.current += 1;
    probe.current = null;
    return h ? locked.dismissOne(h.identity) : false;
  }, [locked, heldNow]);
  return { run, state: locked.state, held, elsewhere, check, stopWaiting };
}

// ---- an import's preview ----

export type PreviewResult =
  | { outcome: 'ok'; preview: ImportPreview }
  /** The agent could not read the document as an MCP config (its words are not kept: they may quote the document). */
  | { outcome: 'refused' }
  /** The agent answered, but its preview cannot be read as a whole: nothing of it is shown. */
  | { outcome: 'unreadable' }
  | { outcome: 'failed' | 'not_sent'; code?: string; status?: number };

/** Reads a pasted config as the import would, on the settings session. It writes nothing, so a lost answer is only a failed
 *  preview (nothing to hold). */
export async function previewImport(at: SettingsAt, hold: Hold, document: string): Promise<PreviewResult> {
  try {
    const raw = await settingsSessions().run(hold, async (sid) => {
      try {
        return await api(mcpRoutes.parse, { target: at.target, realm: at.realm, body: { session_id: sid, document }, recovers: true });
      } catch (e) {
        const nf = secretNotFoundOf(e);
        if (nf === 'session_lost') lostOn({ hold }, sid, e);
        // Any other 404 says nothing the page can read; without its status it never reads as a lost session to the manager.
        if (nf === 'unknown') throw Object.assign(new Error('not found'), { kind: 'failed', code: 'NOT_FOUND_UNREADABLE' });
        throw e;
      }
    });
    const preview = importPreviewOf(raw);
    return preview ? { outcome: 'ok', preview } : { outcome: 'unreadable' };
  } catch (e) {
    if (e instanceof SessionError) return { outcome: 'not_sent', code: sessionCode(e) };
    const x = e as Partial<HubError>;
    if (x.code === 'bad_request') return { outcome: 'refused' };
    if (x.notSent || x.kind === 'not_sent') return { outcome: 'not_sent', ...(x.code ? { code: x.code } : {}) };
    return { outcome: 'failed', ...(x.code ? { code: x.code } : {}), ...(typeof x.status === 'number' ? { status: x.status } : {}) };
  }
}

// ---- reconnect ----

export type ReconnectResult =
  | { outcome: 'done' } | { outcome: 'background' } | { outcome: 'skipped' } | { outcome: 'partial' }
  | { outcome: 'failed' | 'not_sent' | 'pending'; code?: string; retryAfter?: string };

/** Reads the settings files again and reconnects (writes nothing, so a lost answer is harmless: the list shows the state). */
export async function reconnect(at: SettingsAt, hold: Hold): Promise<ReconnectResult> {
  try {
    const raw = await settingsSessions().run(hold, async (sid) => {
      try {
        return await api(mcpRoutes.reconnect, { target: at.target, realm: at.realm, body: { session_id: sid }, recovers: true });
      } catch (e) {
        const nf = notFoundOf(e);
        if (nf === 'session_lost') lostOn({ hold }, sid, e);
        // Any other 404 is unreadable: it says nothing about the servers, and starts no replacement.
        if (nf) return undefined;
        throw e;
      }
    });
    // Read at the boundary: an answer that cannot be read says nothing about the servers (the list read after it does).
    const r = reconnectOf(raw);
    if (!r) return { outcome: 'pending' };
    // Never "reconnected" past what the agent says it did: a layer it could not read, or other chats it skipped or left queued.
    if (r.partial > 0) return { outcome: 'partial' };
    if (r.deferred > 0) return { outcome: r.started ? 'background' : 'skipped' };
    return { outcome: 'done' };
  } catch (e) {
    if (e instanceof SessionError) return { outcome: 'not_sent', code: sessionCode(e) };
    const x = e as Partial<HubError> & { data?: { message?: unknown } };
    if (x.status === 429 || x.code === 'rate_limited') return { outcome: 'failed', code: 'rate_limited' };
    if (x.kind === 'pending' || x.pending) return { outcome: 'pending' };
    if (x.notSent || x.kind === 'not_sent') return { outcome: 'not_sent', ...(x.code ? { code: x.code } : {}) };
    return { outcome: 'failed', ...(x.code ? { code: x.code } : {}) };
  }
}

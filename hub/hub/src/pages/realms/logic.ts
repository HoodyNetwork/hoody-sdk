// logic.ts: the rules and the write engine behind "New realm". No React; every outside effect comes
// in through `Io`, so the page wires core and its own routes and the tests wire fakes.
//
// Contract:
//   - A realm has no row of its own. It exists while something carries its id, or while it has a name in the vault
//     (an empty realm is allowed). So making one is: an id, its name, its colour, and optionally computers.
//   - mintId() draws 12 bytes from crypto.getRandomValues as 24 lower-case hex (the API's only rule for a realm id).
//     Without a secure source it returns '' and nothing is made; Math.random is never used. freshId() re-draws on a
//     collision with an id already known.
//   - checkName() applies the vault alias rules (core's validator, passed in) and one of its own: a name another realm
//     already has (compared folded) is refused, so two realms never read the same in the switcher.
//   - engine(): the name goes first, because it is what makes an empty realm exist. It is checked again against the
//     names read just before sending (another tab may have taken it), and read once more after a done answer (core
//     writes the whole map, so another change can replace it). Computers go only after the name is saved, one at a
//     time, each sent once: a fresh read first (already in: saved, nothing sent; realms moved since shown: changed,
//     nothing sent), then its current realms plus the new id (the others kept), then a read-back.
//     Name states: waiting · sending · saved · unknown (may have gone through) · missing (a read shows it is not
//     there now) · failed (refused; notSent says whether anything left).
//     Item states: the same, plus unchecked (a read failed; nothing sent), changed (moved since shown; not sent
//     again; the new set is shown) and gone (sent and accepted, then a read without the realm: changed since).
//     Nothing is sent again by itself (C9). checkName() and checkComputers() only READ: what the read shows decides
//     (saved, missing, changed), a failed read settles nothing; a name check sends no computer either. sendName()
//     and sendComputers() are the person's explicit press, allowed only where nothing was sent yet or a read or a
//     refusal shows nothing is there. A computer send whose answer was lost keeps core's hold: a read showing the
//     realm settles it as applied; sending again dismisses it first, with the warning on the page that the lost
//     send may still land (it adds the same realm, so that is safe). A dead context (realm switch, sign-out,
//     leaving the page) stops at once and what is left stays as it was, except a name write already started: core
//     runs it to its answer, so it may land after the context died.

import { REALM_LIMIT_CODE, stringOrEmpty as str } from '@core';

export const REALM_ID = /^[0-9a-f]{24}$/;
const GONE = /^(deleting|deleted)$/;
export const MAX_PAGES = 20;

function hex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

export function mintId(fill?: (b: Uint8Array) => void): string {
  const b = new Uint8Array(12);
  if (fill) fill(b);
  else {
    const c = globalThis.crypto;
    if (!c || typeof c.getRandomValues !== 'function') return '';
    c.getRandomValues(b);
  }
  const id = hex(b);
  return REALM_ID.test(id) ? id : '';
}

export function freshId(taken: readonly string[], fill?: (b: Uint8Array) => void): string {
  for (let i = 0; i < 8; i++) {
    const id = mintId(fill);
    if (!id) return '';
    if (!taken.includes(id)) return id;
  }
  return '';
}

/** reserved/length/control: the vault rule core's validator names (its `reason`, and the reserved `word`); rule: any other throw. */
export type NameCheck = { ok: true; alias: string } | { ok: false; reason: 'empty' | 'taken' | 'reserved' | 'length' | 'control' | 'rule'; word?: string; error?: unknown };
const NAME_RULES = ['reserved', 'length', 'control'] as const;

/** `validate` is core's alias validator (it throws the rule broken); `fold` its comparison form. */
export function checkName(raw: string, aliases: Readonly<Record<string, string>>, validate: (m: Record<string, string>) => unknown, fold: (v: string) => string): NameCheck {
  const v = raw.trim();
  if (!v) return { ok: false, reason: 'empty' };
  try { validate({ ['0'.repeat(24)]: v }); } catch (e) {
    const x = (e ?? {}) as { reason?: unknown; word?: unknown };
    const reason = NAME_RULES.find((r) => r === x.reason) ?? 'rule';
    return { ok: false, reason, ...(reason === 'reserved' && typeof x.word === 'string' ? { word: x.word } : {}), error: e };
  }
  const f = fold(v);
  for (const k of Object.keys(aliases)) if (fold(String(aliases[k])) === f) return { ok: false, reason: 'taken' };
  return { ok: true, alias: v };
}

export interface PickRow {
  id: string;
  name: string;
  project: string;
  server: string;
  status: string;
  realms: string[];
  /** The computer's colour as the API keeps it: drawn only through the kit's ComputerMark, which normalises it. */
  color?: string;
}


/** The picker rows from the API's computers: deduplicated, deleting ones left out, sorted by name. */
export function rowsOf(list: readonly unknown[]): PickRow[] {
  const out: PickRow[] = [];
  const seen = new Set<string>();
  for (const x of list) {
    const c = x as Record<string, unknown> | null;
    if (!c || typeof c.id !== 'string' || !REALM_ID.test(c.id) || seen.has(c.id) || GONE.test(str(c.status).toLowerCase())) continue;
    seen.add(c.id);
    const realms = Array.isArray(c.realm_ids) ? c.realm_ids.filter((r): r is string => typeof r === 'string' && REALM_ID.test(r)) : [];
    out.push({ id: c.id, name: str(c.name) || c.id, project: str(c.project_alias) || str(c.project_name), server: str(c.server_name), status: str(c.status), realms, ...(typeof c.color === 'string' ? { color: c.color } : {}) });
  }
  return out.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || (a.id < b.id ? -1 : 1));
}

/** The realms a computer should have: what it has now plus the new id, nothing else changed. */
export function nextSet(has: readonly string[], id: string): string[] {
  const out = has.filter((r) => REALM_ID.test(r));
  if (!out.includes(id)) out.push(id);
  return out;
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

// ---- the engine ----

export type NameState = 'waiting' | 'sending' | 'saved' | 'unknown' | 'missing' | 'failed';
export type ItemState = NameState | 'unchecked' | 'changed' | 'gone';

export interface Item {
  id: string;
  name: string;
  /** The realms it had when shown (or when last read). */
  shown: string[];
  state: ItemState;
  code: string | null;
  notSent: boolean;
  /** The set of a send whose answer was lost, and the hold core keeps for it until a read proves it or the
   *  person sends again with the warning shown. */
  sent: string[] | null;
  hold: string | null;
  /** The API's refusal of the latest send (its facts, for Details); none for a refusal made here or a new try. */
  error?: unknown;
}

/** A lost send is still out: a later read without the realm does not prove it will not land. */
export const stillOut = (it: Item) => it.sent !== null && it.state !== 'saved';
/** The text of a name not found while an earlier send may still land: retry is offered only when the name is free. */
export const notSeenText = (n: { code: string | null }): 'name.notSeen' | 'name.notSeenTaken' => (n.code === 'NAME_TAKEN' ? 'name.notSeenTaken' : 'name.notSeen');

export interface EngineState {
  phase: 'idle' | 'running' | 'done' | 'stopped';
  id: string;
  alias: string;
  /** Codes: NAME_TAKEN, NAMES_UNREAD (refused here, nothing sent), RENAMED (saved: the realm is made and was
   *  renamed since, `alias` is its name now), NAME_LOST (saved, then replaced by another change to the names),
   *  NAME_UNCHECKED (unknown: the write was answered, but the read right after failed, so whether another change
   *  replaced it is not known; no computer is sent until a check shows the name), or the API's own. `out`: a name
   *  write's answer was lost and no read has shown the realm since, so it may still land, even after a read without
   *  it. `error`: the API's refusal of the latest write (its facts, for Details); none for a refusal made here. */
  name: { state: NameState; code: string | null; notSent: boolean; unread: boolean; out: boolean; error?: unknown };
  items: Item[];
}

/** What a write answered. 'unknown': the answer was lost or unclear (may have gone through); `hold` names the
 *  hold core keeps for that send. */
export type WriteResult = { outcome: 'done' } | { outcome: 'unknown'; hold?: string } | { outcome: 'failed'; code?: string; notSent?: boolean; error?: unknown } | { outcome: 'stale' };

export interface Io {
  /** Write the name (core setRealmAlias: read the map, write the whole map). */
  setName: (id: string, alias: string) => Promise<WriteResult>;
  /** A certain read of every realm name: rejects when it cannot tell. */
  readNames: () => Promise<Readonly<Record<string, string>>>;
  setTint: (id: string, color: string) => void;
  /** A fresh read of a computer's realms; null when the read failed. */
  readRealms: (computer: string) => Promise<string[] | null>;
  /** One write of a computer's whole realm set. */
  writeRealms: (computer: string, realmIds: string[]) => Promise<WriteResult>;
  /** Ends core's hold on a lost send of this set: 'applied' once a read shows the realm on the computer,
   *  'dismiss' when the person sends again with the warning shown. Never another page's hold: 'other' says another
   *  page holds it, 'kept' that core kept it (the hold moved meanwhile), 'settled' that no hold of it is left. */
  settleRealms: (computer: string, realmIds: string[], how: 'applied' | 'dismiss', hold?: string) => Promise<'settled' | 'other' | 'kept'>;
  /** False once the context is gone (realm switch, sign-out, the page left). */
  alive: () => boolean;
  /** Re-read the realm list and the computers once something was sent or settled. */
  refresh: () => Promise<void>;
}

export interface Engine {
  state: () => EngineState;
  start: () => Promise<EngineState>;
  /** Reads the names only: shows whether an unknown name write landed. Sends nothing, computers included. */
  checkName: () => Promise<EngineState>;
  /** The person's second press, only once nothing landed (missing, or refused other than NAME_TAKEN). */
  sendName: () => Promise<EngineState>;
  /** Reads the computers whose write is unknown or unread; sends nothing. */
  checkComputers: () => Promise<EngineState>;
  /** The person's press for computers not added: not sent yet, or where a read or a refusal proved nothing is there. */
  sendComputers: () => Promise<EngineState>;
  canCheckName: () => boolean;
  canSendName: () => boolean;
  canCheckComputers: () => boolean;
  canSendComputers: () => boolean;
  /** The person's warned Dismiss of lost sends whose computer is in the realm with other realms than sent (HELD). */
  dismissHeld: () => Promise<EngineState>;
  canDismissHeld: () => boolean;
  /** Nothing was sent at all and the name was refused here: the page may start over with another name. */
  canRestart: () => boolean;
  /** The account's Realm limit refused a computer's send: no computer is sent again from here (each would be refused the same). */
  limitRefused: () => boolean;
}

const CHECK: ReadonlySet<ItemState> = new Set(['unknown', 'unchecked']);
const RESEND: ReadonlySet<ItemState> = new Set(['waiting', 'missing', 'changed', 'failed', 'gone']);
const NO_RESEND: ReadonlySet<string> = new Set(['NAME_TAKEN']);

/** `free(names)`: the chosen name is still free in these names (logic checkName). */
export function engine(o: { id: string; alias: string; color: string; rows: readonly PickRow[]; io: Io; free: (names: Readonly<Record<string, string>>) => boolean; onChange?: (s: EngineState) => void }): Engine {
  const { io, id } = o;
  const seen = new Set<string>();
  const s: EngineState = {
    phase: 'idle',
    id,
    alias: o.alias,
    name: { state: 'waiting', code: null, notSent: false, unread: false, out: false },
    items: o.rows.filter((r) => REALM_ID.test(r.id) && !seen.has(r.id) && (seen.add(r.id), true)).map((r) => ({ id: r.id, name: r.name, shown: r.realms.slice(), state: 'waiting' as ItemState, code: null, notSent: false, sent: null, hold: null })),
  };
  let busy = false;
  let sentAny = false;
  let tinted = false;

  const notify = () => { try { o.onChange?.(snapshot()); } catch { /* the caller's own */ } };
  const snapshot = (): EngineState => ({ ...s, name: { ...s.name }, items: s.items.map((it) => ({ ...it, shown: it.shown.slice(), sent: it.sent ? it.sent.slice() : null })) });
  // A call, not a field test: the phase changes across awaits.
  const stopped = () => s.phase === 'stopped';
  const live = () => {
    if (s.phase === 'stopped') return false;
    if (!io.alive()) { s.phase = 'stopped'; return false; }
    return true;
  };
  const refuse = (code: string) => { s.name = { state: 'failed', code, notSent: true, unread: false, out: s.name.out }; };
  /** What a read of the names says about this id: any name on it means the realm is made (the id is fresh, so
   *  only this page's write can have put it there; another name means it was renamed since). */
  const madeIn = (names: Readonly<Record<string, string>>): boolean => {
    const now = names[id];
    if (now === undefined) return false;
    s.name = { state: 'saved', code: now === s.alias ? null : 'RENAMED', notSent: false, unread: false, out: false };
    s.alias = now;
    sentAny = true;
    return true;
  };

  async function writeName(): Promise<void> {
    const prev = { ...s.name };
    s.name = { state: 'sending', code: null, notSent: false, unread: false, out: s.name.out };
    notify();
    // Checked again against the names as they are now: another tab may have taken this name since the page opened.
    const before = await io.readNames().catch(() => null);
    if (!live()) { s.name = prev; return; }
    if (before === null) return refuse('NAMES_UNREAD');
    // An earlier send that was lost may have landed since the last check: then nothing is sent again.
    if (madeIn(before)) return notify();
    if (!o.free(before)) return refuse('NAME_TAKEN');
    let r: WriteResult;
    try { r = await io.setName(id, s.alias); } catch { r = { outcome: 'unknown' }; }
    // The live I/O refused before the PUT because the page was left meanwhile: nothing went out.
    if (r.outcome === 'failed' && r.notSent === true && !live()) { s.name = prev; return; }
    if (r.outcome === 'done' || r.outcome === 'unknown' || (r.outcome === 'failed' && r.notSent !== true)) sentAny = true;
    if (r.outcome === 'done') {
      // The whole map was written: a read right after shows whether another change to the names replaced it.
      // Another name on this id is a rename since (saved); only an absent entry is lost, and Try again then writes
      // into an entry nobody else holds. A read that fails proves neither: the realm is not called made and no
      // computer is sent until Check again shows the name (NAME_UNCHECKED).
      const after = await io.readNames().catch(() => null);
      if (after && !madeIn(after)) { s.name.state = 'missing'; s.name.code = 'NAME_LOST'; }
      else if (!after) { s.name.state = 'unknown'; s.name.code = 'NAME_UNCHECKED'; s.name.unread = true; s.name.out = false; }
    } else if (r.outcome === 'stale') { s.phase = 'stopped'; s.name.state = 'unknown'; s.name.out = true; }
    else if (r.outcome === 'failed') { s.name.state = 'failed'; s.name.code = r.code ?? null; s.name.notSent = r.notSent === true; s.name.error = r.error; }
    else { s.name.state = 'unknown'; s.name.out = true; }
    notify();
  }

  /** A read `now` showed the realm on the computer. A lost send is settled only when `now` is exactly the set it
   *  sent (core's proof). Otherwise the realm is there, but that send stays held and recorded here (code HELD):
   *  only this page can settle core's hold of it, by a later exact read or the person's warned Dismiss. */
  async function landed(it: Item, now: string[]): Promise<void> {
    it.code = null;
    if (it.sent && !sameSet(now, it.sent)) { it.code = 'HELD'; return; }
    if (it.sent) {
      await io.settleRealms(it.id, it.sent, 'applied', it.hold ?? undefined).catch(() => undefined);
      sentAny = true;
    }
    it.sent = null; it.hold = null;
  }

  // The Realm limit refused a sent computer write: the answer holds for every computer here (each adds this same realm).
  const limitRefused = () => s.items.some((it) => it.state === 'failed' && it.code === REALM_LIMIT_CODE && !it.notSent);
  async function sendOne(it: Item): Promise<void> {
    if (limitRefused()) return;
    const prev = it.state;
    it.state = 'sending'; it.code = null; it.notSent = false; it.error = undefined;
    notify();
    const now = await io.readRealms(it.id).catch(() => null);
    if (!live()) { it.state = prev; return; }
    if (now === null) { it.state = 'unchecked'; notify(); return; }
    if (now.includes(id)) { await landed(it, now); it.state = 'saved'; it.shown = now; notify(); return; }
    // Moved since it was shown: nothing is sent; the person sees the new set and decides.
    if (!sameSet(now, it.shown)) { it.state = 'changed'; it.shown = now; notify(); return; }
    // An earlier send of this computer whose answer was lost: the person pressed Add again with the warning shown
    // (it may still land; it only adds this realm too), so its hold is dismissed and this send goes out.
    // The earlier set stays recorded (its warning shown) until this send lands: a refusal leaves it as it was.
    if (it.sent) {
      await io.settleRealms(it.id, it.sent, 'dismiss', it.hold ?? undefined).catch(() => undefined);
      it.hold = null;
      if (!live()) { it.state = prev; notify(); return; }
    }
    const set = nextSet(now, id);
    let r: WriteResult;
    try { r = await io.writeRealms(it.id, set); } catch { r = { outcome: 'unknown' }; }
    // The live I/O refused to send because the page was left or the realm switched meanwhile: nothing went out.
    if (r.outcome === 'failed' && r.notSent === true && !live()) { it.state = prev; notify(); return; }
    if (r.outcome === 'stale') { s.phase = 'stopped'; it.state = 'unknown'; it.sent = set; notify(); return; }
    if (r.outcome !== 'failed') it.sent = null;
    if (r.outcome === 'failed') {
      if (r.notSent !== true) sentAny = true;
      it.state = 'failed'; it.code = r.code ?? null; it.notSent = r.notSent === true; it.error = r.error;
      notify();
      return;
    }
    sentAny = true;
    // The read-back decides for a lost answer; a done answer is proof, and a read-back without the realm then
    // means someone changed its realms right after (gone).
    const back = await io.readRealms(it.id).catch(() => null);
    if (back && back.includes(id)) {
      if (r.outcome === 'unknown') { it.sent = set; it.hold = r.hold ?? null; await landed(it, back); }
      it.state = 'saved'; it.shown = back;
    } else if (r.outcome === 'done') {
      it.state = back ? 'gone' : 'saved';
      if (back) it.shown = back;
    } else { it.state = 'unknown'; it.sent = set; it.hold = r.hold ?? null; }
    notify();
  }

  /** Read only: in the set is saved; out of it is missing (same set as shown) or changed (moved). */
  async function checkOne(it: Item): Promise<void> {
    const now = await io.readRealms(it.id).catch(() => null);
    if (!live() || now === null) return;
    if (now.includes(id)) { await landed(it, now); it.state = 'saved'; it.shown = now; }
    else if (sameSet(now, it.shown)) it.state = 'missing';
    else { it.state = 'changed'; it.shown = now; }
    notify();
  }

  async function each(list: Item[], f: (it: Item) => Promise<void>): Promise<void> {
    for (const it of list) {
      if (!live()) return;
      await f(it);
    }
  }

  async function run(f: () => Promise<void>): Promise<EngineState> {
    busy = true; s.phase = 'running';
    notify();
    try { await f(); } finally {
      if (live() && s.name.state === 'saved' && !tinted && o.color) { io.setTint(id, o.color); tinted = true; }
      if (sentAny && !stopped()) await io.refresh().catch(() => undefined);
      if (!stopped()) s.phase = 'done';
      busy = false;
      notify();
    }
    return snapshot();
  }

  const idle = () => !busy && s.phase !== 'stopped';
  const checkable = (it: Item) => CHECK.has(it.state) || (it.sent !== null && it.state !== 'sending');
  // A HELD send this page can dismiss: not one another page turned out to hold (ELSEWHERE), which is that page's.
  const heldSaved = (it: Item) => it.state === 'saved' && it.sent !== null && it.code !== 'ELSEWHERE';
  const api: Engine = {
    state: snapshot,
    canCheckName: () => idle() && s.phase !== 'idle' && (s.name.state === 'unknown' || (s.name.out && s.name.state !== 'saved' && s.name.state !== 'sending')),
    canSendName: () => idle() && s.phase !== 'idle' && (s.name.state === 'missing' || s.name.state === 'failed') && !NO_RESEND.has(s.name.code ?? ''),
    canCheckComputers: () => idle() && s.name.state === 'saved' && s.items.some(checkable),
    canSendComputers: () => idle() && s.name.state === 'saved' && !limitRefused() && s.items.some((it) => RESEND.has(it.state)),
    limitRefused,
    canDismissHeld: () => idle() && s.items.some(heldSaved),
    canRestart: () => idle() && s.phase !== 'idle' && !sentAny && s.name.state === 'failed' && s.name.notSent,
    start: async () => {
      if (busy || s.phase !== 'idle') return snapshot();
      return run(async () => {
        if (live()) await writeName();
        if (s.name.state === 'saved') await each(s.items, sendOne);
      });
    },
    checkName: async () => {
      if (!api.canCheckName()) return snapshot();
      return run(async () => {
        const names = await io.readNames().catch(() => null);
        if (!live()) return;
        if (names === null) { s.name.unread = true; return; }
        s.name.unread = false;
        // Still absent: whether Try again may go is decided by these names, not by an earlier refusal's code.
        if (!madeIn(names)) { s.name.state = 'missing'; s.name.notSent = false; s.name.code = o.free(names) ? null : 'NAME_TAKEN'; }
      });
    },
    sendName: async () => {
      if (!api.canSendName()) return snapshot();
      return run(async () => {
        if (live()) await writeName();
        if (s.name.state === 'saved') await each(s.items.filter((it) => it.state === 'waiting'), sendOne);
      });
    },
    checkComputers: async () => {
      if (!api.canCheckComputers()) return snapshot();
      return run(() => each(s.items.filter(checkable), checkOne));
    },
    sendComputers: async () => {
      if (!api.canSendComputers()) return snapshot();
      return run(() => each(s.items.filter((it) => RESEND.has(it.state)), sendOne));
    },
    dismissHeld: async () => {
      if (!api.canDismissHeld()) return snapshot();
      return run(() => each(s.items.filter(heldSaved), async (it) => {
        // Only a hold core actually let go of ends the tracking here; one it kept stays, with Check and Dismiss.
        const r = await io.settleRealms(it.id, it.sent ?? [], 'dismiss', it.hold ?? undefined).catch(() => 'kept' as const);
        if (r === 'settled') { it.sent = null; it.hold = null; it.code = null; }
        else if (r === 'other') it.code = 'ELSEWHERE';
        notify();
      }));
    },
  };
  return api;
}

export interface Summary {
  kind: 'ok' | 'empty' | 'part' | 'nameUnknown' | 'nameFailed' | 'stopped';
  saved: number;
  unknown: number;
  refused: number;
  /** Not sent yet (after a name check, or a stop). */
  waiting: number;
  total: number;
}

/** What happened, in words the page can use. Saved, maybe-saved, not added and not sent yet stay apart. */
export function summary(s: EngineState): Summary {
  let saved = 0, unknown = 0, refused = 0, waiting = 0;
  for (const it of s.items) {
    if (it.state === 'saved') saved++;
    // A lost send still out may land after a read without it; a failed read with no send behind it sent nothing:
    // not added yet, not "may have been added".
    else if (it.state === 'unknown' || stillOut(it)) unknown++;
    else if (it.state === 'failed' || it.state === 'changed' || it.state === 'missing' || it.state === 'gone') refused++;
    else waiting++;
  }
  const total = s.items.length;
  let kind: Summary['kind'];
  if (s.phase === 'stopped') kind = 'stopped';
  else if (s.name.state === 'unknown' || s.name.state === 'sending' || s.name.state === 'waiting' || s.name.out) kind = 'nameUnknown';
  else if (s.name.state === 'failed' || s.name.state === 'missing') kind = 'nameFailed';
  else if (total === 0) kind = 'empty';
  else if (saved === total) kind = 'ok';
  else kind = 'part';
  return { kind, saved, unknown, refused, waiting, total };
}

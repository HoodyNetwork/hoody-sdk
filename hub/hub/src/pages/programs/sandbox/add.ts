// New program and Run once: one send each, under C9.
//
// Neither route takes an idempotency key, so a send whose outcome is unknown is held in core (holdAttempt) before it
// leaves, for every tab of the account and after a reload, and nothing sends it again until a read proves it or the
// person's warned Dismiss frees it. One lock per computer and name, so another program can still be added meanwhile.
//
// Check reads the whole program list again (exact names off the wire, never the page's shortened display names); the
// list read just before the send did not show the name. The list carries no command, so a row of the name cannot be
// told apart from one another client made meanwhile:
//   - keep (programs/add): program names are unique on the computer (the daemon refuses a second one). A program of
//     the name means this send either made it or was refused for it, and a resend can no longer add one: the hold
//     is freed and the row opens, worded as found, never as this send's success.
//   - once (quick-start): names are not unique. The send always carries a name; one the Hub made (run-once-<time>-
//     <random>, unguessable) and listed exactly once is this send's. That proves it was created, not that it ran:
//     only the daemon's status `running` says it started, `failed`/`fatal` that it did not; any other status, or
//     none, leaves the start unknown (startOf). A name the person typed may be another run's: shown as listed, the
//     hold stays until the warned Dismiss. A lost answer (5xx) reaches the page without its body (core keeps only
//     status and code), so its temporary id never proves.
// A read that does not show it proves nothing: the request may still be in work on the computer.
//
// Settlement of an answer (the daemon's own answers to an add and to a quick start):
//   - 2xx: done. The add answer is the whole program: only its id and name are read, then it is emptied in place.
//     No core `scrub`: core treats a scrubbed call as secret and rebuilds its rejection from safe fields, which would
//     drop the daemon's refusal text and a quick-start's temporary_id (api.ts: secret = route.secret || !!scrub).
//   - add 400 "program <id> saved but NOT applied…" / "…persisted but its configuration was NOT applied…": the
//     program was SAVED, then the apply failed: shown as added but not applied, never refused.
//   - quick-start 400 carrying a temporary_id: it was created, and its start failed: shown as such.
//   - a 400 with no readable text: unclear (may have saved), held like an unknown.
//   - any other 400, and 413: refused, nothing saved; the daemon's text is shown.
//   - pending (5xx, timeout, network): held, unknown.
// A keep may carry Advanced fields and a sandbox block (extra.body). Its environment values stay out of what is
// shown: a daemon text holding one is withheld (advanced.ts shownText), and the hold never carries them.
import { api, attemptFor, capture, heldAttempts, holdAttempt, outcomeOf, type Ctx, type HeldAttempt, type HubError, type ProgramRawOverview as RawOverview, type Target } from '@core';
import { readOverview } from '../data';
import { addBody, onceBody, type AddForm, type AddMode } from './addform';
import { shownText, type EnvRow } from './advanced';
import { daemonText } from './data';
import { sandboxRoutes as routes } from './routes';

const IDX = 1;
const ADD_BY = 'programs.add';

/** A short, stable tag for a lock name (ids and names never name a lock themselves). */
function tag(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
const computerOf = (t: Target) => `${t.project.id}/${t.container.id}`;
const addLock = (mode: AddMode, t: Target, name: string): string => `programs.${mode}.${tag(computerOf(t))}.${tag(name)}`;

/** What a hold carries: plain names and the computer, never the command. */
export interface AddMeta {
  mode: AddMode;
  name: string;
  computer: string;
  /** The names the whole list showed just before the send (programs for keep, temporaries for once). */
  before: string[];
  /** once: the Hub made the name (the person left it empty), so no one else sends it. */
  generated: boolean;
}
export function metaOf(h: HeldAttempt): AddMeta | null {
  const m = (h.meta ?? null) as Partial<AddMeta> | null;
  if (!m || (m.mode !== 'keep' && m.mode !== 'once') || typeof m.name !== 'string' || typeof m.computer !== 'string' || !Array.isArray(m.before)) return null;
  return { mode: m.mode, name: m.name, computer: m.computer, before: m.before.filter((x): x is string => typeof x === 'string'), generated: m.generated === true };
}

/** This account's held adds and runs on this computer, oldest first. */
export function heldAdds(t: Target | null): { hold: HeldAttempt; meta: AddMeta }[] {
  if (!t) return [];
  const c = computerOf(t);
  const out: { hold: HeldAttempt; meta: AddMeta }[] = [];
  for (const h of heldAttempts()) {
    if (h.by !== ADD_BY) continue;
    const meta = metaOf(h);
    if (meta && meta.computer === c) out.push({ hold: h, meta });
  }
  return out;
}

/** A name for a run left unnamed: starts with a letter, daemon-valid, new each time and unguessable (it proves). */
function onceName(now: number = Date.now()): string {
  const r = new Uint32Array(2);
  crypto.getRandomValues(r);
  return `run-once-${now.toString(36)}-${(r[0] ?? 0).toString(36)}${(r[1] ?? 0).toString(36)}`;
}

export interface Listed {
  /** Every program: its exact name and row key (the page's keys, prog:<id>). */
  programs: Map<string, string>;
  /** Every temporary program: exact name, row key (temp:<id>) and the daemon's status. */
  temps: { name: string; key: string; status: string | null }[];
}

/** One fresh, whole read of the computer's program list; null when it failed or was not the daemon's answer. Names
 *  are the wire's own, whole: the page model shortens long ones for display, which would break the comparison. */
async function readListed(t: Target): Promise<Listed | null> {
  let raw: unknown;
  try {
    raw = await readOverview(t);
  } catch {
    return null;
  }
  const o = raw as Partial<RawOverview> | null;
  if (!o || typeof o !== 'object' || !Array.isArray(o.programs)) return null;
  const programs = new Map<string, string>();
  for (const p of o.programs) {
    if (!p || typeof p !== 'object' || !Number.isInteger(p.id) || typeof p.name !== 'string' || programs.has(p.name)) continue;
    programs.set(p.name, `prog:${p.id}`);
  }
  const temps: Listed['temps'] = [];
  for (const x of Array.isArray(o.temporary) ? o.temporary : []) {
    if (!x || typeof x !== 'object' || typeof x.temporary_id !== 'string' || typeof x.name !== 'string') continue;
    temps.push({ name: x.name, key: `temp:${x.temporary_id}`, status: typeof x.status === 'string' ? x.status : null });
  }
  return { programs, temps };
}

/** The names the list shows for `mode`. */
const namesOf = (mode: AddMode, l: Listed): string[] => (mode === 'keep' ? [...l.programs.keys()] : l.temps.map((x) => x.name));

/** The row of `name`, for a send known to have gone through (a 2xx this Hub could not read): found by name. */
function rowOf(mode: AddMode, name: string, l: Listed): string | null {
  if (mode === 'keep') return l.programs.get(name) ?? null;
  const hits = l.temps.filter((x) => x.name === name);
  return hits.length === 1 && hits[0] ? hits[0].key : null;
}

// What a proved temporary's status says about its start (C9): only `running` is a start; `failed` and `fatal` never
// ran (ephemeral_manager: a failed start or save); everything else (starting, stopped, exited, backoff, unknown,
// missing) proves nothing either way.
export type Start = 'started' | 'notStarted' | 'unknown';
export function startOf(status: string | null): Start {
  if (status === 'running') return 'started';
  return status === 'failed' || status === 'fatal' ? 'notStarted' : 'unknown';
}

export type Judged =
  /** once, a Hub-made name listed once: this send's (created); `start` is what its status says about running. */
  | { kind: 'proved'; key: string; start: Start }
  /** keep: a program of the name exists, from this send or another; no resend can add one now. */
  | { kind: 'found'; key: string }
  /** once, a name the person typed is listed: maybe another run's; the hold stays. */
  | { kind: 'listed' }
  | { kind: 'notYet' };

/** What a fresh list says about a held send (see the top of the file). */
export function judge(meta: AddMeta, now: Listed): Judged {
  if (meta.before.includes(meta.name)) return { kind: 'notYet' };
  if (meta.mode === 'keep') {
    const key = now.programs.get(meta.name);
    return key ? { kind: 'found', key } : { kind: 'notYet' };
  }
  const hits = now.temps.filter((x) => x.name === meta.name);
  if (!hits.length) return { kind: 'notYet' };
  const one = hits.length === 1 ? hits[0] : undefined;
  if (meta.generated && one) return { kind: 'proved', key: one.key, start: startOf(one.status) };
  return { kind: 'listed' };
}

export type AddOutcome =
  | { kind: 'done'; key: string; name: string }
  /** Saved (keep) or created (once), then it failed to apply or start: the row exists. */
  | { kind: 'doneProblem'; key: string; name: string; text: string; withheld?: boolean }
  | { kind: 'refused'; text: string; tooLarge: boolean; withheld?: boolean }
  | { kind: 'pending'; hold: string; name: string; mode: AddMode }
  /** Nothing sent: the list read before it failed, a hold for the name is already out, storage cannot keep one… */
  | { kind: 'notSent'; why: 'read' | 'taken' | 'held' | 'storage' | 'full' | 'account' | 'core'; heldId?: string }
  | { kind: 'stale' };

const SAVED_THEN = /^program (\d+) (?:saved but NOT applied|persisted but its configuration was NOT applied)/;
const QUICK = /^quick_[0-9]{1,20}_[0-9]{1,10}$/;
const rawError = (e: HubError | undefined): string | null => {
  const d = e?.data as { error?: unknown } | undefined;
  return typeof d?.error === 'string' ? d.error : null;
};

/** What a keep adds to its body (Advanced, sandbox), and the environment rows whose values are never shown. */
export interface AddExtra {
  body: Record<string, unknown>;
  env: readonly EnvRow[];
}
const NO_EXTRA: AddExtra = { body: {}, env: [] };

/** Sends the add or run once for `form` on `target`. Never throws; never sends twice. */
export async function sendAdd(form: AddForm, target: Target, extra: AddExtra = NO_EXTRA, ctx: Ctx = capture()): Promise<AddOutcome> {
  const mode = form.mode;
  const typed = form.name.trim();
  const generated = mode === 'once' && !typed;
  const name = generated ? onceName() : typed;
  const before = await readListed(target);
  if (!before) return { kind: 'notSent', why: 'read' };
  const names = namesOf(mode, before);
  if (names.includes(name)) return { kind: 'notSent', why: 'taken' };
  const meta: AddMeta = { mode, name, computer: computerOf(target), before: names, generated };
  const got = await holdAttempt(addLock(mode, target, name), { by: ADD_BY, meta, realm: ctx.realm });
  if (!got.ok) {
    const why = got.code === 'HELD' ? 'held' : got.code === 'NOT_DURABLE' || got.code === 'TOO_LARGE' ? 'storage' : got.code === 'FULL' ? 'full' : got.code === 'NO_ACCOUNT' ? 'account' : 'core';
    return { kind: 'notSent', why, ...(got.code === 'HELD' && got.held ? { heldId: got.held.id } : {}) };
  }
  const hold = got.hold;
  // A hold only this tab knows would not survive a reload, and a reload would offer the send again.
  if (!heldAttempts().some((h) => h.id === hold.id && h.persisted)) {
    hold.release();
    return { kind: 'notSent', why: 'storage' };
  }
  let made: { id: string; name: string } | null = null;
  const take = (a: unknown) => {
    const p = typeof a === 'object' && a !== null ? (a as Record<string, unknown>) : null;
    const prog = p && typeof p.program === 'object' && p.program !== null ? (p.program as Record<string, unknown>) : null;
    const id = mode === 'keep' ? prog?.id : p?.temporary_id;
    const nm = mode === 'keep' ? prog?.name : p?.name;
    if ((typeof id === 'number' && Number.isInteger(id)) || (typeof id === 'string' && (mode === 'keep' ? /^\d+$/.test(id) : QUICK.test(id)))) made = { id: String(id), name: typeof nm === 'string' ? nm : name };
    if (p) for (const k of Object.keys(p)) delete p[k];
  };
  try {
    if (mode === 'keep') take(await api(routes.add, { index: IDX, target, ctx, recovers: true, body: { ...addBody({ ...form, name }), ...extra.body } }));
    else take(await api(routes.quickStart, { index: IDX, target, ctx, recovers: true, body: onceBody({ ...form, name }) }));
  } catch (err) {
    const e = err as HubError;
    const o = outcomeOf(e, true);
    if (o === 'pending') {
      hold.sent();
      return { kind: 'pending', hold: hold.id, name, mode };
    }
    // Not sent, or sent under a context that is gone before it could leave: nothing reached the computer.
    if (o === 'not_sent' || o === 'stale') {
      hold.release();
      return o === 'stale' ? { kind: 'stale' } : { kind: 'notSent', why: 'core' };
    }
    const raw = rawError(e);
    const status = e?.status;
    const said = shownText(raw ?? '', daemonText(e), mode === 'keep' ? extra.env : []);
    const text = said ?? '';
    const withheld = said === null ? { withheld: true } : {};
    if (status === 413) {
      hold.release();
      return { kind: 'refused', text, tooLarge: true, ...withheld };
    }
    if (status === 400 && raw !== null) {
      const saved = mode === 'keep' ? SAVED_THEN.exec(raw) : null;
      const tid = mode === 'once' ? (e.data as { temporary_id?: unknown }).temporary_id : undefined;
      hold.release();
      if (saved) return { kind: 'doneProblem', key: `prog:${saved[1]}`, name, text, ...withheld };
      if (typeof tid === 'string' && QUICK.test(tid)) return { kind: 'doneProblem', key: `temp:${tid}`, name, text, ...withheld };
      return { kind: 'refused', text, tooLarge: false, ...withheld };
    }
    // A 400 with no readable text may be a post-save failure; anything else unexplained may have gone through.
    if (status === 400) {
      hold.sent();
      return { kind: 'pending', hold: hold.id, name, mode };
    }
    hold.release();
    return { kind: 'refused', text, tooLarge: false, ...withheld };
  }
  hold.release();
  const m = made as { id: string; name: string } | null;
  if (!m) {
    // A 2xx this Hub cannot read: it was added, the row is found by name.
    const now = await readListed(target);
    const key = now ? rowOf(mode, name, now) : null;
    return { kind: 'done', key: key ?? '', name };
  }
  return { kind: 'done', key: mode === 'keep' ? `prog:${m.id}` : `temp:${m.id}`, name: m.name };
}

export type CheckResult = Judged | { kind: 'readFailed' } | { kind: 'inFlight' } | { kind: 'gone' };

/** Check, for a hold that was shown: one fresh read; a proof, or a program of the name (keep), frees it. Reads only,
 *  never resends. */
export async function checkHeld(holdId: string, target: Target): Promise<CheckResult> {
  const h = heldAdds(target).find((x) => x.hold.id === holdId);
  if (!h) return { kind: 'gone' };
  if (h.hold.inFlight) return { kind: 'inFlight' };
  const now = await readListed(target);
  if (!now) return { kind: 'readFailed' };
  const again = heldAdds(target).find((x) => x.hold.id === holdId);
  if (!again) return { kind: 'gone' };
  if (again.hold.inFlight) return { kind: 'inFlight' };
  const j = judge(again.meta, now);
  if (j.kind === 'proved' || j.kind === 'found') attemptFor(holdId, ADD_BY)?.release();
  return j;
}

/** The person's warned Dismiss of the hold that was shown: frees it, nothing else. */
export function dismissAdd(holdId: string): boolean {
  const h = heldAttempts().find((x) => x.id === holdId && x.by === ADD_BY);
  if (!h || h.inFlight) return false;
  return attemptFor(holdId, ADD_BY)?.dismiss(true) ?? false;
}

// THE SEAM between the acceptance tests and the journal module's internal API. Every call a
// test makes into something the module may rename lives here; the tests (what must hold) name properties, not functions. Tests that go
// through AskEngine / FakeAgent / the storage fake need no seam.
//
// The door takes an operation: `admit` writes the entry itself and `post` hands the ticket to
// the call. beginEntry/sendThroughDoor keep a two-step shape: beginEntry admits (the entry is written and read back), and
// sendThroughDoor posts that admission. The tests' calls carry no ticket, so `guarded` adds the ticket of the post in progress.
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as J from '../journal';
import { SendToken, dismissal, guardIO } from '../journal';
import { mintForTests, seedEntryForTests } from '../journal/testing';
import type { Ticket } from '@core';
import { destOf } from '../data';
import type { AskRecord } from '../logic';

export type Entry = J.Entry;
export type { AskRecord };
export { J };
export const newJournal = (): J.Journal => new J.Journal();

// ---- reading the stores ----
/** Every entry, or null when the store could not be read (an unreadable store is not an empty one). */
export const entriesSure = (j: J.Journal): Entry[] | null => { const s = j.scan(); return s.s === 'ok' ? [...s.entries] : null; };
export const hasEntry = (j: J.Journal, h: string, k: string): boolean => { const s = j.scan(h); return s.s === 'ok' && s.entries.some((e) => e.k === k); };
export const findRecord = (j: J.Journal, h: string, realm: string, sid: string) => j.find(h, realm, sid);

// ---- writing ----
/** Plants an entry without the door (what another tab or an earlier page life wrote). */
export const writeEntry = (j: J.Journal, e: Entry): 'ok' | 'full' | 'lost' => {
  const r = seedEntryForTests(j, e);
  return r === 'ok' ? 'ok' : r === 'full' ? 'full' : 'lost';
};
export const putRecord = (j: J.Journal, h: string, rec: AskRecord): Promise<string> => j.put(h, rec);
export const dropRecord = (j: J.Journal, h: string, realm: string, sid: string | null, k1: string): Promise<boolean> => j.drop(h, realm, sid, k1);

// ---- removal: only a person's dismissal is available to a test without a reply to prove it ----
/** true when the entry is gone now (the person's dismissal was accepted and its removal done); false when refused or when the removal is
 *  owed (the store would not take it). */
export const dismiss = (j: J.Journal, e: { h: string; k: string }): boolean => { const before = j.owed(); return j.dismiss(e.h, e.k, dismissal()) && j.owed() === before; };
export const owed = (j: J.Journal): number => j.owed();
export const sweep = (j: J.Journal): Promise<void> => j.sweep();

// ---- leases ----
export const leaseSet = (j: J.Journal, h: string, s: string, id: string): boolean => j.leases.set(h, s, id);
export const leaseGet = (j: J.Journal, h: string, s: string): string | null => j.leases.get(h, s);
export const leaseDrop = (j: J.Journal, h: string, s: string): boolean => j.leases.drop(h, s);

// ---- migration ----
export const migrate = (j: J.Journal, recs: readonly AskRecord[], handleOf: (c: string) => string | null): number => j.migrate({ s: 'ok', v: recs, acct: J.currentAccount() ?? '' }, handleOf);
export const migrationDone = (j: J.Journal): boolean => j.migrationDone() === true;

// ---- the send door ----
export const newToken = (): SendToken => new SendToken();
const admissions = new WeakMap<J.Journal, Map<string, J.Admission>>();
let current: Ticket | null = null;
function opOf(e: Entry): J.Op | null {
  const base = { acct: J.currentAccount() ?? '', container: e.ct, h: e.h, r: e.r, key: e.k };
  switch (e.kind) {
    case 'create': return { ...base, route: 'create' };
    case 'turn': return e.s ? { ...base, route: 'turn', sid: e.s, c: e.c, files: !!e.f } : null;
    case 'message': return e.s ? { ...base, route: 'command', sid: e.s, c: e.c, cmd: 'message' } : null;
    // An interrupt entry stores no text, so it cannot be admitted again: the ticket binds the text's digest, which only the sender knows.
    case 'interrupt': return null;
    case 'stop': return e.s ? { ...base, route: 'command', sid: e.s, c: e.c, cmd: 'stop' } : null;
    case 'decision': case 'answer': return e.s && e.g ? { ...base, route: e.kind === 'decision' ? 'confirm' : 'answer', sid: e.s, c: e.c, gate: e.g, gen: e.gn ?? 1 } : null;
  }
}
/** Admits the entry's operation through the door (the entry is written and read back): the old "begin". */
export function beginEntry(j: J.Journal, e: Entry): 'ok' | 'full' | 'lost' {
  const op = opOf(e);
  if (!op) return 'lost';
  mintForTests(j, e.k);
  const a = j.admit(op, new SendToken());
  if ('kind' in a) return a.why === 'full' ? 'full' : 'lost';
  let m = admissions.get(j);
  if (!m) admissions.set(j, (m = new Map()));
  m.set(e.k, a);
  return 'ok';
}
/** Posts the admission of `key` (made by this journal's beginEntry); `go` runs inside the post with the ticket current. With no
 *  admission here (none, or another entry's, or another tab's) nothing is posted: `go` runs unticketed, which the guard refuses. */
export function sendThroughDoor<T>(j: J.Journal, e: Entry | null, key: string, tok: SendToken, go: () => Promise<T>): Promise<T> {
  const a = e && e.k === key ? admissions.get(j)?.get(key) : undefined;
  if (!a) return Promise.resolve().then(go);
  admissions.get(j)!.delete(key);
  tok.onCancel(() => a.cancel());
  return j.post(a, (t) => {
    current = t;
    try { return go(); } finally { current = null; }
  }).then((o) => {
    if (o.kind === 'notSent') throw new Error('not sent: ' + o.why);
    return undefined as T;
  });
}
const POS: Record<string, number> = { create: 3, turn: 6, command: 4, stop: 3, confirm: 3, answer: 3 };
/** The AgentIO a journaled engine uses: the six keyed routes refuse outside the door. The ticket of the post in progress rides on
 *  every call (the tests' calls name no ticket). */
export function guarded<T extends object>(io: T): T {
  const g = guardIO(io as any, { acct: J.currentAccount() ?? '', container: destOf(io) ?? '' }) as any;
  // The guard is frozen, and a Proxy trap over a frozen target must return its exact values: the wrapper's target is a plain object.
  return new Proxy({} as any, {
    get(_t, p) {
      const t = g;
      const m = t[p];
      if (typeof p !== 'string' || !(p in POS) || typeof m !== 'function') return typeof m === 'function' ? m.bind(t) : m;
      return (...args: unknown[]) => {
        const a = args.slice();
        if (current) { while (a.length < POS[p]!) a.push(undefined); a[POS[p]!] = [current]; }
        return m.apply(t, a);
      };
    },
  }) as T;
}

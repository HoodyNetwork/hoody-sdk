// held.ts: the held door. The GitHub run already writes before it sends, in a
// stronger store than the journal's: core's holdAttempt record (compare-and-set, cross-tab, stamped "sending" before each POST).
// Its create/turn/stop keys are repeated on Check under the SAME key (C9), which a journal key (admitted once ever) cannot do. So the
// door has a second admission source, the run's hold, with the same ticket, guard, issuer and locks:
//
//   held.admit(op, holdId, version, tok)  synchronous. ONE tri-state read of the stored hold (attemptStored): the stored version is
//       the one the run just saved with `sending`, the stamp is this tab's and live, and the stored meta names exactly this request.
//       An admission is consumed per stored version (create, turn, stop) or for good (a decision: never resent). Nothing is written.
//   held.post(a, go)  the send lock, the same table read again under it (an account switch between the two reads makes the second
//       one `missing`), one claimed call; once claimed, cancel does not end the wait. Returns the call's raw result: the run classifies
//       it with its own rules, and nothing is settled, removed or written here.
import { attemptStored, isIdemKey, type Ticket } from '@core';
import type { TicketBind } from '@core';
import { routes } from '../data';
import { HELD_SCHEMA, byAdm, capture, drive, holdLock, mintFn, register, sendLockName, stateOf, type SendToken, type Admission, type Hold, type Rec, type Res } from './door';
import { currentAccount } from './storage';
import { classifyReply, type VerdictType } from './proof';
import { isRec, seg } from './shape';
import type { HeldOp, NotSent, NotSentWhy, Op } from './types';

/** The only held sender (core's holds: only it frees them). */
const BY = 'apps.github';
const REQ24 = /^hx-[0-9a-f]{24}$/;
const consumed = new Set<string>();
const HELD_H = 'held';

export type HeldOutcome = NotSent | { kind: 'sent'; x: Res };
const no = (why: NotSentWhy): NotSent => ({ kind: 'notSent', why });
const eq = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** The held door's decision table, applied to one stored read. Returns a NotSent reason, or the stored incarnation. */
function table(P: Op, holdId: string, version: number): { why: NotSentWhy } | { inc: string } {
  const acct = currentAccount();
  if (!acct || acct !== P.acct) return { why: 'account' };
  const S = attemptStored(holdId, BY);
  if (S.s === 'unreadable') return { why: 'unreadable' };
  if (S.s === 'missing') return { why: acct !== S.acct ? 'account' : 'notKept' };
  if (S.acct !== acct) return { why: 'account' };
  const v = S.v, m = v.meta;
  if (!isRec(m) || m.computer !== P.container || m.realm !== P.r || v.realm !== P.r) return { why: 'notKept' };
  if (v.metaVersion !== version || !v.stampHere) return { why: 'notKept' };
  switch (P.route) {
    case 'create': if (v.key !== P.key || m.step !== 'create') return { why: 'notKept' }; break;
    case 'turn': if (m.step !== 'turn' || m.k2 !== P.key || m.sid !== P.sid) return { why: 'notKept' }; break;
    case 'command': if (m.step !== 'running' || m.k4 !== P.key || m.sid !== P.sid) return { why: 'notKept' }; break;
    default: if (m.step !== 'running' || m.sid !== P.sid || !eq(isRec(m.d) ? { rid: m.d.rid, gate: m.d.gate, gen: m.d.gen, kind: m.d.kind } : null, { rid: P.key, gate: P.gate, gen: P.gen, kind: P.route })) return { why: 'notKept' };
  }
  return { inc: v.incarnation };
}
const consumeKey = (inc: string, P: Op, version: number): string =>
  P.route === 'confirm' || P.route === 'answer' ? `${inc}:${P.key}` : `${inc}:${P.key}:${version}`;

/** What a held send's reply proves, by the route's own rules (the same classifier the journal's door uses): `settled` (the documented
 *  success), `admitted`, `notAdmitted` (documented as nothing ran, or never left), `closed` (the gate is gone) or `unknown` (anything else: the request may have
 *  run). The GitHub run clears a stored decision or reports "not sent" only on settled / notAdmitted. */
export function heldVerdict(route: 'create' | 'turn' | 'command' | 'confirm' | 'answer', key: string, res: Res, gate?: { id: string; gen: number }): VerdictType {
  const acct = currentAccount();
  const g = route === 'confirm' || route === 'answer' ? { gate: gate?.id, gen: gate?.gen } : {};
  return classifyReply({ acct, h: HELD_H, k: key, route, ...g }, res).t;
}

export interface HeldDoor {
  admit(op: HeldOp, holdId: string, version: number, tok: SendToken): Admission | NotSent;
  post(a: Admission, go: (t: Ticket) => unknown): Promise<HeldOutcome>;
}

export const held: HeldDoor = {
  admit(op, holdId, version, tok) {
    if (tok.cancelled) return no('cancelled');
    const cap = capture(op, HELD_SCHEMA);
    if (!cap || typeof holdId !== 'string' || !holdId || !Number.isInteger(version)) return no('invalid');
    const keyOk = cap.route === 'confirm' || cap.route === 'answer' ? REQ24.test(cap.key) : isIdemKey(cap.key);
    if (!keyOk || !seg(cap.container) || (cap.route === 'command' && cap.cmd !== 'stop') || (cap.route !== 'create' && !seg((cap as { sid: string }).sid))) return no('invalid');
    const P = Object.freeze({ ...cap, h: HELD_H, c: cap.key, ...(cap.route === 'turn' ? { files: false } : {}) }) as Op;
    const t = table(P, holdId, version);
    if ('why' in t) return no(t.why);
    const cKey = consumeKey(t.inc, P, version);
    if (consumed.has(cKey)) return no('consumed');
    consumed.add(cKey);
    let ticket: Ticket;
    try {
      ticket = mintFn()({ route: routes[P.route] as TicketBind['route'], container: P.container, sid: P.route === 'create' ? null : P.sid, idem: P.route === 'create' || P.route === 'turn' || P.route === 'command' ? P.key : null });
    } catch { return no('noTicket'); }
    const rec: Rec = { op: P, acct: P.acct, written: null, ticket, state: 'A', door: held, held: { holdId, version } };
    return register(rec, ticket, tok, () => cancelHeld(rec));
  },

  async post(a, go) {
    const r = byAdm.get(a as object);
    if (!r || r.door !== held || r.state !== 'A' || !r.ticket || !r.held) return no('noTicket');
    const info = r.held;
    r.state = 'L';
    let stop: (() => void) | null = null;
    const cancelled = new Promise<'cancelled'>((res) => { stop = () => res('cancelled'); });
    r.onCancel = () => stop?.();
    const abort = (why: NotSentWhy): HeldOutcome => { r.state = 'X'; return no(why); };
    let hold: Hold | null = null;
    let release: (() => void) | null = null;
    try {
      hold = holdLock(sendLockName(r.op.key));
      const got = await Promise.race([hold.held.then((rel) => ({ rel }), () => ({ refused: true as const })), cancelled]);
      if (got === 'cancelled') return abort('cancelled');
      if ('refused' in got) return abort('lockRefused');
      release = got.rel;
      if (stateOf(r) === 'X') return no('cancelled');
      const t = table(r.op, info.holdId, info.version);
      if ('why' in t) return abort(t.why);
      r.state = 'R';
      return await drive<HeldOutcome>(r, go, {
        sent: (res) => ({ kind: 'sent', x: res }),
        claimedCancel: null,
        notSent: no,
        revoke: () => { r.state = 'X'; },
      });
    } finally {
      hold?.cancel();
      try { release?.(); } catch { /* released */ }
    }
  },
};

function cancelHeld(r: Rec): void {
  if (r.state === 'X') return;
  if (r.state !== 'C' && r.state !== 'P') r.state = 'X';
  try { r.onCancel?.(); } catch { /* a listener of its own */ }
}

/** Tests only: forget what this page consumed. */
export function resetHeldForTests(): void { consumed.clear(); }

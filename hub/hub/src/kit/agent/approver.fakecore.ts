// Test harness for the approver lease: a stand-in for core's ticket steps 4-7 around the REAL lease issuer. It does
// what core does with one lease ticket (check, spend, the answer hook on a success, settled on every outcome) and nothing
// else, so custody and the machine can be tested apart from the real ticket path; the real-path tests run
// through real core.
import type { Ticket, TicketBind, TicketCall, TicketIssuer } from '@core';
import type { providers } from '@core';

export type Reply = providers.Settled<unknown>;
export const ok = (body: unknown = {}): Reply => ({ ok: true, body });
export const fail = (status: number, code: string, kind: 'failed' | 'not_sent' | 'pending' | 'stale' = 'failed'): Reply =>
  ({ ok: false, err: { kind, code, status, retryAfter: null, details: {} } });
export const notSent = (): Reply => fail(0, 'not_sent', 'not_sent');
export const timeout = (): Reply => fail(0, 'timeout', 'failed');
export const pending = (): Reply => fail(202, 'pending', 'pending');

export interface Spent { header: string | null; ticket: Ticket }

export function fakeCore() {
  let issuer: TicketIssuer | null = null;
  const spentTickets = new WeakSet<object>();
  const claim = (_kind: 'lease', i: TicketIssuer) => { issuer = i; return (bind: TicketBind): Ticket => Object.freeze({ bind }) as unknown as Ticket; };
  const callOf = (t: Ticket, body?: unknown): TicketCall => ({ ...(t as unknown as { bind: TicketBind }).bind, realm: undefined, body });
  return {
    claim,
    /** core steps 4-5: check, then spend. null = refused unsent (nothing spent). */
    spend(t: Ticket, body?: unknown): Spent | null {
      if (!issuer || spentTickets.has(t)) return null;
      const call = callOf(t, body);
      if (!issuer.check(t, call)) return null;
      spentTickets.add(t);
      return { header: issuer.spend(t, call), ticket: t };
    },
    /** The issuer's own check, with no spent bookkeeping of the stand-in (single use is the issuer's too). */
    check(t: Ticket): boolean { return !!issuer && issuer.check(t, callOf(t)); },
    /** core steps 6-7: the answer hook on a success, then settled. */
    deliver(s: Spent, r: Reply): void {
      if (r.ok) issuer?.answer?.(s.ticket, r.body);
      issuer?.settled?.(s.ticket, r);
    },
    /** spend and deliver at once. */
    send(t: Ticket, r: Reply, body?: unknown): { header: string | null } | null {
      const s = this.spend(t, body);
      if (!s) return null;
      this.deliver(s, r);
      return { header: s.header };
    },
  };
}

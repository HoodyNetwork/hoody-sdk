// Test harness for the approver lease: a small port of the agent's lease record behind the stand-in
// for core's ticket steps. One record per session (it keeps the verifier after expiry until a release or a rotation replaces it):
// acquire (a proof rotates it, no proof meets `held`), renew and verified decision (each takes its time sample at ENTRY and applies
// `sample + TTL` when it is processed, which may be much later, as the agent does), release; the epoch, the generation
// (restarting from 0 after a cold restore), and a network that chooses separately when a request is processed and when its reply is
// delivered: processed now and delivered now (`ok`), processed now and delivered later (`hold`), processed now and never delivered
// (`lost`), never processed (`timeout`/`drop`), or answered as a timeout and processed LATER (`late`, `decideCall(..., 'late')`).
import type { Ticket } from '@core';
import type { ApproverApi, ApproverRoutes } from './approver';
import { TTL as APPROVER_TTL } from './approver-custody';
import { fail, fakeCore, notSent, ok, timeout, type Reply, type Spent } from './approver.fakecore';

interface Lease { cap: string; holder: string; expires: number; generation: number }
export type Net = 'ok' | 'timeout' | 'drop' | 'hold' | 'lost' | 'bad' | 'late';
export type DecideHow = 'ok' | 'pending' | 'gate_pending' | 'late' | 'slow' | 'timeout' | 'notSent';
export interface Sent { op: string; id: string; header: string | null; keepalive?: boolean; at: number; tag: string; res: string }
interface Late { op: 'renew' | 'decide'; id: string; header: string; sample: number; due: number }

/** `delay` draws how long a delayed request waits before the daemon gets to it (daemon time); `runDue()` then processes what is due. */
export function fakeDaemon(now: () => number, mono: () => number = now, delay: () => number = () => 0) {
  const core = fakeCore();
  const leases = new Map<string, Lease>();
  const everMinted = new Map<string, number>(); // cap -> its last known expiry (ground truth for tests)
  let n = 0, epoch = 'e1', generation = 0, live = true;
  const sent: Sent[] = [];
  const held: Array<() => void> = [];
  const lateQ: Late[] = [];
  const slowQ: Array<Late & { s: Spent }> = [];   // answered only when processed: in flight, open, for as long as it waits
  const net = { mode: 'ok' as Net };
  const ctx = { tag: '' };
  const log: string[] = [];
  let inflight = new Map<string, number>();   // replaced (not cleared) by forgetInflight: a request decrements the maps it was counted in
  let outs = new Map<string, number>();
  const stats = { maxAcqInflight: 0, maxOut: 0 };   // acquires (and with renews: acquires + renews) sent and not yet settled, the most at once for any one session
  const get = (id: string, at: number = now()): Lease | null => { const l = leases.get(id); return l && l.expires > at ? l : null; };
  const info = (): { epoch: string } => ({ epoch });

  function handle(op: 'acquire' | 'renew' | 'release' | 'decide', id: string, header: string | null, holder: string, sample: number): Reply {
    if (!live) return fail(404, 'not_found');
    if (op === 'acquire') {
      const l = get(id, sample);
      if (!holder) return fail(409, 'approver_lease_invalid');
      if (l && l.cap !== header) return fail(409, header ? 'approver_lease_invalid' : 'approver_lease_held');   // a proof the record does not name is refused as invalid; no proof meets the holder
      const cap = `CAP${++n}`;
      const next: Lease = { cap, holder, expires: sample + APPROVER_TTL, generation: ++generation };
      leases.set(id, next);
      everMinted.set(cap, next.expires);
      return ok({ lease: cap, generation: next.generation, info: info() });
    }
    const raw = leases.get(id);
    if (!raw || header !== raw.cap) return fail(409, 'approver_lease_invalid');
    if (op === 'release') { leases.delete(id); return ok({ info: info() }); }
    if (raw.expires <= sample) return fail(410, 'approver_lease_expired');
    raw.expires = sample + APPROVER_TTL;                        // may shorten, or revive what the clock has since expired
    everMinted.set(raw.cap, raw.expires);
    return op === 'decide' ? ok({ status: 'ok' }) : ok({ generation: raw.generation, info: info() });
  }
  async function run(op: 'acquire' | 'renew' | 'release', id: string, t: Ticket, holder = '', keepalive = false): Promise<Reply> {
    const s = core.spend(t);
    if (!s) return notSent();
    const sample = now();
    const inf = inflight, ou = outs;
    const entry: Sent = { op, id, header: s.header, ...(keepalive ? { keepalive } : {}), at: mono(), tag: ctx.tag, res: '' };
    sent.push(entry);
    if (op === 'acquire') { const k = (inf.get(id) ?? 0) + 1; inf.set(id, k); stats.maxAcqInflight = Math.max(stats.maxAcqInflight, k); }
    if (op !== 'release') { const k = (ou.get(id) ?? 0) + 1; ou.set(id, k); stats.maxOut = Math.max(stats.maxOut, k); }
    const at = net.mode;
    let out: Reply;
    if (at === 'late' && op === 'renew') { lateQ.push({ op, id, header: s.header ?? '', sample, due: now() + delay() }); entry.res = 'late'; out = timeout(); }
    else {
      const processed = at === 'timeout' || at === 'drop' ? null : at === 'bad' ? fail(400, 'bad_request') : handle(op, id, s.header, holder, sample);
      entry.res = at === 'lost' ? 'lost' : processed ? (processed.ok ? 'ok' : `${processed.err.status}`) : 'unprocessed';
      log.push(`${op}:${s.header ?? '-'}:${at}:${entry.res}`);
      if (at === 'hold') await new Promise<void>((res) => { held.push(res); });
      else await Promise.resolve();
      out = at === 'lost' ? timeout() : processed ?? timeout();
    }
    if (op === 'acquire') inf.set(id, (inf.get(id) ?? 1) - 1);
    if (op !== 'release') ou.set(id, (ou.get(id) ?? 1) - 1);
    core.deliver(s, out);
    return out;
  }
  /** A decision through the lease: the page spent `t` (its header is the lease), the daemon touches the lease with its entry sample. */
  function decideCall(t: Ticket, id: string, how: DecideHow): string | null {
    const s = core.spend(t);
    if (!s) return null;
    const sample = now();
    sent.push({ op: 'decide', id, header: s.header, at: mono(), tag: ctx.tag, res: how });
    if (how === 'notSent') core.deliver(s, notSent());
    else if (how === 'timeout') core.deliver(s, timeout());
    else if (how === 'slow') slowQ.push({ op: 'decide', id, header: s.header ?? '', sample, due: now() + delay(), s });
    // accepted but not applied yet (HTTP 202 reads as a 2xx body), or refused as pending, or no answer at all: the touch runs LATER
    else if (how === 'late' || how === 'gate_pending' || how === 'pending') { lateQ.push({ op: 'decide', id, header: s.header ?? '', sample, due: now() + delay() }); core.deliver(s, how === 'late' ? timeout() : how === 'pending' ? ok({ status: 'pending' }) : fail(409, 'gate_decision_pending')); }
    else core.deliver(s, handle('decide', id, s.header, '', sample));
    return s.header;
  }
  const api: ApproverApi = {
    acquire: (id, _realm, holder, t) => run('acquire', id, t, holder),
    renew: (id, _realm, t) => run('renew', id, t),
    release: (id, _realm, t, keepalive) => run('release', id, t, '', keepalive),
  };
  const routes: ApproverRoutes = { acquire: { n: 'acquire' } as never, renew: { n: 'renew' } as never, release: { n: 'release' } as never };
  return {
    core, api, routes, net, sent, leases, log, ctx, stats, decideCall,
    /** Deliver the held replies, in order. */
    releaseHeld(): void { for (const f of held.splice(0)) f(); },
    /** Deliver one held reply (by its send order), the rest stay held. */
    releaseHeldAt(i: number): void { const f = held.splice(i, 1)[0]; if (f) f(); },
    heldCount: (): number => held.length,
    /** Process one request that was answered as a timeout, now, with the time sample it took at entry. */
    processLate(i = 0): boolean { const q = lateQ.splice(i, 1)[0]; if (!q) return false; handle(q.op, q.id, q.header, '', q.sample); return true; },
    /** Process everything whose delay is over, in due order. */
    runDue(): void {
      for (const q of [...lateQ, ...slowQ].filter((x) => x.due <= now()).sort((a, b) => a.due - b.due)) {
        const i = lateQ.indexOf(q);
        if (i >= 0) { lateQ.splice(i, 1); handle(q.op, q.id, q.header, '', q.sample); continue; }
        const j = slowQ.indexOf(q as never);
        if (j >= 0) { const [sq] = slowQ.splice(j, 1); core.deliver(sq!.s, handle('decide', sq!.id, sq!.header, '', sq!.sample)); }
      }
    },
    lateCount: (): number => lateQ.length,
    /** An account change fenced every request on the wire: what is counted from here is the new account's. */
    forgetInflight(): void { inflight = new Map(); outs = new Map(); stats.maxAcqInflight = 0; stats.maxOut = 0; },
    /** Process one decision that is still in flight with its entry sample, and answer it. */
    processSlow(i = 0): boolean { const q = slowQ.splice(i, 1)[0]; if (!q) return false; core.deliver(q.s, handle('decide', q.id, q.header, '', q.sample)); return true; },
    slowCount: (): number => slowQ.length,
    restart(): void { leases.clear(); epoch = `e${++n}`; generation = 0; },
    /** A new incarnation of the session under the same id and epoch: no record, generation from 0. */
    coldRestore(): void { leases.clear(); generation = 0; },
    unlive(): void { live = false; }, relive(): void { live = true; },
    expireAll(): void { for (const l of leases.values()) { l.expires = now() - 1; everMinted.set(l.cap, l.expires); } },
    leaseOf: (id: string): Lease | null => get(id),
    expiryOf: (cap: string): number => everMinted.get(cap) ?? 0,
    /** Ground truth: the daemon still retains the verifier. It is kept after expiry until a release or a rotation replaces it, and a request sampled while the lease lived (or a clock step) may still revive it. */
    couldEverVerify: (cap: string): boolean => [...leases.values()].some((l) => l.cap === cap),
    /** What a create/attach mint answers for a session (the Hub reads it; a held lease is `approver_lease_error`). */
    mintAnswer(id: string): unknown {
      if (!live) return { session_id: id };
      if (get(id)) return { session_id: id, approver_lease_error: 'approver_lease_held' };
      const r = handle('acquire', id, null, 'mint', now());
      return r.ok ? { session_id: id, approver_lease: { lease: (r.body as { lease: string }).lease, generation: (r.body as { generation: number }).generation } } : { session_id: id };
    },
    info,
  };
}

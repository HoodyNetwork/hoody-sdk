// activate.ts: the one door from a read source to an ACTIVE one. `send`, `stop`, `decide`, `answer` and `check`
// exist only on what `activateSource` returns, and every one of them is checked against `can()` at the moment it is
// called, so a surface that drew a button before a lease lapsed still cannot send around the prerequisites.
// Engine-free: the host (ask/, the Bot runtime) supplies the read side, the operations and the
// readiness facts; nothing here knows how a request is built or where the journal lives.
//
// What this module guarantees, whatever the host's operations do:
//   - Facts. `mode` is 'active' and `prereq` is the host's live readiness (journal, by-key recovery, attachment lease,
//     and for a Strict chat a HELD approver lease; "not needed" never stands in for a lease, capability.ts). `can()` turns
//     a surface on only when all of them are present.
//   - Unknown outcomes. A decision whose answer was lost (a gate entry with decision 'unknown') and every send the host
//     reports in `unsettled()` count in `facts.unsettledSends`, which is what makes Check again possible. An operation
//     that throws, rejects or answers something that is not a SendOutcome comes back as `unknown`, never as done or failed
//     (C9): after a request may have left, nobody knows.
//   - Refusals are typed and nothing is called: a refused action returns { k: 'refused', code: <the capability reason> }.
// The host's operations write their key to the journal BEFORE the first request (the ask engine does); this module
// cannot do that for them, it only refuses to call them while the journal is missing.
import { can, type Action, type CapFacts, type Capability } from './capability';
import type { ApproverState } from './approver';
import type { ShellJobStops } from './shellJobStop';
import { whyWords } from './why';
import type { ActiveSource, Answer, ConversationSource, ConvSnapshot, Decision, Draft, ForkOutcome, ForkRowView, GateRef, PendingRef, SendOutcome, TakeBack, Watch, WatchRank, WithdrawOutcome } from './source';

export type Readiness = CapFacts['prereq'];

/** What the host does; each call is made only after `can()` allowed it. A thrown error is an unknown outcome. */
export interface SourceOps {
  send(d: Draft, o?: { autoApproveTurn?: boolean }): Promise<SendOutcome>;
  stop(scope: 'turn' | 'chat'): Promise<SendOutcome>;
  decide(g: GateRef, d: Decision): Promise<SendOutcome>;
  answer(g: GateRef, a: Answer): Promise<SendOutcome>;
  check(p: PendingRef): Promise<SendOutcome>;
  /** Reads the conversation again for a turn whose outcome is not known; never sends. Optional. */
  recheckOutcome?(): void;
  /** Row actions. The host re-reads the row at the call and refuses one that is no longer on offer. */
  resend?(p: PendingRef): Promise<SendOutcome>;
  retry?(p: PendingRef): Promise<SendOutcome>;
  takeBack?(p: PendingRef): TakeBack;
  /** Asks the agent to take a queued follow-up back; the host never sends it twice for one row. */
  withdraw?(p: PendingRef, then: 'remove' | 'edit'): Promise<WithdrawOutcome>;
  dismissDecision(g: GateRef): void;
  canDismiss(g: GateRef): boolean;
  /** Optional: a host that cannot fork leaves them out and the active source has no fork. */
  fork?(o?: { turn: number; pin?: number }): Promise<ForkOutcome>;
  checkFork?(k1: string): Promise<ForkOutcome>;
  hideFork?(k1: string): Promise<boolean>;
  forks?(): readonly ForkRowView[] | null;
  /** The chat's shell jobs. `gate` is this module's own can('stopJob'), read at each press, so the store's Stop is
   *  checked against the same prerequisites as every other operation. A host without shell jobs leaves it out. */
  shellJobs?(gate: () => Capability): ShellJobStops | null;
}

export interface ActivationDeps {
  /** The host's read side. Its facts carry everything except `mode`, `prereq` and the unknown decisions. */
  read: ConversationSource;
  ops: SourceOps;
  /** Live: the journal, by-key recovery, attachment lease and approver lease as they are right now. */
  readiness(): Readiness;
  /** Called when readiness changes; returns the unsubscribe. */
  onReadiness(fn: () => void): () => void;
  /** Sends and commands whose outcome is not known yet (lost decisions are counted from the gates, not here). The count is
   *  part of the subscribed snapshot: its `subscribe` fires on every change, so a surface repaints when Check again appears. */
  unsettled?: { count(): number; subscribe(fn: () => void): () => void };
}

/** The approver fact the capability table reads, from the lease manager's state. Only a HELD lease counts for a Strict chat;
 *  a chat that is not Strict needs none. An expired, absent or failing lease is `missing`; another window's is `elsewhere`. */
export function approverFactOf(strict: boolean, st: ApproverState): Readiness['approver'] {
  if (!strict) return 'notNeeded';
  if (st.phase === 'held') return 'held';
  return st.phase === 'elsewhere' ? 'elsewhere' : 'missing';
}

const outcomeOf = (o: unknown): SendOutcome => {
  if (o && typeof o === 'object') {
    const k = (o as { k?: unknown }).k;
    if (k === 'done') return { k: 'done' };
    if (k === 'unknown') return { k: 'unknown' };
    if (k === 'refused' && typeof (o as { code?: unknown }).code === 'string') return { k: 'refused', code: (o as { code: string }).code };
  }
  return { k: 'unknown' };
};

/** The refusal of a fork by the capability table, in words, or null when the chat can be forked now. */
export function forkGate(f: CapFacts): ForkOutcome | null {
  const c = can('fork', f);
  return c.ok ? null : { k: 'refused', words: whyWords(c), reason: 'refused' };
}

const takeBackOf = (o: unknown): TakeBack => {
  if (o && typeof o === 'object') {
    const r = o as { k?: unknown; text?: unknown; files?: unknown; code?: unknown };
    if (r.k === 'text' && typeof r.text === 'string' && typeof r.files === 'number' && Number.isFinite(r.files) && r.files >= 0) return { k: 'text', text: r.text, files: r.files };
    if (r.k === 'refused' && typeof r.code === 'string') return { k: 'refused', code: r.code };
  }
  return { k: 'refused', code: 'failed' };
};

/** A withdraw's answer as the kit reads it: anything that is not one of the outcomes is unknown (the request may have gone). */
const withdrawOf = (o: unknown): WithdrawOutcome => {
  if (o && typeof o === 'object') {
    const r = o as { k?: unknown; text?: unknown; code?: unknown };
    if (r.k === 'withdrawn') return typeof r.text === 'string' ? { k: 'withdrawn', text: r.text } : { k: 'withdrawn' };
    if (r.k === 'taken' || r.k === 'ended') return { k: r.k };
    if (r.k === 'refused' && typeof r.code === 'string') return { k: 'refused', code: r.code };
  }
  return { k: 'unknown' };
};

export function activateSource(deps: ActivationDeps): ActiveSource {
  const { read, ops } = deps;
  let cache: { base: ConvSnapshot; ready: string; extra: number; snap: ConvSnapshot } | null = null;

  const snapshot = (): ConvSnapshot => {
    const base = read.snapshot();
    const ready = deps.readiness();
    const key = `${ready.journal}|${ready.recovery}|${ready.attachment}|${ready.approver}`;
    const extra = deps.unsettled ? Math.max(0, deps.unsettled.count()) : 0;
    if (cache && cache.base === base && cache.ready === key && cache.extra === extra) return cache.snap;
    const unknownDecisions = base.gates.filter((g) => g.decision === 'unknown').length;
    const pending = base.gates.some((g) => g.decision !== null);
    const facts: CapFacts = {
      ...base.facts,
      mode: 'active',
      prereq: { ...ready },
      unsettledSends: base.facts.unsettledSends + unknownDecisions + extra,
      decisionPending: base.facts.decisionPending || pending,
    };
    const snap: ConvSnapshot = { ...base, facts };
    cache = { base, ready: key, extra, snap };
    return snap;
  };
  const canNow = (a: Action): Capability => can(a, snapshot().facts);

  /** Runs `fn` only when every listed action is allowed right now; the first refusal is the answer. */
  const guarded = async (actions: readonly Action[], fn: () => Promise<SendOutcome>): Promise<SendOutcome> => {
    for (const a of actions) {
      const c = canNow(a);
      if (!c.ok) return { k: 'refused', code: c.reason };
    }
    try { return outcomeOf(await fn()); } catch { return { k: 'unknown' }; }
  };

  /** A fork is checked against `can('fork')` when called; a refusal by the table makes nothing, and says so in words. The host's
   *  operation answers the rest. */
  const forked = async (fn: () => Promise<ForkOutcome>): Promise<ForkOutcome> => forkGate(snapshot().facts) ?? fn();

  // Only a journaled, readable chat has an entry to give up on; the host says whether this gate has one.
  const canDismiss = (g: GateRef): boolean => {
    const f = snapshot().facts;
    return f.reach === 'ok' && f.prereq.journal && ops.canDismiss(g);
  };

  return {
    kind: read.kind,
    ref: read.ref,
    snapshot,
    subscribe(fn) {
      const a = read.subscribe(fn), b = deps.onReadiness(fn), c = deps.unsettled ? deps.unsettled.subscribe(fn) : () => undefined;
      return () => { a(); b(); c(); };
    },
    watch: (w: Watch, rank?: WatchRank) => read.watch(w, rank),
    can: canNow,
    send(d, o) {
      // A message while a turn runs is a follow-up; either way the chat must be allowed to take it.
      const f = snapshot().facts;
      const action: Action = f.turn || f.gate !== 'none' ? 'followUp' : 'send';
      const need: Action[] = [action];
      if (d.images && d.images.length) need.push('attachImages');
      if (o?.autoApproveTurn) need.push('autoApproveTurn');
      return guarded(need, () => ops.send(d, o));
    },
    stop: (scope) => guarded([scope === 'turn' ? 'stopTurn' : 'stopChat'], () => ops.stop(scope)),
    decide: (g, d) => guarded(['decide'], () => ops.decide(g, d)),
    answer: (g, a) => guarded(['answer'], () => ops.answer(g, a)),
    check: (p) => guarded(['check'], () => ops.check(p)),
    // A read only, so no send prerequisite and no unsettled send is needed; a chat that is gone has nothing to read.
    ...(ops.recheckOutcome ? { recheckOutcome: () => { if (snapshot().facts.state !== 'gone') ops.recheckOutcome!(); } } : {}),
    ...(ops.resend ? { resend: (p: PendingRef) => guarded(['resend'], () => ops.resend!(p)) } : {}),
    ...(ops.retry ? { retry: (p: PendingRef) => guarded(['retry'], () => ops.retry!(p)) } : {}),
    ...(ops.takeBack ? {
      takeBack(p: PendingRef): TakeBack {
        // A local change, not a send: no prerequisites, but the table still decides (a read-only source has no such method at all).
        const c = canNow('takeBack');
        if (!c.ok) return { k: 'refused', code: c.reason };
        try { return takeBackOf(ops.takeBack!(p)); } catch { return { k: 'refused', code: 'failed' }; }
      },
    } : {}),
    ...(ops.withdraw ? {
      async withdraw(p: PendingRef, then: 'remove' | 'edit'): Promise<WithdrawOutcome> {
        // Checked at the call like every other change; a refusal by the table asks the agent nothing.
        const c = canNow('withdraw');
        if (!c.ok) return { k: 'refused', code: c.reason };
        try { return withdrawOf(await ops.withdraw!(p, then)); } catch { return { k: 'unknown' }; }
      },
    } : {}),
    canDismiss,
    dismissDecision(g) {
      if (canDismiss(g)) ops.dismissDecision(g);
    },
    ...(ops.fork ? { fork: (o?: { turn: number; pin?: number }) => forked(() => ops.fork!(o)) } : {}),
    ...(ops.checkFork ? { checkFork: (k1: string) => ops.checkFork!(k1) } : {}),
    ...(ops.hideFork ? { hideFork: (k1: string) => ops.hideFork!(k1) } : {}),
    ...(ops.forks ? { forks: () => ops.forks!() } : {}),
    ...(ops.shellJobs ? { shellJobs: () => ops.shellJobs!(() => canNow('stopJob')) } : {}),
  };
}

// The model chooser's reads and its setup attempts: one hook per caller, so the
// caller's final action judges against the same evidence the chooser shows.
//
// Contract:
//   - Each read takes the next seq when it starts, together with capture(target). Its answer is accepted only when
//     its seq is newer than the last accepted one, alive(ctx) still holds, the scope is still today's and the hook is
//     still mounted. Anything else is dropped.
//   - Triggers: mount, a scope change, retry() (Try again), a setup attempt, and return to the tab (at most one read
//     per 10 s). At most one read runs per visit; a trigger during one sets a single "again" flag.
//   - A failed read keeps the last accepted evidence (`failedAt` says when it failed; the evidence keeps its own
//     age). With no evidence yet, the failure is the evidence: a settled failed part, never "loading".
//   - Background evidence never acts. Its only effect beyond new rows is settling the live setup attempt, and only
//     with a read that started after the attempt opened (seq >= minSeq).
//   - Each visit of a scope (from the commit that shows it to the commit that shows another, or unmount) has a
//     generation, and a read belongs to the visit that started it: once that visit ends its answer is dropped, even
//     when the scope comes back to the same value. A new visit (account, realm, generation, computer, or the Claude
//     offer) drops the evidence and ends the attempt at its commit, before passive effects. StrictMode's replay of
//     the same visit keeps its one read.
//   - An attempt ended (Back, another pick, a view change, a scope change, unmount) has no effect at all: its
//     alive() is false, its onSettle is never called and the hook's `setup` no longer shows it.
//   - The Claude Code part is read only when the caller offers it.
import { useCallback, useInsertionEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { agent, alive, capture, providers, useCore, type Ctx, type Target } from '@core';
import { useReloadOnReturn } from '../media';

type Evidence = providers.Evidence;
type Scope = providers.Scope;
type Snapshot = providers.Snapshot;
type Part<T> = providers.Part<T>;

/** The reads one hook makes for one computer. Tests pass their own. */
export interface CatalogueReads {
  catalogue: providers.CatalogueReader;
  /** GET the Claude Code report (agentApi().acp). Read only when the caller offers Claude Code. */
  acp?: () => ReturnType<agent.AgentApi['acp']>;
}

export interface CatalogueOptions {
  /** The caller offers Claude Code rows: read the Claude part. */
  claude?: boolean;
  /** Specs an older agent probes first: the current, the default and the remembered spec. */
  wanted?: readonly string[];
  /** The reads for a computer, bound to the read's captured context (default: providersApi + agentApi). */
  reads?: (target: Target, ctx: Ctx) => CatalogueReads;
  /** At most one return-to-tab read per gap (10 s). */
  gapMs?: number;
  now?: () => number;
}

export type AttemptIntent = 'choose' | 'browse';

/**
 * How a setup attempt settled. The words are the chooser's.
 *   checking: nothing has settled it yet ("Key saved. Checking {provider}…").
 *   read_failed: its own read failed and nothing newer settled it (Check again).
 *   still_needs: the provider still needs setup (the step stays open).
 *   unconfirmed: no trusted ready list: the ready read failed or an older agent (Check again, Choose a model).
 *   chosen: intent choose and the remembered spec is ready: `choice` is what the chooser hands onChoose.
 *   not_yet: the provider has ready models, but not the remembered spec (Choose a model, Check again).
 *   ready_now: intent browse and a model of the provider is ready (Choose a model).
 *   none_ready: the trusted list holds no model of the provider (Check again).
 */
export type AttemptResult =
  | { kind: 'checking' }
  | { kind: 'read_failed' }
  | { kind: 'still_needs' }
  | { kind: 'unconfirmed' }
  | { kind: 'chosen'; choice: Extract<providers.Choice, { kind: 'model' }> }
  | { kind: 'not_yet' }
  | { kind: 'ready_now' }
  | { kind: 'none_ready' };

export interface AttemptInput {
  /** The provider id set up. */
  provider: string;
  /** The model the person picked before setting up (intent choose). */
  spec?: string;
  intent: AttemptIntent;
  /** Called with each result that settles the attempt while it is live; never after it ended. */
  onSettle?: (r: AttemptResult) => void;
}

export interface AttemptView {
  id: number;
  provider: string;
  spec: string | null;
  intent: AttemptIntent;
  /** The seq of the read the attempt started itself: only evidence at least this new settles it. */
  minSeq: number;
  result: AttemptResult;
}

export interface Attempt {
  id: number;
  minSeq: number;
  /** False once the attempt ended or its scope ended: a late step sends nothing. */
  alive(): boolean;
  /** End it (Back, another pick, a view change): no note, no navigation, no choice. */
  end(): void;
}

export interface ModelCatalogue {
  /** The newest accepted evidence for today's scope; null with no computer or before the first answer. */
  evidence: Evidence | null;
  /** Today's scope; null = no computer ("Choose a computer first"). */
  scope: Scope | null;
  /** A read is running. */
  reading: boolean;
  /** When the newest read failed while older evidence is kept ("Checked {age} ago. Couldn't check again."); else null. */
  failedAt: number | null;
  /** A new read nobody is waiting on (a return to the tab, a setup check): shows nothing. */
  retry(): void;
  /** Try again, pressed: a new read, or one more after the running one. */
  pressRetry(): void;
  /** The read a press asked for has not answered yet: the button's pending state. */
  retrying: boolean;
  /** Open a setup attempt once a credential step settled (key saved, sign-in done). Ends any earlier one. */
  attempt(a: AttemptInput): Attempt;
  /** The live attempt, if any. */
  setup: AttemptView | null;
  /** A read that starts after this call, or the one running when it started after the reads were last connected (a mount, or a
   *  kept page shown again): returns the first seq such a read takes, and starts or queues one when none qualifies. Evidence (or
   *  `settledSeq`) at or above it was read after the call's moment. Optional: a caller-made catalogue may leave it out, and a
   *  judgement that needs a fresh read then makes none. */
  freshRead?(): number;
  /** The seq of the newest read this visit accepted, its answer kept or failed (a failed read with older evidence kept leaves
   *  `evidence` as it was, so only this says it settled). 0 before any. */
  settledSeq?: number;
}

/** The scope's identity, for comparisons that need a string. */
export const scopeKey = (s: Scope | null): string => (s ? `${s.account}|${s.realm}|${s.computer}|${s.gen}|${s.boot}` : '');

/** How an attempt settles against one accepted evidence. Pure. */
export function settleAttempt(ev: Evidence, a: { provider: string; spec?: string | null; intent: AttemptIntent }): AttemptResult {
  if (ev.catalogue.state === 'loading') return { kind: 'checking' };
  if (ev.catalogue.state === 'failed') return { kind: 'read_failed' };
  const snap: Snapshot = ev.catalogue.value;
  const cat = snap.cat;
  const p = cat.byId[a.provider];
  if (p && providers.providerState(cat, p).state === 'needs_key') return { kind: 'still_needs' };
  if (snap.ready !== 'ok' || !providers.readyTrusted(cat)) return { kind: 'unconfirmed' };
  const spec = a.spec ?? null;
  if (a.intent === 'choose' && spec && providers.readinessOf(ev, spec) === 'ready') {
    return { kind: 'chosen', choice: { kind: 'model', spec, readiness: 'ready', consent: false, scope: ev.scope, seq: ev.seq } };
  }
  // The whole trusted ready list, not only the models read: a ready spec the models read lacks still counts.
  const anyReady = !!p && Object.keys(cat.readySpecs ?? {}).some((s) => cat.byPrefix[providers.prefixOf(s)]?.id === p.id && providers.readinessOf(ev, s) === 'ready');
  if (!anyReady) return { kind: 'none_ready' };
  return a.intent === 'choose' && spec ? { kind: 'not_yet' } : { kind: 'ready_now' };
}

const defaultReads = (target: Target, ctx: Ctx): CatalogueReads => {
  const a = agent.agentApi(target);
  return { catalogue: providers.providersApi(target, { ctx }), acp: () => a.acp() };
};

/** The Claude Code part: a 404 is an agent without Claude Code (absent); any other failure is a failed part. */
async function readClaudePart(acp: NonNullable<CatalogueReads['acp']>): Promise<Part<agent.ClaudeSet>> {
  const r = await acp();
  if (!r.ok && r.err.status !== 404) return { state: 'failed', err: r.err };
  return { state: 'ok', value: agent.claudeSetOf(r) };
}

/** One visit of a scope: from the commit that shows it to the commit that shows another (or unmount). */
interface Visit {
  gen: number;
  /** The scope key plus the Claude offer; '' = no computer. */
  key: string;
}

interface Live {
  id: number;
  view: AttemptView;
  /** The visit that opened it: the attempt ends with it. */
  gen: number;
  vkey: string;
  ctx: Ctx;
  onSettle?: (r: AttemptResult) => void;
}

const where = (t: Target | null): string => (t ? `${t.project.id}|${t.container.id}|${t.container.server_name ?? ''}` : '');
const visitKeyOf = (key: string, claude: boolean): string => (key ? `${key}|${claude ? 'claude' : '-'}` : '');

export function useModelCatalogue(target: Target | null, o: CatalogueOptions = {}): ModelCatalogue {
  const claude = o.claude === true;
  const snap = useCore();
  const at = where(target);
  // Today's scope follows the core store (account, realm, generation) and the computer.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `at` is the target's identity; snap moves with the store
  const scope = useMemo<Scope | null>(() => (target ? providers.scopeOf(capture(target)) : null), [at, snap.account, snap.realm, snap.gen]);
  const key = scopeKey(scope);
  const vkey = visitKeyOf(key, claude);

  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [failedAt, setFailedAt] = useState<number | null>(null);
  const [reading, setReading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [settledSeq, setSettledSeq] = useState(0);
  // A press asks for the next read to start; that read's seq ends the pending state.
  const pressNext = useRef(false);
  const pressSeq = useRef(0);
  const [setupOf, setSetupOf] = useState<{ view: AttemptView; vkey: string } | null>(null);

  const opts = useRef(o);
  const mounted = useRef(false);
  const seq = useRef(0);
  const accepted = useRef(0);
  const visit = useRef<Visit>({ gen: 0, key: '' });
  // The visit key, computer and scope of the last commit, with the caller's options, the Claude offer and the read
  // they make: all set in one insertion effect (below `read`), which runs in the commit before every layout effect
  // (a child's included) and never for a render React throws away. A check made anywhere in the commit that shows
  // another scope already refuses the previous visit's attempt, and an abandoned render moves none of them (reads and
  // answers keep using the committed computer, scope, options and Claude offer).
  const committedVisit = useRef('');
  const nowTarget = useRef(target);
  const scopeRef = useRef(scope);
  const claudeRef = useRef(claude);
  /** The read in flight, and the visit that owns it. */
  const running = useRef<{ seq: number; gen: number } | null>(null);
  const again = useRef(false);
  const live = useRef<Live | null>(null);
  const shown = useRef<Evidence | null>(null);
  const attemptIds = useRef(0);
  /** The first seq a read started since the reads were last connected takes. */
  const connectedFrom = useRef(1);

  const clock = () => (opts.current.now ?? Date.now)();

  const liveAttempt = (id: number): Live | null => {
    const a = live.current;
    return a && a.id === id && mounted.current && a.gen === visit.current.gen && a.vkey === committedVisit.current && alive(a.ctx) ? a : null;
  };

  /** End the attempt `id` (or any): it stops settling, and its view goes (a chosen result's view included). */
  const endAttempt = (id?: number) => {
    if (live.current && (id === undefined || live.current.id === id)) live.current = null;
    if (mounted.current) setSetupOf((v) => (v && (id === undefined || v.view.id === id) ? null : v));
  };

  /** Settle the live attempt with an accepted answer that started at `s`. */
  const settle = (s: number, ev: Evidence) => {
    const a = live.current;
    if (!a || s < a.view.minSeq || !liveAttempt(a.id)) return;
    const prev = a.view.result;
    const r = settleAttempt(ev, { provider: a.view.provider, spec: a.view.spec, intent: a.view.intent });
    // A failed read settles only an attempt nothing has settled yet (its own read failed, nothing newer settled it).
    if (r.kind === 'read_failed' && prev.kind !== 'checking' && prev.kind !== 'read_failed') return;
    a.view = { ...a.view, result: r };
    setSetupOf({ view: a.view, vkey: a.vkey });
    // A chosen model settles once: the attempt stops settling, its view stays until the chooser moves on.
    if (r.kind === 'chosen') live.current = null;
    a.onSettle?.(r);
  };

  const read = () => {
    const t = nowTarget.current;
    const v = visit.current;
    if (!t || !v.key || !mounted.current) return;
    // One read per visit at a time: a trigger during one reads once more after it.
    if (running.current && running.current.gen === v.gen) {
      again.current = true;
      return;
    }
    const ctx = capture(t);
    const s = ++seq.current;
    const sc = providers.scopeOf(ctx);
    running.current = { seq: s, gen: v.gen };
    again.current = false;
    setReading(true);
    if (pressNext.current) {
      // A press queued behind a pressed read: that read's settle cleared the pending state, this read shows it again.
      pressNext.current = false;
      pressSeq.current = s;
      setRetrying(true);
    }
    const r = (opts.current.reads ?? defaultReads)(t, ctx);
    const offerClaude = claudeRef.current && !!r.acp;
    void Promise.all([
      providers.readCatalogue(r.catalogue, opts.current.wanted ?? []),
      offerClaude ? readClaudePart(r.acp!) : Promise.resolve(null),
    ])
      .then(
        ([cat, cl]) => ({ cat, cl }),
        () => null,
      )
      .then((got) => {
        const mine = running.current?.seq === s;
        if (mine) running.current = null;
        // Owned by the visit that started it: once that visit ended, the answer is dropped, even when the scope
        // later comes back to the same value.
        const owned = mounted.current && visit.current.gen === v.gen && s > accepted.current && alive(ctx) && providers.sameScope(sc, scopeRef.current);
        if (owned) {
          accepted.current = s;
          setSettledSeq(s);
          const cat: Part<Snapshot> = got ? got.cat : { state: 'failed', err: { kind: 'failed', code: '', status: 0, retryAfter: null, details: {} } };
          const prev = shown.current;
          if (cat.state === 'failed' && prev && prev.catalogue.state === 'ok') {
            // A failed background read keeps the evidence, with its age.
            setFailedAt(clock());
            settle(s, { ...prev, catalogue: cat, seq: s });
          } else {
            const ev: Evidence = { seq: s, scope: sc, at: clock(), catalogue: cat, claude: got ? got.cl : null };
            shown.current = ev;
            setEvidence(ev);
            setFailedAt(null);
            settle(s, ev);
          }
        }
        if (!mine) return;
        // Cleared even while the effects are disconnected (a hidden Activity): a reconnect reads again.
        setReading(false);
        if (pressSeq.current === s) {
          pressSeq.current = 0;
          setRetrying(false);
        }
        if (mounted.current && again.current && visit.current.gen === v.gen) read();
      });
  };
  const readRef = useRef(read);
  useInsertionEffect(() => {
    committedVisit.current = vkey;
    nowTarget.current = target;
    scopeRef.current = scope;
    opts.current = o;
    claudeRef.current = claude;
    readRef.current = read;
  });

  // Connected from a commit until unmount or until the effects disconnect (StrictMode's replay, a hidden Activity or
  // Suspense boundary). A disconnect ends the attempt and its view; answers that arrive meanwhile are dropped.
  useLayoutEffect(() => {
    mounted.current = true;
    connectedFrom.current = seq.current + 1;
    return () => {
      mounted.current = false;
      live.current = null;
      setSetupOf(null);
    };
  }, []);

  // A new visit starts at the commit that shows another scope (or Claude offer), synchronously: the previous
  // visit's attempt ends and its reads stop counting before any passive effect runs. Effects reconnecting on the
  // same visit keep it: StrictMode's immediate replay finds the visit's read still running and starts none; a
  // reveal after a read was dropped while disconnected reads again, once.
  useLayoutEffect(() => {
    if (visit.current.gen !== 0 && visit.current.key === vkey) {
      if (!(running.current && running.current.gen === visit.current.gen)) readRef.current();
      return;
    }
    visit.current = { gen: visit.current.gen + 1, key: vkey };
    live.current = null;
    shown.current = null;
    again.current = false;
    pressNext.current = false;
    pressSeq.current = 0;
    setRetrying(false);
    setSetupOf(null);
    setEvidence(null);
    setFailedAt(null);
    setReading(false);
    readRef.current();
  }, [vkey]);

  const retry = useCallback(() => readRef.current(), []);
  const pressRetry = useCallback(() => {
    if (!nowTarget.current || !visit.current.key || !mounted.current) return;
    pressNext.current = true;
    setRetrying(true);
    readRef.current();
  }, []);
  useReloadOnReturn(retry, o.gapMs ?? 10_000);
  const freshRead = useCallback(() => {
    const r = running.current;
    if (r && r.gen === visit.current.gen && r.seq >= connectedFrom.current) return r.seq;
    const floor = seq.current + 1;
    readRef.current();
    return floor;
  }, []);

  const attempt = useCallback((a: AttemptInput): Attempt => {
    const id = ++attemptIds.current;
    // The attempt's own read starts after the write: whichever read starts next takes at least this seq.
    const minSeq = seq.current + 1;
    const view: AttemptView = { id, provider: a.provider, spec: a.spec ?? null, intent: a.intent, minSeq, result: { kind: 'checking' } };
    const t = nowTarget.current;
    const v = visit.current;
    if (t && v.key && mounted.current && v.key === committedVisit.current) {
      live.current = { id, view, gen: v.gen, vkey: v.key, ctx: capture(t), onSettle: a.onSettle };
      setSetupOf({ view, vkey: v.key });
      readRef.current();
    }
    return { id, minSeq, alive: () => liveAttempt(id) !== null, end: () => endAttempt(id) };
  }, []);

  // Evidence and setup are shown only for the visit this render shows.
  const setup = setupOf && setupOf.vkey === vkey ? setupOf.view : null;
  return useMemo<ModelCatalogue>(
    () => ({ evidence: evidence && scope && providers.sameScope(evidence.scope, scope) ? evidence : null, scope, reading, failedAt, retry, pressRetry, retrying, attempt, setup, freshRead, settledSeq }),
    [evidence, scope, reading, failedAt, retry, pressRetry, retrying, attempt, setup, freshRead, settledSeq],
  );
}

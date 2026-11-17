// The KVM switch of a computer (Run VMs on this computer), as one flow both the "This computer" section and the
// "KVM on computers" view use.
//
// Contract, in plain words:
//   - kvmSet is the one change: PUT /computers/:id/kvm under the computer's lifecycle lock (core's lifecycleLock: keyed by
//     the computer, in every realm view), so a KVM change, a stop and a start of one computer never overlap, from any
//     page. Its proof is the computers list: the row shows the asked `kvm` (kvm-logic kvmVerdict). An unknown answer
//     (lost, any 5xx, KVM_CHANGE_TIMED_OUT) is held until that read proves it or the person stops tracking it; it is
//     never sent again on its own.
//   - The API changes KVM only on a stopped computer and never starts it. So a press on a running (or paused) computer
//     asks to stop it first: one confirmed Stop (core's computerLifecycle, sent as this page), then the person presses
//     the switch again. After a KVM change this page saw done, Start computer is offered while the computer reads
//     stopped; it is never pressed for the person. Three presses, no chain.
//   - Turning KVM off a stopped computer is confirmed once (its VMs will not start until it is on again); turning it on
//     acts at once.
//   - A held change of the computer's lock (this page's KVM, stop or start, or another page's start/stop/restart) shows
//     one band: this page's own with Check again (a read) and Stop tracking; another page's read-only.
//   - A definite refusal stays as the computer's last outcome until the next press; done KVM changes show nothing but
//     the new switch state.
import {
  commerce, computerLifecycle as sharedLifecycle, computersList, computerState, defineMutation, heldChanges, lifecycleLock, LIFECYCLE_OPS,
  useChangesVersion, useComputersAll, type HeldFrom, type HubError, type LifecycleOp,
} from '@core';
import type { OutcomeKind } from '@kit';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { Host } from './data';
import { isKvmIdentity, kvmAction, kvmFactsOf, kvmVerdict, type KvmFacts } from './kvm-logic';
import { routes } from './routes';

/** The page that sends these changes (core's held change names it, so another page links here). */
export const KVM_PAGE = 'vms';

export interface KvmVars { readonly id: string; readonly kvm: boolean }

/** The KVM change of one computer. */
export const kvmSet = defineMutation<KvmVars>(routes.kvmSet, {
  input: (v) => {
    if (!v || typeof v.id !== 'string' || !v.id || typeof v.kvm !== 'boolean') throw new Error('kvm vars');
    return { params: { id: v.id }, body: { kvm: v.kvm } };
  },
  reads: [computersList],
  ...lifecycleLock,
  identity: (v) => ({ computer: v.id, op: 'kvm', kvm: v.kvm }),
  proves: (identity, answers) => kvmVerdict(identity, (answers[0] ?? []).flatMap((a) => (Array.isArray(a) ? (a as unknown[]) : []))),
  page: KVM_PAGE,
});

/** Core's lifecycle change (stop before a KVM change, start after it), sent as this page. */
export const lifecycle = sharedLifecycle.forPage(KVM_PAGE);

const isOp = (v: unknown): v is LifecycleOp => typeof v === 'string' && (LIFECYCLE_OPS as readonly string[]).includes(v);

/** The KVM facts of a computers list row (core's plan kind gives the server kind; unknown is never shared). */
export const kvmFactsOfRow = (row: unknown): KvmFacts | null =>
  kvmFactsOf(row, computerState((row as { status?: unknown } | null)?.status), commerce.planChip(row, null, {} as never).kind);

/** The current computer's KVM facts, from the list useHost reads (the same request and cache entry): null until its row
 *  is read. */
export function useKvmFacts(host: Host): KvmFacts | null {
  const id = host.target?.container.id ?? '';
  const all = useComputersAll({ enabled: id !== '' });
  const row = id ? all.rows?.find((r) => r.id === id) : undefined;
  return useMemo(() => (row ? kvmFactsOfRow(row) : null), [row]);
}

/** A computer the flow acts on: its id, its name (for the words), and its facts from the list. */
export interface KvmTarget { readonly id: string; readonly name: string; readonly facts: KvmFacts }

/** What the confirm dialog asks: stop the computer first, or turn KVM off a stopped computer. */
export interface KvmAsk { readonly id: string; readonly name: string; readonly want: boolean; readonly kind: 'stopFirst' | 'confirmOff' }

/** The held change of a computer's lifecycle lock this page shows. */
export interface KvmHeld {
  /** 'kvm' with the asked value, or the lifecycle operation. */
  readonly what: 'kvm' | LifecycleOp;
  readonly want: boolean | null;
  /** This page sent it: Check again and Stop tracking act on it. False: read-only. */
  readonly own: boolean;
  readonly from: HeldFrom | null;
  readonly hold: string | undefined;
}

/** The last definite answer of a press on a computer (failed, not sent, stale), or a done step that changes what is
 *  offered next (a stop: "now turn KVM on"; a KVM change: Start computer). */
export interface KvmResult {
  readonly what: 'kvm' | 'stop' | 'start';
  readonly want: boolean | null;
  readonly outcome: Exclude<OutcomeKind, 'pending'>;
  readonly error?: HubError;
}

export interface KvmFlow {
  /** The open confirm dialog, or null. */
  readonly ask: KvmAsk | null;
  /** A press on the switch or a row action: acts, asks, or does nothing (nothing can be done now). */
  press(t: KvmTarget): void;
  /** The dialog's confirm: stops the computer, or turns KVM off. */
  confirm(): void;
  cancel(): void;
  /** The dialog's change is out. */
  readonly confirming: boolean;
  /** A change of this computer is being sent from here. */
  sending(id: string): boolean;
  held(id: string): KvmHeld | null;
  result(id: string): KvmResult | null;
  /** Reads the list again for the held change (never a resend). True when it proved it. */
  check(id: string): Promise<boolean>;
  /** The person's warned Stop tracking of the held change shown. */
  dismiss(id: string): Promise<boolean>;
  /** Start computer is offered: this page changed KVM, and the computer reads stopped. */
  startOffered(t: KvmTarget): boolean;
  start(t: KvmTarget): void;
}

/** True when the computer's newest row still asks for the dialog's step with the same KVM value. */
function stillAsks(a: KvmAsk, rows: readonly { readonly id?: unknown }[] | null | undefined): boolean {
  const row = rows?.find((r) => r.id === a.id);
  const facts = row ? kvmFactsOfRow(row) : null;
  if (!facts) return false;
  const now = kvmAction(facts);
  return now.kind === 'turn' && now.want === a.want && now.step === (a.kind === 'stopFirst' ? 'stopFirst' : 'set');
}

/** One flow per surface (the section, the view). `reread` reads the computers again after an answer. */
export function useKvmFlow(reread: () => void): KvmFlow {
  const version = useChangesVersion();
  const [ask, setAsk] = useState<KvmAsk | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [out, setOut] = useState<ReadonlySet<string>>(new Set());
  const [results, setResults] = useState<Readonly<Record<string, KvmResult>>>({});
  /** Computers whose KVM this page changed: Start computer is offered while they read stopped. */
  const [changed, setChanged] = useState<ReadonlySet<string>>(new Set());
  const inFlight = useRef(new Set<string>());
  // The newest list rows (the same cached read both surfaces draw from): the confirm judges the computer on them again.
  const list = useComputersAll();
  const rowsNow = useRef(list.rows);
  rowsNow.current = list.rows;

  // The newest held change of each computer's lifecycle lock (any page's), read again on every change of the registry.
  const helds = useMemo(() => {
    const m = new Map<string, KvmHeld & { at: number }>();
    for (const h of heldChanges(lifecycleLock.lock)) {
      const idn = h.identity as { computer?: unknown; op?: unknown; kvm?: unknown } | null;
      if (!idn || typeof idn.computer !== 'string') continue;
      const kvm = isKvmIdentity(idn);
      if (!kvm && !isOp(idn.op)) continue;
      const own = kvm ? kvmSet.heldBy(h) === 'self' : lifecycle.heldBy(h) === 'self';
      const was = m.get(idn.computer);
      if (!was || h.at >= was.at) {
        m.set(idn.computer, { what: kvm ? 'kvm' : (idn.op as LifecycleOp), want: kvm ? (idn.kvm as boolean) : null, own, from: h.from, hold: h.hold, at: h.at });
      }
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version is core's held-change signal
  }, [version]);

  const mark = useCallback((id: string, on: boolean) => {
    if (on) inFlight.current.add(id);
    else inFlight.current.delete(id);
    setOut((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  }, []);
  const setResult = useCallback((id: string, r: KvmResult | null) => {
    setResults(({ [id]: _, ...rest }) => (r ? { ...rest, [id]: r } : rest));
  }, []);

  /** Sends one change of a computer: the KVM change, or a lifecycle step. Pending is core's hold (shown from there). */
  const send = useCallback(async (id: string, what: KvmResult['what'], want: boolean | null): Promise<KvmResult | 'pending' | 'busy'> => {
    if (inFlight.current.has(id) || helds.has(id)) return 'busy';
    mark(id, true);
    setResult(id, null);
    const r = await (what === 'kvm' ? kvmSet.run({ id, kvm: want === true }) : lifecycle.run({ id, op: what })).finally(() => mark(id, false));
    reread();
    if (r.outcome === 'pending') return 'pending';
    const res: KvmResult = { what, want, outcome: r.outcome, ...(r.error ? { error: r.error } : {}) };
    if (r.outcome === 'done' && what === 'kvm') setChanged((s) => new Set(s).add(id));
    if (r.outcome === 'done' && what === 'start') setChanged((s) => { const n = new Set(s); n.delete(id); return n; });
    return res;
  }, [helds, mark, reread, setResult]);

  const press = useCallback((t: KvmTarget) => {
    const a = kvmAction(t.facts);
    if (a.kind !== 'turn' || a.step === 'wait') return;
    if (a.step === 'stopFirst') { setAsk({ id: t.id, name: t.name, want: a.want, kind: 'stopFirst' }); return; }
    if (!a.want) { setAsk({ id: t.id, name: t.name, want: false, kind: 'confirmOff' }); return; }
    void send(t.id, 'kvm', true).then((r) => { if (typeof r === 'object') setResult(t.id, r); });
  }, [send, setResult]);

  const confirm = useCallback(() => {
    if (!ask || confirming) return;
    const a = ask;
    // The computer may have changed while the dialog was open (another tab stopped it, KVM was changed elsewhere): send
    // only when its newest row still asks for this same step, else close and let the switch show what is true now.
    if (!stillAsks(a, rowsNow.current)) { setAsk(null); return; }
    setConfirming(true);
    void send(a.id, a.kind === 'stopFirst' ? 'stop' : 'kvm', a.kind === 'stopFirst' ? a.want : false).then((r) => {
      setConfirming(false);
      // The dialog closes on every answer: a definite one is the computer's last outcome (shown beside its switch or
      // row), a pending one is core's hold (its band).
      if (typeof r === 'object') setResult(a.id, r);
      setAsk(null);
    });
  }, [ask, confirming, send, setResult]);

  const cancel = useCallback(() => { if (!confirming) setAsk(null); }, [confirming]);

  const check = useCallback(async (id: string) => {
    const h = helds.get(id);
    if (!h || !h.own) return false;
    const ok = h.what === 'kvm' ? await kvmSet.readBack({ id, kvm: h.want === true }) : await lifecycle.readBack({ id, op: h.what });
    if (ok && h.what === 'kvm') setChanged((s) => new Set(s).add(id));
    reread();
    return ok;
  }, [helds, reread]);

  const dismiss = useCallback(async (id: string) => {
    const h = helds.get(id);
    if (!h || !h.own || !h.hold) return false;
    const ok = h.what === 'kvm' ? await kvmSet.dismiss({ id, kvm: h.want === true }, h.hold) : await lifecycle.dismiss({ id, op: h.what }, h.hold);
    reread();
    return ok;
  }, [helds, reread]);

  return {
    ask, confirming, press, confirm, cancel, check, dismiss,
    sending: (id) => out.has(id),
    held: (id) => {
      const h = helds.get(id);
      if (!h) return null;
      const { at: _at, ...rest } = h;
      return rest;
    },
    result: (id) => results[id] ?? null,
    startOffered: (t) => changed.has(t.id) && t.facts.status === 'stopped' && !helds.has(t.id) && !out.has(t.id),
    start: (t) => { void send(t.id, 'start', null).then((r) => { if (typeof r === 'object') setResult(t.id, r.outcome === 'done' ? null : r); }); },
  };
}

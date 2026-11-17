// The feature switches of one computer (AI, RAM disk, start with its server), as one flow the Overview's Features
// section uses. KVM is not here: it has its own route, lock and proof (the VMs page's flow, through its links).
//
// Contract, in plain words:
//   - featureSet is the one change: PUT /computers/:id with exactly one of ai, ramdisk, autostart. Its lock is the
//     computer and the feature, in every realm view, so two presses of one switch never overlap while two different
//     switches may. Its proof is the computers list: the row shows the asked value (features-logic featureVerdict).
//   - An unknown answer (lost, any 5xx) is held until that read proves it or the person stops tracking it. It is never
//     sent again on its own, and while it is held the switch takes no press.
//   - Turning the RAM disk off is confirmed once. The confirm judges the computer again when pressed: if its row no
//     longer shows the RAM disk on, nothing is sent.
//   - A definite refusal stays on its row until the next press of that switch. A done change shows nothing but the
//     switch's new state.
import { computersList, defineMutation, defineRoute, heldChanges, useChangesVersion, type HeldFrom, type HubError } from '@core';
import type { OutcomeKind } from '@kit';
import { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import { featureVerdict, isFeatureIdentity, isToggle, needsConfirm, type Toggle } from './features-logic';

/** The page that sends these changes (core's held change names it). */
const PAGE = 'computers';
export const FEATURE_LOCK = 'computer.feature';

/** PUT /computers/:id with one feature. The page's other changes of this endpoint (name, colour, realms, SSH key) keep
 *  their own routes in routes.ts: each sends only its own key. */
export const featureRoute = defineRoute({ method: 'PUT', path: '/computers/:id', scope: 'realm', body: ['ai', 'ramdisk', 'autostart'] });

export interface FeatureVars { readonly id: string; readonly feature: Toggle; readonly on: boolean }

export const featureSet = defineMutation<FeatureVars>(featureRoute, {
  input: (v) => {
    if (!v || typeof v.id !== 'string' || !v.id || !isToggle(v.feature) || typeof v.on !== 'boolean') throw new Error('feature vars');
    return { params: { id: v.id }, body: { [v.feature]: v.on } };
  },
  reads: [computersList],
  lock: FEATURE_LOCK,
  lockKey: (v) => ({ computer: v.id, feature: v.feature }),
  // A computer is the same computer in every realm view.
  acrossRealms: true,
  identity: (v) => ({ computer: v.id, feature: v.feature, on: v.on }),
  proves: (identity, answers) => featureVerdict(identity, (answers[0] ?? []).flatMap((a) => (Array.isArray(a) ? (a as unknown[]) : []))),
  page: PAGE,
});

/** The computer a press acts on: its id, and its name for the words. */
export interface FeatureTarget { readonly id: string; readonly name: string }

/** What the confirm dialog asks. */
export interface FeatureAsk extends FeatureTarget { readonly feature: Toggle; readonly on: boolean }

/** A held change of one switch. */
export interface FeatureHeld {
  readonly on: boolean;
  /** This page sent it: Check again and Stop tracking act on it. False: read-only. */
  readonly own: boolean;
  readonly from: HeldFrom | null;
  readonly hold: string | undefined;
}

/** The last definite refusal of a press on one switch. */
export interface FeatureResult {
  readonly on: boolean;
  readonly outcome: Exclude<OutcomeKind, 'pending' | 'done'>;
  readonly error?: HubError;
}

export interface FeatureFlow {
  /** The open confirm dialog, or null. */
  readonly ask: FeatureAsk | null;
  /** A press on a switch: sends, asks first, or does nothing (a change of it is out or held). */
  press(t: FeatureTarget, feature: Toggle, on: boolean): void;
  confirm(): void;
  cancel(): void;
  readonly confirming: boolean;
  sending(id: string, feature: Toggle): boolean;
  held(id: string, feature: Toggle): FeatureHeld | null;
  result(id: string, feature: Toggle): FeatureResult | null;
  /** Reads the list again for the held change (never a resend). True when it proved it. */
  check(id: string, feature: Toggle): Promise<boolean>;
  /** The person's warned Stop tracking of the held change shown. */
  dismiss(id: string, feature: Toggle): Promise<boolean>;
}

const keyOf = (id: string, feature: Toggle) => `${id}:${feature}`;

/** One flow per section. `reread` reads the computers again after an answer; `valueNow` is what the computer's newest
 *  row says about a feature (null: it does not say, or it is another computer's). `blocked`: the switches are off
 *  limits now (features-logic toggleBlock); an open confirm closes when it turns true, and never sends while it is. */
export function useFeatureFlow(reread: () => void, valueNow: (id: string, feature: Toggle) => boolean | null, blocked = false): FeatureFlow {
  const version = useChangesVersion();
  const [ask, setAsk] = useState<FeatureAsk | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [out, setOut] = useState<ReadonlySet<string>>(new Set());
  const [results, setResults] = useState<Readonly<Record<string, FeatureResult>>>({});
  const inFlight = useRef(new Set<string>());
  const now = useRef(valueNow);
  now.current = valueNow;
  const off = useRef(blocked);
  off.current = blocked;
  // What blocks a switch can arrive after its confirm opened (the projects list naming another owner, an expiry, a
  // session that lost the right): the question is withdrawn with the switch.
  useEffect(() => {
    if (blocked && !confirming) setAsk(null);
  }, [blocked, confirming]);

  // The newest held change of each switch (any page's), read again on every change of the registry.
  const helds = useMemo(() => {
    const m = new Map<string, FeatureHeld & { at: number }>();
    for (const h of heldChanges(FEATURE_LOCK)) {
      const idn = h.identity;
      if (!isFeatureIdentity(idn)) continue;
      const k = keyOf(idn.computer, idn.feature);
      const was = m.get(k);
      if (!was || h.at >= was.at) m.set(k, { on: idn.on, own: featureSet.heldBy(h) === 'self', from: h.from, hold: h.hold, at: h.at });
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version is core's held-change signal
  }, [version]);

  const mark = useCallback((k: string, on: boolean) => {
    if (on) inFlight.current.add(k);
    else inFlight.current.delete(k);
    setOut((s) => { const n = new Set(s); if (on) n.add(k); else n.delete(k); return n; });
  }, []);
  const setResult = useCallback((k: string, r: FeatureResult | null) => {
    setResults(({ [k]: _, ...rest }) => (r ? { ...rest, [k]: r } : rest));
  }, []);

  /** Sends one change. Pending is core's hold (shown from there); done shows on the switch. */
  const send = useCallback(async (id: string, feature: Toggle, on: boolean): Promise<void> => {
    const k = keyOf(id, feature);
    if (inFlight.current.has(k) || helds.has(k)) return;
    mark(k, true);
    setResult(k, null);
    const r = await featureSet.run({ id, feature, on }).finally(() => mark(k, false));
    reread();
    if (r.outcome === 'pending' || r.outcome === 'done') return;
    setResult(k, { on, outcome: r.outcome, ...(r.error ? { error: r.error } : {}) });
  }, [helds, mark, reread, setResult]);

  const press = useCallback((t: FeatureTarget, feature: Toggle, on: boolean) => {
    const k = keyOf(t.id, feature);
    if (off.current || inFlight.current.has(k) || helds.has(k)) return;
    if (needsConfirm(feature, on)) { setAsk({ id: t.id, name: t.name, feature, on }); return; }
    void send(t.id, feature, on);
  }, [helds, send]);

  const confirm = useCallback(() => {
    if (!ask || confirming) return;
    const a = ask;
    // The computer may have changed while the dialog stayed open: send only while its newest row still shows the value
    // the dialog opened with; otherwise close it and let the switch show the current value.
    // Blocked since it opened: nothing is sent.
    if (off.current || now.current(a.id, a.feature) !== !a.on) { setAsk(null); return; }
    setConfirming(true);
    void send(a.id, a.feature, a.on).then(() => {
      setConfirming(false);
      setAsk(null);
    });
  }, [ask, confirming, send]);

  const cancel = useCallback(() => { if (!confirming) setAsk(null); }, [confirming]);

  const check = useCallback(async (id: string, feature: Toggle) => {
    const h = helds.get(keyOf(id, feature));
    if (!h || !h.own) return false;
    const ok = await featureSet.readBack({ id, feature, on: h.on });
    reread();
    return ok;
  }, [helds, reread]);

  const dismiss = useCallback(async (id: string, feature: Toggle) => {
    const h = helds.get(keyOf(id, feature));
    if (!h || !h.own || !h.hold) return false;
    const ok = await featureSet.dismiss({ id, feature, on: h.on }, h.hold);
    reread();
    return ok;
  }, [helds, reread]);

  return {
    ask, confirming, press, confirm, cancel, check, dismiss,
    sending: (id, feature) => out.has(keyOf(id, feature)),
    held: (id, feature) => {
      const h = helds.get(keyOf(id, feature));
      if (!h) return null;
      const { at: _at, ...rest } = h;
      return rest;
    },
    result: (id, feature) => results[keyOf(id, feature)] ?? null,
  };
}

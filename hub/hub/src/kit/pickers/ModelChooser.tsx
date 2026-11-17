// ModelChooser: the model chooser composed: the views
// (ModelBrowser) over the caller's reads (useModelCatalogue), the inline setup step (ProviderSetup) and its attempt,
// and the trip to the AI page (core/handoff) with the caller's draft.
//
// Contract:
//   - The caller owns the read (`catalogue`) and the rules, so its final action judges against the evidence shown here.
//     `onChoose` gets inherit, ready, or unknown with consent; never needs setup, gone or ineligible.
//   - A needs-setup pick opens the setup step for its provider in place of the view body, the model remembered (intent
//     choose); Set up in the Directory or a drill-in opens it with intent browse. The step's sends go only while the step
//     is the open one and the context it opened in holds (its env.alive()).
//   - Each time the credential step settles (key saved, sign-in done; again after "still needs setup") the chooser opens
//     a new attempt on the catalogue, ending the one before; the step then shows the attempt's result (the
//     settlement table) and stays until the person moves. The attempt is owned by an effect, so StrictMode's replay reopens it.
//     Only `chosen` calls onChoose, and only once the rules accept it against the evidence that settled it ("can't be
//     used here" otherwise). Back (ours or the browser's), a search, another pick, a scope change or unmount ends the
//     attempt: an ended attempt has no effect.
//   - Leaving for the AI page ("Your own endpoint", "Claude Code", "Open the AI page", "Set up on the AI page") is
//     disabled while the caller saves (`leave.blocked`), an open ask's Leave included. It asks first when sections outside the draft are dirty, and
//     again when the trip cannot be stored ("Leaving loses what you typed."). It stores the trip, replaces the current
//     history entry with the origin, shows the target computer in the shell when it is another, then goes.
//   - On the AI page itself (`away`) the same buttons stay in the page: the step ends and `away` gets the destination; no
//     trip is stored and nothing asks.
//   - `restore` (a trip the page read on load) is consumed once: the trip is removed; a New Bot draft's consent is kept
//     only for an equal scope (gen and boot included) and only when the rules accept it on a read started after the
//     return (that read failing drops it); a trip that set up a
//     provider opens its drill-in and settles a browse attempt there; focus goes to the origin's control, else to the
//     view's heading.
import { alive, capture, chooseComputer, handoff, providers, useCore, type ComputerRow, type Ctx, type Handoff, type HandoffDest, type Target } from '@core';
import { type ReactNode, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../controls/Button';
import { useGo } from '../nav';
import { useStrings } from '../strings';
import { ModelBrowser, type ModelBrowserProps, type OtherWayOrAi, type SetupRequest } from './ModelBrowser';
import { ModelPickBody, type PickExtras } from './ModelPickBody';
import { howOf, midSentence, modelLabel, providerLabel, startSentence, type FallbackRow } from './modelViews';
import { usePickerFocus } from './pickerFocus.web';
import { ProviderSetup } from './ProviderSetup';
import { scopeKey, type Attempt, type AttemptResult, type ModelCatalogue } from './useModelCatalogue';
import strings from './ModelChooser.strings.en.json';
import s from './ModelChooser.module.css';

type Choice = providers.Choice;
type Api = providers.ProvidersApi;
type PickTrip = handoff.PickTrip;
type PickThinking = handoff.PickThinking;

export interface ChooserLeave {
  origin: Handoff['origin'];
  /** The caller's allowlisted draft (never secrets), or null when there is none. */
  draft: () => Handoff['draft'] | null;
  /** Set while the caller's save or create is running or pending: leaving is disabled. */
  blocked?: string | null;
  /** The names of dirty sections the draft does not carry ("Voice", "Helpers"): asked about first. */
  unsaved?: () => string[];
  /** The AI page's href for a trip (pages/ai/links.ts `links.handoff`): the kit knows no page paths. */
  to: (id: string, dest: HandoffDest, provider?: string) => string;
}

export interface ModelChooserProps {
  /** Id prefix for every control. */
  id?: string;
  label: string;
  showLabel?: boolean;
  /** From useModelCatalogue; null = no computer ("Choose a computer first"). */
  catalogue: ModelCatalogue | null;
  /** The computer the reads go to: its name for words, its row for the shell and the trip. */
  computer: { id: string; name: string; row: ComputerRow } | null;
  /** The held spec; '' = inherit (only with rules.inherit). */
  value: string;
  /** The held choice. */
  choice?: Choice | null;
  onChoose: (c: Choice) => void;
  rules: providers.JudgeRules;
  purpose: providers.Purpose;
  defaultSpec?: string;
  fallback?: readonly FallbackRow[];
  facts?: (spec: string) => string | null;
  offer?: { endpoint?: boolean; claude?: boolean };
  leave?: ChooserLeave | null;
  /** On the AI page itself: "Set up on the AI page" and the Other ways stay in the page (no trip, no draft). Used
   *  instead of `leave` when given; the step ends first. */
  away?: (dest: HandoffDest, provider?: string) => void;
  restore?: Handoff | null;
  /** The pick a trip carries (ModelPick): `draft` is what the picker holds now; `onRestore` gets the pick a trip brought
   *  back, once, only in the scope it left from and only when the rules accept it on the evidence read now. */
  pickTrip?: { draft: () => { spec: string; thinking: PickThinking } | null; onRestore: (c: Extract<Choice, { kind: 'model' }>, thinking: PickThinking) => void } | null;
  isDisabled?: boolean;
  /** The one picker (ModelPick): one searchable, filtered list in place of the views, with the account's
   *  favourites, recent picks and remembered filters. The step, the attempt and the trip are the same. */
  pick?: PickExtras | null;
  /** Test and gallery seams: the provider calls of the setup step, and navigation. */
  api?: (target: Target, ctx: Ctx) => Api;
  go?: (to: string, o?: { replace?: boolean }) => void;
}

/** The open setup step: one per press; `n` is its identity (Back, another pick or a scope change ends it). */
interface Step {
  n: number;
  provider: string;
  spec: string | null;
  intent: 'choose' | 'browse';
  /** The scope it opened in, and the context its sends are bound to. */
  key: string;
  ctx: Ctx;
  /** Credential saves settled so far; each opens its own attempt (0 = the form is still the first one). */
  round: number;
  /** The live attempt of the newest round, once its effect opened it. */
  attempt: Attempt | null;
}

type Ask = { kind: 'unsaved'; sections: string[]; dest: HandoffDest; provider?: string } | { kind: 'lose'; dest: HandoffDest; provider?: string };

const targetOf = (row: ComputerRow): Target => ({ project: { id: String(row.project_id ?? '') }, container: row.server_name !== undefined ? { id: row.id, server_name: row.server_name } : { id: row.id } });

export function ModelChooser(p: ModelChooserProps) {
  const t = useStrings(strings);
  // The one picker's panels may share a page: each gets its own default id; the old body keeps 'mc'.
  const autoId = useId();
  const base = p.id ?? (p.pick ? `mc${autoId.replace(/[^A-Za-z0-9_-]/g, '')}` : 'mc');
  const navigate = useGo();
  const go = p.go ?? navigate;
  const shell = useCore();
  const cat = p.catalogue;
  const ev = cat?.evidence ?? null;
  const scope = cat?.scope ?? null;
  const key = scopeKey(scope);
  const word = t('mc.provider');
  const catv = ev && ev.catalogue.state === 'ok' ? ev.catalogue.value.cat : null;

  const row = p.computer?.row ?? null;
  const rowKey = row ? `${row.project_id ?? ''}|${row.id}|${row.server_name ?? ''}` : '';
  // eslint-disable-next-line react-hooks/exhaustive-deps -- rowKey is the row's identity
  const target = useMemo(() => (row ? targetOf(row) : null), [rowKey]);

  const [step, setStep] = useState<Step | null>(null);
  const stepRef = useRef<Step | null>(null);
  stepRef.current = step;
  const steps = useRef(0);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [openProvider, setOpenProvider] = useState<{ pid: string; token: number } | null>(null);
  const [device, setDevice] = useState(false);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // Focus by a control's id (pickerFocus.web.ts: the document on the web, the focus scope in the terminal).
  const pf = usePickerFocus(rootRef);
  const resultFocus = useRef<'heading' | 'choose' | null>(null);

  const api = useMemo(() => (target ? (p.api ?? ((tg: Target, ctx: Ctx) => providers.providersApi(tg, { ctx })))(target, capture(target)) : null), [target, key]); // eslint-disable-line react-hooks/exhaustive-deps -- one Api per computer and scope

  // ChatGPT sign-in is offered only where the agent says it can run one; the read never holds anything back.
  useEffect(() => {
    setDevice(false);
    if (!api) return;
    let live = true;
    void api.version().then((v) => {
      if (live && v.ok) setDevice(providers.cap(providers.parseVersion(v.body), providers.CAPS.device));
    });
    return () => {
      live = false;
    };
  }, [api]);

  // The key step's send is in flight or its outcome is unknown (ProviderSetup onLock), for step n: its Back waits, and
  // the step keeps the kind of setup it had when that began, whatever the catalogue says meanwhile (C9).
  const [keyHold, setKeyHold] = useState<{ n: number; how: ReturnType<typeof howOf> } | null>(null);
  const holding = !!step && keyHold?.n === step.n;

  /** End the step and its attempt: no note, no navigation, no choice. */
  const endStep = () => {
    stepRef.current?.attempt?.end();
    stepRef.current = null;
    setStep(null);
    setDecision(null);
  };

  // A scope change ends the step and any ask; unmount ends the step.
  const lastKey = useRef(key);
  useLayoutEffect(() => {
    if (lastKey.current === key) return;
    lastKey.current = key;
    stepRef.current?.attempt?.end();
    stepRef.current = null;
    setStep(null);
    setAsk(null);
  }, [key]);
  useEffect(
    () => () => {
      stepRef.current?.attempt?.end();
      stepRef.current = null;
    },
    [],
  );

  const openStep = (req: SetupRequest) => {
    if (!target || !scope) return;
    stepRef.current?.attempt?.end();
    setAsk(null);
    const next: Step = { n: ++steps.current, provider: req.provider, spec: req.spec ?? null, intent: req.intent, key, ctx: capture(target), round: 0, attempt: null };
    stepRef.current = next;
    setStep(next);
    // The body is replaced (its opener may be gone): focus goes to the step's heading.
    resultFocus.current = 'heading';
  };

  /** The step's sends go only while it is the open step, its scope is today's and its context holds. */
  const stepAlive = (n: number) => {
    const st = stepRef.current;
    return !!st && st.n === n && st.key === lastKey.current && alive(st.ctx);
  };
  const env = useMemo(() => {
    const n = step?.n;
    return providers.browserEnv(() => n !== undefined && stepAlive(n));
  }, [step?.n]);

  /** A chosen result waits for the rules ("chosen" is a readiness answer only): null = not judged yet. */
  const [decision, setDecision] = useState<{ attempt: number; choice: Extract<Choice, { kind: 'model' }>; ok: boolean | null } | null>(null);
  const lastResult = useRef<{ attempt: number; kind: AttemptResult['kind'] } | null>(null);

  /** The credential step settled: a new round, so a new attempt (the first save, or again after "still needs setup"). */
  const connected = (n: number) => {
    const st = stepRef.current;
    if (!cat || !st || !stepAlive(n)) return;
    if (st.round > 0 && !(st.attempt && lastResult.current?.attempt === st.attempt.id && lastResult.current.kind === 'still_needs')) return;
    const next = { ...st, round: st.round + 1, attempt: null };
    stepRef.current = next;
    setStep(next);
    // The credential form leaves the page: focus goes to the step's heading, the result is announced below it.
    resultFocus.current = 'heading';
  };

  // One attempt per round, owned by this effect: ending the round, the step or the component ends it, and StrictMode's
  // replay (or a reconnecting Activity) opens it again. Passive, so the catalogue hook is connected again first.
  const catRef = useRef(cat);
  catRef.current = cat;
  const roundOf = step?.round ?? 0;
  useEffect(() => {
    const st = stepRef.current;
    const c = catRef.current;
    if (!st || !c || st.round === 0 || st.n !== step?.n || st.round !== roundOf) return;
    const n = st.n;
    const a = c.attempt({
      provider: st.provider,
      ...(st.spec ? { spec: st.spec } : {}),
      intent: st.intent,
      onSettle: (r: AttemptResult) => {
        if (stepRef.current?.n !== n || stepRef.current.attempt?.id !== a.id) return;
        lastResult.current = { attempt: a.id, kind: r.kind };
        if (r.kind === 'chosen') setDecision({ attempt: a.id, choice: r.choice, ok: null });
        resultFocus.current = r.kind === 'ready_now' ? 'choose' : null;
      },
    });
    const withA = { ...st, attempt: a };
    stepRef.current = withA;
    setStep(withA);
    return () => a.end();
  }, [step?.n, roundOf]); // one attempt per step round

  // A chosen result goes to onChoose only when the rules accept it against the evidence that settled it.
  useEffect(() => {
    if (!decision || decision.ok !== null || !ev || !scope) return;
    if (stepRef.current?.attempt?.id !== decision.attempt) return setDecision(null);
    if (ev.seq < decision.choice.seq) return;
    const ok = providers.judge(decision.choice, decision.choice.spec, ev, scope, p.rules).ok;
    setDecision({ ...decision, ok });
    if (ok) p.onChoose(decision.choice);
  }, [decision, ev, scope]); // eslint-disable-line react-hooks/exhaustive-deps -- judged once per chosen result

  const result: AttemptResult | null = step?.attempt && cat?.setup && cat.setup.id === step.attempt.id ? cat.setup.result : null;
  useLayoutEffect(() => {
    const f = resultFocus.current;
    if (!f) return;
    resultFocus.current = null;
    if (f === 'heading') pf.toEl(stepHeading.current);
    else pf.toId(`${base}-setup-choose`);
  });

  const chooseModel = (pid: string) => {
    endStep();
    setOpenProvider((o) => ({ pid, token: (o?.token ?? 0) + 1 }));
  };

  // ── leaving for the AI page ─────────────────────────────────────────────────────────────────────

  const leave = p.leave ?? null;
  const blocked = !!leave?.blocked;
  /** Go: the origin replaces this history entry (browser Back lands on it), the shell shows the target computer. */
  const depart = (dest: HandoffDest, provider: string | undefined, id: string) => {
    if (!leave) return;
    setAsk(null);
    endStep();
    go(leave.origin.href, { replace: true });
    if (row && shell.target?.container.id !== row.id) chooseComputer(row);
    go(leave.to(id, dest, provider));
  };
  const store = (dest: HandoffDest, provider: string | undefined): { ok: boolean; id: string } => {
    const id = handoff.newHandoffId();
    if (!leave || !scope || !p.computer) return { ok: false, id };
    const draft = leave.draft();
    // The model being picked: the one a setup step was opened for, else the picker's draft (never the inherit row).
    const held = p.pickTrip?.draft() ?? null;
    const st = stepRef.current;
    const spec = st?.intent === 'choose' && st.spec ? st.spec : (held?.spec ?? '');
    const pick: PickTrip | null = held && spec ? { intent: 'pick', spec, thinking: held.thinking } : null;
    const rec: Handoff = {
      v: 1,
      id,
      at: Date.now(),
      scope: { account: scope.account, realm: scope.realm, computer: scope.computer, gen: scope.gen, boot: scope.boot },
      origin: leave.origin,
      target: { computer: p.computer.id, name: p.computer.name },
      dest,
      ...(provider ? { provider } : {}),
      ...(draft ? { draft } : {}),
      ...(pick ? { pick } : {}),
    };
    return { ok: handoff.writeHandoff(rec), id };
  };
  const tryStore = (dest: HandoffDest, provider: string | undefined) => {
    const w = store(dest, provider);
    if (w.ok) depart(dest, provider, w.id);
    else setAsk({ kind: 'lose', dest, ...(provider ? { provider } : {}) });
  };
  const startLeave = (dest: HandoffDest, provider?: string) => {
    if (p.away) {
      if (blocked || p.isDisabled) return;
      endStep();
      setAsk(null);
      return p.away(dest, provider);
    }
    if (!leave || blocked || p.isDisabled) return;
    const dirty = leave.unsaved?.() ?? [];
    if (dirty.length) return setAsk({ kind: 'unsaved', sections: dirty, dest, ...(provider ? { provider } : {}) });
    tryStore(dest, provider);
  };
  const onOtherWay = (way: OtherWayOrAi) => startLeave(way === 'ai' ? 'connect' : way);

  // ── restoring a trip ────────────────────────────────────────────────────────────────────────────

  const restored = useRef<string | null>(null);
  const [pendingConsent, setPendingConsent] = useState<{ id: string; spec: string; scope: providers.Scope; floor: number | null } | null>(null);
  // `floor`: the first read seq taken after the trip was consumed (useModelCatalogue freshRead); null when the catalogue cannot say.
  const [pendingPick, setPendingPick] = useState<{ spec: string; thinking: PickThinking; scope: providers.Scope; floor: number | null } | null>(null);
  const restore = p.restore ?? null;
  // The scope a trip waited in: a trip that arrives while the open step's key save is held waits for it (C9), then
  // opens in the held step's own scope only (its key, not this render's: a scope change in the same commit has not ended
  // the step yet). A scope change meanwhile ends the step, and the trip stays unconsumed and its handoff kept.
  const waitedIn = useRef<{ id: string; key: string } | null>(null);
  useEffect(() => {
    if (!restore || restored.current === restore.id) return;
    if (holding && step) {
      if (waitedIn.current?.id !== restore.id) waitedIn.current = { id: restore.id, key: step.key };
      return;
    }
    if (!cat || !scope) return;
    if (waitedIn.current?.id === restore.id && waitedIn.current.key !== key) return;
    restored.current = restore.id;
    handoff.removeHandoff(restore.target.computer);
    const d = restore.draft;
    if (d && d.kind === 'newBot' && d.model.consent && d.model.spec && providers.sameScope(restore.scope, scope)) setPendingConsent({ id: restore.id, spec: d.model.spec, scope, floor: cat.freshRead ? cat.freshRead() : null });
    if (restore.pick && p.pickTrip && providers.sameScope(restore.scope, scope)) setPendingPick({ spec: restore.pick.spec, thinking: restore.pick.thinking, scope, floor: cat.freshRead ? cat.freshRead() : null });
    const pid = restore.result?.provider;
    if (pid) {
      setOpenProvider((o) => ({ pid, token: (o?.token ?? 0) + 1 }));
      // A set-up provider: a browse attempt, opened by the round effect (round 1, its credential already saved).
      const next: Step = { n: ++steps.current, provider: pid, spec: null, intent: 'browse', key, ctx: capture(target ?? undefined), round: 1, attempt: null };
      stepRef.current = next;
      setStep(next);
    }
    // The origin's control, or its nearest survivor: the view's heading.
    const focus = restore.origin.focus;
    pf.later(() => {
      if (!pf.toId(focus)) pf.toId(`${base}-h`);
    });
  }, [restore?.id, key, holding]); // eslint-disable-line react-hooks/exhaustive-deps -- consumed once per trip, once its scope is known

  // A kept consent (a New Bot draft) is handed over once, on a read of that same scope started after the trip came back, and
  // only when the rules accept it on that read: the same floor as a trip's pick below. Evidence kept from before the trip never
  // judges it; that read failing drops it.
  const consentSettled = cat?.settledSeq ?? 0;
  useEffect(() => {
    if (!pendingConsent || !ev || !scope) return;
    if (!providers.sameScope(pendingConsent.scope, scope) || !providers.sameScope(ev.scope, scope)) return setPendingConsent(null);
    const floor = pendingConsent.floor;
    if (floor === null) return setPendingConsent(null);
    if (consentSettled < floor) return;
    if (ev.seq < floor) return setPendingConsent(null);
    if (ev.catalogue.state === 'loading') return;
    const spec = pendingConsent.spec;
    const ready = ev.catalogue.state === 'ok' && providers.readinessOf(ev, spec) === 'ready';
    const c: Choice = { kind: 'model', spec, readiness: ready ? 'ready' : 'unknown', consent: true, scope: ev.scope, seq: ev.seq };
    setPendingConsent(null);
    if (providers.judge(c, spec, ev, scope, p.rules).ok) p.onChoose(c);
  }, [pendingConsent, ev, scope, consentSettled]); // eslint-disable-line react-hooks/exhaustive-deps -- hands over once

  // A pick a trip brought back is judged once, on a read of that same scope started after the trip came back: evidence kept
  // from before the trip (a kept page, a refresh still running or failed) never judges it. Handed back only when the rules
  // accept it on that read, never with consent it was not given. That read failing drops the pick (no later read revives it);
  // a catalogue that cannot say which read is fresh never hands one back.
  const settledSeq = cat?.settledSeq ?? 0;
  useEffect(() => {
    if (!pendingPick || !ev || !scope) return;
    if (!providers.sameScope(pendingPick.scope, scope) || !providers.sameScope(ev.scope, scope)) return setPendingPick(null);
    const floor = pendingPick.floor;
    if (floor === null) return setPendingPick(null);
    if (settledSeq < floor) return;
    if (ev.seq < floor) return setPendingPick(null);
    if (ev.catalogue.state === 'loading') return;
    const { spec, thinking } = pendingPick;
    const c: Extract<Choice, { kind: 'model' }> = { kind: 'model', spec, readiness: providers.readinessOf(ev, spec) === 'ready' ? 'ready' : 'unknown', consent: false, scope: ev.scope, seq: ev.seq };
    setPendingPick(null);
    if (providers.judge(c, spec, ev, scope, p.rules).ok) p.pickTrip?.onRestore(c, thinking);
  }, [pendingPick, ev, scope, settledSeq]); // eslint-disable-line react-hooks/exhaustive-deps -- hands over once

  // ── the step ────────────────────────────────────────────────────────────────────────────────────

  const pLabel = (pid: string) => (catv ? providerLabel(catv, pid, word) : word);
  const mLabel = (spec: string) => modelLabel(catv, spec, t('mc.anyModel'));

  let setupNode: ReactNode = null;
  if (ask) {
    const text = ask.kind === 'unsaved' ? t('leave.unsaved', { sections: ask.sections.join(', ') }) : t('leave.lose');
    setupNode = (
      <div className={s.consent} role="group" aria-labelledby={`${base}-ask-t`}>
        <p className={s.consentText} id={`${base}-ask-t`}>
          {text}
        </p>
        <AskButtons
          t={t}
          locked={blocked || !!p.isDisabled}
          onStay={() => setAsk(null)}
          onGo={() => {
            // The caller may have started saving since the ask opened: Leave is then off, and goes nowhere.
            if (blocked || p.isDisabled) return;
            if (ask.kind === 'unsaved') tryStore(ask.dest, ask.provider);
            // Nothing stored: the AI page finds no trip under this id and opens plainly.
            else depart(ask.dest, ask.provider, handoff.newHandoffId());
          }}
        />
      </div>
    );
  } else if (step && target && api) {
    const pid = step.provider;
    const name = pLabel(pid);
    const held = keyHold?.n === step.n ? keyHold : null;
    const how = held ? held.how : catv ? howOf(catv, pid) : 'ai';
    const n = step.n;
    const title = step.spec ? t('setup.for', { provider: name, model: midSentence(t, mLabel(step.spec)) }) : t('setup.title', { provider: name });
    const showForm = step.round === 0 || result?.kind === 'still_needs';
    // A chosen result shows "chosen" only once the rules accepted it; until then it is still being checked.
    const judged = result?.kind === 'chosen' && decision?.attempt === step.attempt?.id ? decision : null;
    const shown: AttemptResult | null = result?.kind === 'chosen' && judged?.ok !== true ? (judged?.ok === false ? { kind: 'not_yet' } : { kind: 'checking' }) : result;
    setupNode = (
      <section className={s.step} aria-labelledby={`${base}-setup-h`}>
        <Button variant="ghost" size="sm" icon="arrow-left" className={s.back} id={`${base}-setup-back`} isDisabled={!!held} onPress={endStep}>
          {t('setup.back')}
        </Button>
        <h4 id={`${base}-setup-h`} ref={stepHeading} tabIndex={-1} className={s.title}>
          {title}
        </h4>
        {step.round > 0 && (
          <StepResult t={t} base={base} result={shown} notUsable={judged?.ok === false} provider={name} model={step.spec ? mLabel(step.spec) : ''} onCheck={() => cat?.retry()} onChoose={() => chooseModel(pid)} />
        )}
        {showForm &&
          (how === 'ai' ? (
            <>
              <p className={s.note}>{t('setup.onAi', { provider: name })}</p>
              <span>
                <Button variant="secondary" isDisabled={blocked || !!p.isDisabled || (!leave && !p.away)} onPress={() => startLeave('connect', pid)}>
                  {t('setup.onAiGo')}
                </Button>
              </span>
            </>
          ) : (
            <ProviderSetup
              key={`${step.n}:${step.round}`}
              api={api}
              env={env}
              providerId={pid}
              providerLabel={name}
              computer={p.computer?.name}
              at={{ project: target.project.id, computer: target.container.id }}
              device={device}
              signin={how === 'openrouter'}
              endpoint={how === 'endpoint'}
              onConnected={() => connected(step.n)}
              onBack={endStep}
              onLock={(l) => setKeyHold((h) => (l ? (h?.n === n ? h : { n, how }) : h?.n === n ? null : h))}
            />
          ))}
      </section>
    );
  }

  // What both bodies take (ModelBrowser's contract; ModelPickBody keeps it).
  const body: ModelBrowserProps = {
    id: base,
    evidence: ev,
    noComputer: !cat || !scope,
    computerName: p.computer?.name,
    value: p.value,
    rules: p.rules,
    purpose: p.purpose,
    defaultSpec: p.defaultSpec ?? null,
    offer: p.offer,
    fallback: p.fallback,
    locked: blocked || p.isDisabled || holding,
    onChoose: (c) => {
      endStep();
      setAsk(null);
      p.onChoose(c);
    },
    onSetup: (req) => {
      if (!holding) openStep(req);
    },
    onSetupView: () => {
      if (holding) return;
      endStep();
      setAsk(null);
    },
    onOtherWay,
    onRetry: () => cat?.pressRetry(),
    retrying: cat?.retrying ?? false,
    backgroundFailed: cat?.failedAt != null,
    facts: p.facts,
    setup: setupNode,
    openProvider,
  };

  return (
    <div ref={rootRef} className={s.chooser} role="group" aria-label={p.label} data-chooser="">
      {p.showLabel && <span className={s.sectionTitle}>{p.label}</span>}
      {p.pick ? <ModelPickBody {...body} pick={p.pick} /> : <ModelBrowser {...body} />}
    </div>
  );
}

function StepResult({
  t,
  base,
  result,
  notUsable,
  provider,
  model,
  onCheck,
  onChoose,
}: {
  t: ReturnType<typeof useStrings<typeof strings>>;
  base: string;
  result: AttemptResult | null;
  /** Ready, but the rules refuse it here (an Explain caller and no output cap): Choose a model, nothing chosen. */
  notUsable: boolean;
  provider: string;
  model: string;
  onCheck: () => void;
  onChoose: () => void;
}) {
  const k = result?.kind ?? 'checking';
  const text =
    k === 'checking'
      ? t('setup.checking', { provider })
      : k === 'read_failed' || k === 'unconfirmed'
        ? t('setup.unconfirmed')
        : k === 'still_needs'
          ? t('setup.stillNeeds', { provider })
          : k === 'chosen'
            ? t('setup.chosen', { model: startSentence(t, model) })
            : k === 'not_yet'
              ? notUsable
                ? t('setup.notUsable', { model: startSentence(t, model) })
                : t('setup.notYet', { provider, model: midSentence(t, model) })
              : k === 'ready_now'
                ? t('setup.readyNow', { provider })
                : t('setup.noneReady', { provider });
  const check = k === 'read_failed' || k === 'unconfirmed' || (k === 'not_yet' && !notUsable) || k === 'none_ready';
  const choose = k === 'unconfirmed' || k === 'not_yet' || k === 'ready_now';
  return (
    <>
      <p className={s.note} role="status" /* reason: the attempt's result, announced once it settles */>
        {text}
      </p>
      {(check || choose) && (
        <ul className={s.actions}>
          {choose && (
            <li>
              <Button variant={k === 'ready_now' ? 'primary' : 'secondary'} size="sm" id={`${base}-setup-choose`} onPress={onChoose}>
                {t('setup.chooseModel')}
              </Button>
            </li>
          )}
          {check && (
            <li>
              <Button variant="secondary" size="sm" onPress={onCheck}>
                {t('setup.checkAgain')}
              </Button>
            </li>
          )}
        </ul>
      )}
    </>
  );
}

function AskButtons({ t, locked, onStay, onGo }: { t: ReturnType<typeof useStrings<typeof strings>>; locked: boolean; onStay: () => void; onGo: () => void }) {
  const ref = useRef<HTMLSpanElement>(null);
  const pf = usePickerFocus();
  // Focus moves to Stay, the choice that loses nothing.
  useLayoutEffect(() => {
    pf.toFirst(ref.current, 'button');
  }, [pf]);
  return (
    <>
      <span ref={ref}>
        <Button variant="secondary" size="sm" onPress={onStay}>
          {t('leave.stay')}
        </Button>
      </span>
      <Button variant="ghost" size="sm" isDisabled={locked} onPress={onGo}>
        {t('leave.go')}
      </Button>
    </>
  );
}

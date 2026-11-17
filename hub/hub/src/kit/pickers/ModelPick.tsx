// ModelPick: the one model picker everywhere. Three exports over
// one body: ModelPickPanel (the chooser with one list, the thinking step and its footer), ModelPickField (a settings row
// that always names its model, with Change) and ModelPickChip (a composer strip chip). The data layer is ModelChooser's:
// the caller's read (useModelCatalogue), the rules its own save judges with, the setup step, its attempt and the trip.
//
// Contract:
//   - Controlled: the caller holds `value` (what is saved or live now) and the `draft`; a pick or a
//     thinking change calls onDraft. `mode: 'live'` commits each pick at once (the chat: "from the next message");
//     `mode: 'saved'` commits on the footer's Use this model, or the caller's own Save when `footer={false}` (two
//     fields, one PATCH: Bot routing).
//   - onCommit answers an outcome: done, pending (the save's answer is not in: everything waits, nothing is said to be
//     saved; it ends when the caller's `value` becomes the draft it sent, before or after the answer, i.e. its save
//     landed, or when the caller remounts the panel, its one way to say a save it cannot confirm is over; in a Drawer, busy refuses closing) or refused (its
//     words show under the panel, as an alert). An answer that arrives after a newer commit, a scope change (another
//     computer, account or realm) or the panel's unmount is dropped: it adds no Recent and closes nothing. A commit sends the Choice the person picked, so
//     the caller's save judges the same evidence (null: only the thinking level changed).
//   - Thinking: '' is the caller's default, distinct from off/on. The step shows for a model that takes
//     a level, or while a level is held (it must stay removable). Its levels are the caller's vocabulary narrowed to
//     the model's own (modelPickLogic.thinkingLevels); a held level the model does not take shows last, marked. A
//     model change keeps the drafted level until the commit, which resets it (thinkingAfterPick) when the model changed,
//     unless the person chose the level for the new model after picking it: that choice is committed.
//   - A committed pick of a model joins the account's Recent (useModelPrefs.picked).
//   - A trip to the AI page to set a provider up carries the draft (the model a setup step was opened for, and the
//     level); back in the same scope, that pick returns as a pick made here, once, if the rules accept it on the evidence
//     read then (ModelChooser `pickTrip`). Live mode commits it at once; saved mode waits for Use this model.
//   - Voice (speech-to-text, text-to-speech) is not a ModelPick: its catalogue is another read.
import { providers } from '@core';
import { type ReactNode, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../controls/Button';
import { SegmentedControl } from '../controls/SegmentedControl';
import { Tag } from '../data/Display';
import { Drawer, useDrawer } from '../overlays/Drawer';
import { Popover } from '../overlays/Popover';
import { useStrings } from '../strings';
import { ModelChooser, type ModelChooserProps } from './ModelChooser';
import { windowText } from './ModelPickBody';
import { pickRows, thinkingAfterPick, thinkingLevels, thinkingShown, type PickRow, type ThinkingLevel } from './modelPickLogic';
import { isClaudeSpec, modelLabel } from './modelViews';
import { scopeKey } from './useModelCatalogue';
import { useModelPrefs } from './useModelPrefs';
import strings from './ModelPick.strings.en.json';
import mcStrings from './ModelChooser.strings.en.json';
import s from './ModelPick.module.css';

type Choice = providers.Choice;
type Evidence = providers.Evidence;

export interface PickDraft {
  /** A spec, or '' (the inherit row: rules.inherit only). */
  spec: string;
  thinking: ThinkingLevel;
}

export type PickOutcome = { kind: 'done' } | { kind: 'pending'; text?: string } | { kind: 'refused'; text: string };

export interface ThinkingStep {
  /** The caller's vocabulary ('' first: the default; live effort: '', low..max; Bot routing: '', off, on, low..max). */
  levels: readonly ThinkingLevel[];
  /** What '' means here ("Agent's default", "Model's default"). */
  inheritLabel: string;
  /** The off/on switches the caller knows the model takes; absent or null offers none. */
  switches?: readonly ('off' | 'on')[] | null;
}

export interface ModelPickPanelProps extends Omit<ModelChooserProps, 'value' | 'choice' | 'onChoose' | 'pick' | 'pickTrip'> {
  /** What is saved or live now. */
  value: PickDraft;
  /** The pick being made (saved mode); equal to value in live mode. */
  draft: PickDraft;
  /** `ready` is what a commit of this draft sends (the level reset when the model changed, unless the level was chosen
   *  for the new model): a host whose own Save commits (`footer={false}`) sends `ready`, never `d`. */
  onDraft: (d: PickDraft, choice: Choice | null, ready: PickDraft) => void;
  mode: 'live' | 'saved';
  onCommit: (d: PickDraft, choice: Choice | null) => PickOutcome | Promise<PickOutcome>;
  /** The thinking step (absent: the caller has none, e.g. the AI helper model). */
  thinking?: ThinkingStep | null;
  /** The inherit row's words (rules.inherit): label (3 words at most), detail, the model it resolves to now. */
  /** The inherit row: `resolved` is what it resolves to now (shown beside the label); null = the caller cannot tell
   *  (no stale name; the field's tag reads Can't tell); absent = the caller does not resolve it (no tag). */
  inherit?: { label: string; detail?: string; resolved?: string | null } | null;
  /** The models in use where this picker opened (Recent shows them first). */
  inUse?: readonly string[];
  /** Saved mode: the panel's own Use this model / Cancel footer (default), or none (the host's Save commits). */
  footer?: boolean;
  onCancel?: () => void;
  /** A commit answered done (the host closes its drawer or popover). */
  onDone?: () => void;
}

const sameDraft = (a: PickDraft, b: PickDraft) => a.spec === b.spec && a.thinking === b.thinking;
const draftKey = (d: PickDraft) => `${d.spec}\u0000${d.thinking}`;

/** The picker row of one spec (its window, price, thinking and levels), from the evidence; null when unread. */
function rowOf(ev: Evidence | null, spec: string): PickRow | null {
  if (!ev || !spec) return null;
  const cat = ev.catalogue.state === 'ok' ? ev.catalogue.value.cat : null;
  const claude = isClaudeSpec(spec);
  const efforts = ev.claude?.state === 'ok' ? ev.claude.value.efforts : undefined;
  const ready = providers.readinessOf(ev, spec);
  const base = { spec, label: modelLabel(cat, spec, ''), providerId: '', providerLabel: '', ready: ready === 'gone' ? ('unknown' as const) : ready, source: claude ? ('claude_code' as const) : spec.startsWith('fusion/') ? ('fusion' as const) : ('provider' as const) };
  return pickRows([base], cat, { claudeEfforts: efforts })[0] ?? null;
}

export function ModelPickPanel(p: ModelPickPanelProps) {
  const t = useStrings(strings);
  const { prefs, onPrefs, picked } = useModelPrefs();
  const [choice, setChoice] = useState<Choice | null>(null);
  const [state, setState] = useState<{ kind: 'idle' } | { kind: 'busy' } | PickOutcome>({ kind: 'idle' });
  const seq = useRef(0);
  const alive = useRef(true);
  // The spec the drafted level was chosen for (null: the level is the one carried over from an earlier model).
  const levelFor = useRef<string | null>(null);
  const stepId = useId();
  const ev = p.catalogue?.evidence ?? null;
  const scope = scopeKey(p.catalogue?.scope ?? null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  // The committed scope and value, read by an answer when it arrives (layout effects: set before any later task runs).
  const scopeNow = useRef(scope);
  const valueNow = useRef(draftKey(p.value));
  // What the pending save sent: it ends when the caller's value becomes that draft (its save landed), never on another move.
  const pendingFor = useRef<string | null>(null);
  // Another computer, account or realm: an answer still on its way belongs to the old one.
  useLayoutEffect(() => {
    scopeNow.current = scope;
    pendingFor.current = null;
    seq.current++;
    setState({ kind: 'idle' });
  }, [scope]);
  // A pending save ends when the caller's value becomes what it sent, whether that happens before or after the answer
  // (an unrelated change, or a change and back, is no answer).
  useLayoutEffect(() => {
    valueNow.current = draftKey(p.value);
    if (pendingFor.current === valueNow.current) {
      pendingFor.current = null;
      setState((st) => (st.kind === 'pending' ? { kind: 'idle' } : st));
    }
  }, [p.value.spec, p.value.thinking]); // eslint-disable-line react-hooks/exhaustive-deps -- the value's two fields are its identity
  // Inside a Drawer: a commit in flight refuses every close (×, Esc, scrim, Back), as a FormFooter's does.
  const drawer = useDrawer();
  const reportKey = useId();
  const report = drawer?.reportOutcome;
  useEffect(() => {
    report?.(reportKey, { busy: state.kind === 'busy', pending: state.kind === 'pending' });
  }, [report, reportKey, state.kind]);
  useEffect(() => () => report?.(reportKey, null), [report, reportKey]);
  const row = useMemo(() => rowOf(ev, p.draft.spec), [ev, p.draft.spec]);
  const busy = state.kind === 'busy' || state.kind === 'pending';

  // The level resets when the committed model changed (the old one may be a level the new model refuses), unless the
  // person chose it for the new model.
  const readyOf = (d: PickDraft): PickDraft => ({ spec: d.spec, thinking: levelFor.current === d.spec ? d.thinking : thinkingAfterPick(p.value.spec, d.spec, d.thinking) });
  const commit = async (d: PickDraft, c: Choice | null) => {
    const mine = ++seq.current;
    const atScope = scope;
    const atValue = draftKey(p.value);
    const sent = readyOf(d);
    pendingFor.current = null;
    setState({ kind: 'busy' });
    let out: PickOutcome;
    try {
      out = await p.onCommit(sent, c);
    } catch {
      // A throw is the caller's bug or a lost answer: never "saved". Pending keeps everything waiting.
      out = { kind: 'pending' };
    }
    if (mine !== seq.current || !alive.current || scopeNow.current !== atScope) return;
    pendingFor.current = null;
    if (out.kind === 'pending') {
      // The value became what was sent while the answer was on its way: the save landed, nothing waits. A value that was
      // already the sent draft proves nothing (a live re-pick of the current model).
      if (valueNow.current === draftKey(sent) && atValue !== draftKey(sent)) {
        setState({ kind: 'idle' });
        return;
      }
      pendingFor.current = draftKey(sent);
    }
    setState(out);
    if (out.kind === 'done') {
      if (sent.spec && sent.spec !== p.value.spec) picked(sent.spec);
      p.onDone?.();
    }
  };

  const onChoose = (c: Choice) => {
    const spec = c.kind === 'inherit' ? '' : c.spec;
    if (spec !== p.draft.spec) levelFor.current = null;
    setChoice(c);
    const d = { spec, thinking: p.draft.thinking };
    p.onDraft(d, c, readyOf(d));
    if (state.kind === 'refused') setState({ kind: 'idle' });
    if (p.mode === 'live') void commit(d, c);
  };

  // A setup trip carries the draft, and a trip back hands its pick over as if picked here, with the level chosen for it.
  const pickTrip = {
    draft: () => p.draft,
    onRestore: (c: Choice, thinking: ThinkingLevel) => {
      if (c.kind !== 'model') return;
      levelFor.current = c.spec;
      setChoice(c);
      const d = { spec: c.spec, thinking };
      p.onDraft(d, c, readyOf(d));
      if (state.kind === 'refused') setState({ kind: 'idle' });
      if (p.mode === 'live') void commit(d, c);
    },
  };

  const levels = p.thinking && thinkingShown(row, p.draft.thinking) ? thinkingLevels(row, p.thinking.levels, p.draft.thinking, p.thinking.switches ?? null) : null;
  const allowed = p.thinking && row ? thinkingLevels(row, p.thinking.levels, '', p.thinking.switches ?? null) : null;
  const levelWord = (l: ThinkingLevel) => (l === '' ? (p.thinking?.inheritLabel ?? '') : allowed && !allowed.includes(l) ? t('th.unsupported', { level: t(`th.${l}`) }) : t(`th.${l}`));
  const thinkingStep = levels && (
    <SegmentedControl
      label={t('th.label')}
      showLabel
      items={levels.map((l) => ({ id: l === '' ? 'default' : l, label: levelWord(l) }))}
      value={p.draft.thinking === '' ? 'default' : p.draft.thinking}
      isDisabled={busy || !!p.isDisabled}
      onChange={(id) => {
        const d = { spec: p.draft.spec, thinking: (id === 'default' ? '' : id) as ThinkingLevel };
        levelFor.current = p.draft.spec;
        p.onDraft(d, null, readyOf(d));
        if (p.mode === 'live') void commit(d, null);
      }}
    />
  );

  const changed = !sameDraft(p.draft, p.value);
  const footer = p.mode === 'saved' && p.footer !== false && (
    <div className={s.footer}>
      {p.onCancel && (
        <Button variant="ghost" size="sm" isDisabled={state.kind === 'busy'} onPress={p.onCancel}>
          {t('foot.cancel')}
        </Button>
      )}
      <Button variant="primary" size="sm" isDisabled={!changed || busy || !!p.isDisabled} busy={state.kind === 'busy'} onPress={() => void commit(p.draft, p.draft.spec === p.value.spec ? null : choice)}>
        {t('foot.use')}
      </Button>
    </div>
  );

  return (
    <div className={s.panel} data-model-pick="">
      <ModelChooser
        {...p}
        value={p.draft.spec}
        choice={choice}
        isDisabled={p.isDisabled || busy}
        onChoose={onChoose}
        pick={{ prefs, onPrefs: (fn) => void onPrefs(fn), inUse: p.inUse, inherit: p.inherit }}
        pickTrip={pickTrip}
      />
      {thinkingStep && (
        <div className={s.step} id={stepId}>
          {thinkingStep}
        </div>
      )}
      {state.kind === 'pending' && (
        <p className={s.note} role="status">
          {state.text ?? t('out.pending')}
        </p>
      )}
      {state.kind === 'refused' && (
        <p className={s.error} role="alert">
          {state.text}
        </p>
      )}
      {footer}
    </div>
  );
}

// ── the field ───────────────────────────────────────────────────────────────────────────

export interface ModelPickFieldProps extends Omit<ModelPickPanelProps, 'draft' | 'onDraft' | 'mode' | 'footer' | 'onDone' | 'onCancel'> {
  /** Remembered width key of the Change drawer (Drawer.resizeKey: unique in the Hub). */
  resizeKey: string;
  /** Replaces the why line (the Bot's "Set here · applies from its next conversation"). */
  whyOverride?: ReactNode;
  /** Change is disabled, and this says why (also the field's description). */
  disabledReason?: string;
  /** The caller's error for this field (a required field left empty, a refused save). */
  error?: string;
}

/** A settings row: the model's name (never blank), its facts, readiness and thinking, with Change (a Drawer `sm`). */
export function ModelPickField(p: ModelPickFieldProps) {
  const t = useStrings(strings);
  const mt = useStrings(mcStrings);
  const id = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<PickDraft>(p.value);
  const ev = p.catalogue?.evidence ?? null;
  const cat = ev && ev.catalogue.state === 'ok' ? ev.catalogue.value.cat : null;
  const row = useMemo(() => rowOf(ev, p.value.spec), [ev, p.value.spec]);
  const inherit = p.value.spec === '';
  // The name always shows: the inherit row's label (and what it resolves to now), else the catalogue's name, else the
  // spec's own words (no computer yet, or the read still running).
  const name = inherit ? [p.inherit?.label ?? mt('mc.inherit'), p.inherit?.resolved].filter(Boolean).join(' · ') : modelLabel(cat, p.value.spec, mt('mc.anyModel'));
  const facts: string[] = [];
  if (row?.window != null) facts.push(windowText(row.window));
  if (p.thinking && (p.value.thinking !== '' || row?.reasoning === true)) facts.push(t('th.field', { level: p.value.thinking === '' ? p.thinking.inheritLabel : t(`th.${p.value.thinking}`) }));
  const ready = !p.catalogue || !p.computer ? 'none' : !ev || ev.catalogue.state === 'loading' ? 'checking' : inherit ? (p.inherit?.resolved === null ? 'unknown' : null) : providers.readinessOf(ev, p.value.spec);
  const tag =
    ready === 'none' ? (
      <Tag>{t('fld.noComputer')}</Tag>
    ) : ready === 'checking' ? (
      <Tag>{t('fld.checking')}</Tag>
    ) : ready === 'ready' ? (
      <Tag tone="ok">{t('mp.ready')}</Tag>
    ) : ready === 'needs_key' ? (
      <Tag tone="warn">{t('mp.setup')}</Tag>
    ) : ready === 'unknown' || ready === 'gone' ? (
      <Tag>{t('mp.cantTell')}</Tag>
    ) : null;
  const descId = `${id}-d`;
  const errId = `${id}-e`;
  const openDrawer = () => {
    setDraft(p.value);
    setOpen(true);
  };
  return (
    <div className={s.field} role="group" aria-labelledby={`${id}-l`} aria-describedby={[p.disabledReason || p.whyOverride ? descId : '', p.error ? errId : ''].filter(Boolean).join(' ') || undefined}>
      <span id={`${id}-l`} className={s.fieldLabel}>
        {p.label}
      </span>
      <span className={s.fieldValue}>
        <span className={s.fieldName}>{name}</span>
        {facts.length > 0 && <span className={s.fieldFacts}>{facts.join(' · ')}</span>}
        {tag}
        <Button variant="secondary" size="sm" isDisabled={!!p.disabledReason || !!p.isDisabled} aria-label={t('fld.changeOf', { label: p.label })} onPress={openDrawer}>
          {t('fld.change')}
        </Button>
      </span>
      {(p.disabledReason || p.whyOverride) && (
        <span id={descId} className={s.fieldWhy}>
          {p.disabledReason ?? p.whyOverride}
        </span>
      )}
      {p.error && (
        <span id={errId} className={s.error} role="alert">
          {p.error}
        </span>
      )}
      <Drawer isOpen={open} onOpenChange={setOpen} title={p.label} size="sm" overlayId="model-pick-change" resizeKey={p.resizeKey} dirty={!sameDraft(draft, p.value)}>
        <ModelPickPanel {...p} draft={draft} onDraft={(d) => setDraft(d)} mode="saved" onCancel={() => setOpen(false)} onDone={() => setOpen(false)} />
      </Drawer>
    </div>
  );
}

// ── the chip ────────────────────────────────────────────────────────────────────────────

export interface ModelPickChipProps extends Omit<ModelPickPanelProps, 'draft' | 'onDraft' | 'mode' | 'footer' | 'onDone' | 'onCancel'> {
  /** The chip's short words when the value is the inherit row. */
  inheritShort?: string;
}

/** A composer strip chip: the model's name; it opens the panel in live mode (a popover, a sheet on a phone). */
export function ModelPickChip(p: ModelPickChipProps) {
  const t = useStrings(strings);
  const mt = useStrings(mcStrings);
  const [open, setOpen] = useState(false);
  const ev = p.catalogue?.evidence ?? null;
  const cat = ev && ev.catalogue.state === 'ok' ? ev.catalogue.value.cat : null;
  const name = p.value.spec === '' ? (p.inheritShort ?? p.inherit?.label ?? mt('mc.inherit')) : modelLabel(cat, p.value.spec, mt('mc.anyModel'));
  return (
    <Popover
      label={p.label}
      width="picker"
      phone="sheet"
      isOpen={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="secondary" chip={false} size="sm" literal isDisabled={p.isDisabled} aria-label={t('chip.name', { label: p.label, model: name })}>
          {name}
        </Button>
      }
    >
      <ModelPickPanel {...p} draft={p.value} onDraft={() => undefined} mode="live" onDone={() => setOpen(false)} />
    </Popover>
  );
}

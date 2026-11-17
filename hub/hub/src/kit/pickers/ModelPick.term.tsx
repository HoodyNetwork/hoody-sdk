// ModelPick in the terminal (the web's ModelPick.tsx): ModelPickPanel, ModelPickField and ModelPickChip over the
// shared ModelChooser. The contract is the web file's: controlled value and draft, live or saved mode, the commit's
// outcome (done, pending until the caller's value becomes what was sent, refused with its words), the thinking step
// and the pick a setup trip brings back. The commit rules below are ModelPick.tsx's, line for line: a change there is
// made here too.
//   Model  GPT-5  400K · Thinking: High  [Ready]  Change
// - The field is one wrapping row: label, name, facts, readiness, Change; its reason or error on the line under it.
// - The chip is a button with the model's name; it opens the panel in a popover.
import { providers } from '@core';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../controls/Button';
import { SegmentedControl } from '../controls/SegmentedControl';
import { Tag } from '../data/Display';
import { Drawer, useDrawer } from '../overlays/Drawer';
import { Popover } from '../overlays/Popover';
import { useStrings } from '../strings';
import type * as Web from './ModelPick';
import { Box, Text } from '../../term/prim';
import { ModelChooser } from './ModelChooser';
import { windowText } from './ModelPickBody';
import { pickRows, thinkingAfterPick, thinkingLevels, thinkingShown, type PickRow, type ThinkingLevel } from './modelPickLogic';
import { isClaudeSpec, modelLabel } from './modelViews';
import { scopeKey } from './useModelCatalogue';
import { useModelPrefs } from './useModelPrefs';
import strings from './ModelPick.strings.en.json';
import mcStrings from './ModelChooser.strings.en.json';

type Choice = providers.Choice;
type Evidence = providers.Evidence;

export type { PickDraft, PickOutcome, ThinkingStep, ModelPickPanelProps, ModelPickFieldProps, ModelPickChipProps } from './ModelPick';
type PickDraft = Web.PickDraft;
type PickOutcome = Web.PickOutcome;

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

export const ModelPickPanel: typeof Web.ModelPickPanel = (p) => {
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
    <Box dir="row" gap={2} justify="end" shrink={0}>
      {p.onCancel && (
        <Button variant="ghost" size="sm" isDisabled={state.kind === 'busy'} onPress={p.onCancel}>
          {t('foot.cancel')}
        </Button>
      )}
      <Button variant="primary" size="sm" isDisabled={!changed || busy || !!p.isDisabled} busy={state.kind === 'busy'} onPress={() => void commit(p.draft, p.draft.spec === p.value.spec ? null : choice)}>
        {t('foot.use')}
      </Button>
    </Box>
  );

  return (
    <Box dir="column" gap={1} shrink={0}>
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
        <Box dir="column" shrink={0} sem={{ id: stepId }}>
          {thinkingStep}
        </Box>
      )}
      {state.kind === 'pending' && (
        <Text colour="muted" sem={{ role: 'status' }}>
          {state.text ?? t('out.pending')}
        </Text>
      )}
      {state.kind === 'refused' && (
        <Text colour="danger" sem={{ role: 'alert' }}>
          {state.text}
        </Text>
      )}
      {footer}
    </Box>
  );
};

// ── the field ───────────────────────────────────────────────────────────────────────────

/** A settings row: the model's name (never blank), its facts, readiness and thinking, with Change (a Drawer `sm`). */
export const ModelPickField: typeof Web.ModelPickField = (p) => {
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
    <Box dir="column" shrink={0} sem={{ role: 'group', labelledBy: `${id}-l`, describedBy: [p.disabledReason || p.whyOverride ? descId : '', p.error ? errId : ''].filter(Boolean).join(' ') || undefined }}>
      <Box dir="row" wrap gapX={2} align="center" shrink={0}>
        <Text colour="muted" sem={{ id: `${id}-l`, role: 'text', name: p.label }}>
          {p.label}
        </Text>
        <Text bold>{name}</Text>
        {facts.length > 0 && <Text colour="muted">{facts.join(' · ')}</Text>}
        {tag}
        <Button variant="secondary" size="sm" isDisabled={!!p.disabledReason || !!p.isDisabled} aria-label={t('fld.changeOf', { label: p.label })} onPress={openDrawer}>
          {t('fld.change')}
        </Button>
      </Box>
      {(p.disabledReason || p.whyOverride) && (
        // The id on a box with no role: the walker takes the description from the words drawn in it (whyOverride may be
        // a component); a bare Text's id names nothing.
        <Box sem={{ id: descId }}>
          <Text colour="muted">{p.disabledReason ?? p.whyOverride}</Text>
        </Box>
      )}
      {p.error && (
        <Text colour="danger" sem={{ id: errId, role: 'alert' }}>
          {p.error}
        </Text>
      )}
      <Drawer isOpen={open} onOpenChange={setOpen} title={p.label} size="sm" overlayId="model-pick-change" resizeKey={p.resizeKey} dirty={!sameDraft(draft, p.value)}>
        <ModelPickPanel {...p} draft={draft} onDraft={(d) => setDraft(d)} mode="saved" onCancel={() => setOpen(false)} onDone={() => setOpen(false)} />
      </Drawer>
    </Box>
  );
};

// ── the chip ────────────────────────────────────────────────────────────────────────────

/** A composer strip chip: the model's name; it opens the panel in live mode (a popover, a sheet on a phone). */
export const ModelPickChip: typeof Web.ModelPickChip = (p) => {
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
};

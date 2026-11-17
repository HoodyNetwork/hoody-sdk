// New workflow: the drawer opens on asking the assistant to write it (NewAsk.tsx); the form below is the other side. One
// switch at the top, Write it | Ask the agent, moves between them, and each side keeps what was typed. A side whose send is
// on its way or unresolved holds the switch (a Create out; a start the asking side holds). Make a copy… opens on the form.
// The form creates one workflow on the computer shown, from a blank
// definition or a copy of a listed one. The send and its record are createAttempts.ts's (one PUT per Create, never sent
// again; a create whose answer was lost stays held, on its target, until Check again proves it or the person stops
// tracking it). The drawer only shows them:
//   - a warn Band per held create of this computer and realm, before any name is typed (the scope, not the name, finds
//     them), each with Check again (a read, never a send) and Stop tracking (a confirm);
//   - a name that is held gets a ReasonButton instead of Create;
//   - a name already listed is advice and keeps Create off (the agent's expected_absent is the real check).
// The drawer is bound to the account, computer and realm shown when it opened: the copy read, Create and Check again each
// run only while the context shown now names that same scope, under a capture taken at the press; otherwise nothing is
// read or sent and the drawer says why.
import { capture, useCore, type Ctx } from '@core';
import {
  Band, Button, CodeEditor, ConfirmDialog, Drawer, EntityPicker, Outcome, RadioGroup, ReasonButton, SegmentedControl, Stack, TextButton, TextField, useStrings,
} from '@kit';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { nameProblem, nameTaken, type CheckResult } from './create';
import { checkAgain, createAttempts as defaultStore, scopeOf, sendCreate, type CreateAttempt, type CreateAttempts } from './createAttempts';
import { AskBody, AskPrimary, useNewAsk } from './NewAsk';
import { definitionOf, sourceOf } from './source';
import { diagnosticOf, workflowCreateApi, type WorkflowCreateApi } from './sourceApi';
import type { Workflow } from './logic';
import { refreshWorkflows } from './data';
import strings from './New.strings.en.json';

type T = ReturnType<typeof useStrings<typeof strings>>;
type From = 'blank' | 'copy';

/** The blank definition: one command step, its summary in the definition (there is no separate Summary field). */
export function blankDefinition(summary: string): string {
  return JSON.stringify( // reason: the editor's starting text (CodeEditor shows it), not a view of data
    { summary, entry_point: { id: 'start' }, steps: { start: { type: 'bash', command: 'echo hello' } } },
    null, 2,
  );
}

export interface NewWorkflowProps {
  computer: string;
  /** The realm the list shows (null: the realm shown now, resolved once when the drawer opens). */
  realm: string | null;
  /** The listed workflows: names for the taken advice, and what A copy of… offers (undefined while the list reads). */
  listed: readonly Workflow[] | undefined;
  /** Opens with A copy of… this workflow (Make a copy…). */
  copyOf?: string;
  onClose(): void;
  /** The workflow is on the computer (created, or proved by Check again): the list opens it. */
  onCreated(name: string): void;
  /** Tests. */
  store?: CreateAttempts;
  makeApi?: (name: string, realm: string, ctx: ReturnType<typeof capture>) => WorkflowCreateApi;
}

type CopyRead = { phase: 'idle' } | { phase: 'reading'; of: string } | { phase: 'read'; of: string } | { phase: 'failed'; of: string; error: unknown };

export function NewWorkflow({ computer, realm, listed, copyOf, onClose, onCreated, store = defaultStore, makeApi }: NewWorkflowProps) {
  const t = useStrings(strings);
  const [opened] = useState(() => {
    const c = capture(); const r = realm ?? c.realm ?? ''; const at = c.target;
    return { r, scope: scopeOf(c, r), at: at && scopeOf(c, r) ? { computer: { project: at.project.id, id: at.container.id, name: computer, server: at.container.server_name }, realm: r } : null };
  });
  const r = opened.r;
  useSyncExternalStore(store.subscribe, store.version);
  useCore();
  const [mode, setMode] = useState<'ask' | 'source'>(copyOf ? 'source' : 'ask');
  /** A capture taken now, when it still names the drawer's scope; null otherwise (nothing may be read or sent). */
  const here = useCallback((): Ctx | null => {
    const c = capture();
    return opened.scope !== null && scopeOf(c, realm ?? c.realm ?? '') === opened.scope ? c : null;
  }, [opened, realm]);
  const moved = here() === null;
  const scope = opened.scope;

  const [name, setName] = useState('');
  const [from, setFrom] = useState<From>(copyOf ? 'copy' : 'blank');
  const [blankStart] = useState(() => blankDefinition(t('new.blankSummary')));
  const [blank, setBlank] = useState(blankStart);
  const [pick, setPick] = useState<string | undefined>(copyOf);
  const [copy, setCopy] = useState('');
  const [read, setRead] = useState<CopyRead>({ phase: 'idle' });
  const [mine, setMine] = useState<CreateAttempt | null>(null);
  const [sending, setSending] = useState(false);
  const [checked, setChecked] = useState<CheckResult | { k: 'elsewhere' } | undefined>(undefined);
  const [checking, setChecking] = useState(false);
  const [retry, setRetry] = useState(0);
  const reads = useRef(0);
  const out = useRef(false);
  // What the person typed on the source side: a name, a changed blank, another workflow to copy.
  const formWords = name !== '' || blank !== blankStart || pick !== copyOf;
  const ask = useNewAsk({ computer, at: moved ? null : opened.at, stay: mode === 'source', formWords, onLeave: onClose });

  // A copy reads its source once per pick (or Try again). Every change of pick or Start from retires the read out, so
  // only the read of the pick shown now can fill the editor; a cleared pick leaves nothing to create from.
  useEffect(() => {
    const n = ++reads.current;
    if (from !== 'copy' || !pick) { setRead({ phase: 'idle' }); return; }
    const c = here();
    if (!c) { setRead({ phase: 'idle' }); return; }
    setRead({ phase: 'reading', of: pick });
    void (makeApi ?? workflowCreateApi)(pick, r, c).get().then((s) => {
      if (n !== reads.current) return;
      const doc = s.ok ? sourceOf(s.body) : null;
      if (doc) { setCopy(doc.content); setRead({ phase: 'read', of: pick }); } else setRead({ phase: 'failed', of: pick, error: s.ok ? null : s.err });
    });
    // moved: here() reads the context shown now, so a change of it re-runs the read.
  }, [from, pick, retry, r, makeApi, here, moved]);

  const text = from === 'blank' ? blank : read.phase === 'read' && read.of === pick ? copy : null;
  const def = text === null ? null : definitionOf(text);
  const problem = nameProblem(name);
  const taken = listed ? nameTaken(name, listed.map((w) => w.name)) : null;
  const heldName = scope && name ? store.get(`${scope}|${name}`) : undefined;
  const live = mine && store.get(mine.key) === mine ? mine : null;
  const busy = sending || live?.phase === 'sending';

  const create = async () => {
    if (!def || !('def' in def) || problem || taken || heldName || busy || out.current) return;
    const c = here();
    if (!c) return;
    out.current = true;
    setSending(true);
    try {
      const res = await sendCreate(store, name, r, def.def, makeApi ? { ctx: c, makeApi } : { ctx: c });
      if (res.k === 'sent') {
        setMine(res.attempt);
        if (res.attempt.phase === 'done') { refreshWorkflows(); onCreated(name); }
      }
    } finally {
      out.current = false;
      setSending(false);
    }
  };

  const check = async (a: CreateAttempt) => {
    if (!here()) return;
    setChecking(true);
    try {
      const res = await checkAgain(store, a, { ...(makeApi ? { makeApi } : {}), ...(realm ? { realm } : {}) });
      if (res.k === 'ended') return;
      setChecked(res);
      if (res.k === 'created') { refreshWorkflows(); onCreated(a.name); }
    } finally {
      setChecking(false);
    }
  };

  const primary = moved ? (
    <ReasonButton variant="primary" reason={t('new.moved', { computer })}>{t('new.create')}</ReasonButton>
  ) : heldName ? (
    <ReasonButton variant="primary" reason={t('new.heldReason', { name, computer })}>{t('new.create')}</ReasonButton>
  ) : live?.phase === 'unknown' ? undefined : !busy && name === '' ? (
    // Nothing is typed yet: the field shows no error for an empty name, so the button says what it waits for.
    <ReasonButton variant="primary" reason={t('new.name.empty')}>{t('new.create')}</ReasonButton>
  ) : !busy && from === 'copy' && !pick ? (
    <ReasonButton variant="primary" reason={t('new.copyOf.need')}>{t('new.create')}</ReasonButton>
  ) : (
    <Button variant="primary" isDisabled={busy || !def || !('def' in def) || problem !== null || taken !== null} onPress={() => void create()}>
      {t('new.create')}
    </Button>
  );
  const problems = def && 'problem' in def ? definitionProblems(t, def) : undefined;
  // This drawer's Create was refused because the name is on the computer: offer that workflow beside Create.
  const existing = !moved && mode === 'source' && mine && !live && mine.phase !== 'done' && mine.outcome?.k === 'exists' ? mine.name : null;

  return (
    <Drawer
      isOpen
      onOpenChange={(o) => !o && onClose()}
      title={t('new.title')}
      subtitle={t('new.subtitle', { computer })}
      size="lg"
      resizeKey="ai-workflow-new"
      overlayId="ai-workflow-new"
      busy={busy}
      // The chat opened, on the asking side: leaving for it is the point, so nothing asks first (a leave guard read now would hold the chat back).
      dirty={(mode === 'source' || ask.phase.k !== 'opened') && !busy && (formWords || (!ask.busy && ask.text.trim() !== ''))}
      // Moved to another scope: the held create belongs to the opening one, so it is not shown (nor its Check again) here.
      outcome={moved || mode === 'ask' ? undefined : <MineOutcome t={t} a={mine} live={live} name={mine?.name ?? name} computer={computer} checked={checked} checking={checking} onCheck={() => mine && void check(mine)} />}
      primary={mode === 'ask' ? <AskPrimary ask={ask} moved={moved} computer={computer} /> : primary}
      secondary={existing !== null ? <TextButton onPress={() => onCreated(existing)}>{t('new.open')}</TextButton> : undefined}
    >
      <Stack gap={4}>
        <SegmentedControl<'source' | 'ask'>
          label={t('new.mode')}
          value={mode}
          onChange={setMode}
          items={[
            { id: 'source', label: t('new.mode.write'), isDisabled: mode === 'ask' && ask.busy },
            { id: 'ask', label: t('new.mode.ask'), isDisabled: mode === 'source' && busy },
          ]}
        />
        {mode === 'ask' ? <AskBody ask={ask} computer={computer} moved={moved} /> : <Stack gap={4}>
          {moved && (
            <Band tone="warn" size="table" /* noDetails: nothing was asked of the agent; the words say what changed */>{t('new.moved', { computer })}</Band>
          )}
          {!moved && <HeldCreates computer={computer} realm={r} store={store} makeApi={makeApi} onCreated={(n) => { if (n === mine?.name) onCreated(n); }} skip={live?.phase === 'unknown' ? live : null} />}
          <TextField
            label={t('new.name')}
            value={name}
            onChange={setName}
            isDisabled={busy}
            isRequired
            description={taken ? t(`new.taken.${taken}`, { name, computer }) : undefined}
            errorMessage={name !== '' && problem ? t(`new.name.${problem}`) : undefined}
            isInvalid={name !== '' && problem !== null}
          />
          <RadioGroup<From>
            label={t('new.from')}
            value={from}
            onChange={setFrom}
            isDisabled={busy}
            options={[{ value: 'blank', label: t('new.from.blank') }, { value: 'copy', label: t('new.from.copy') }]}
          />
          {from === 'copy' && (
            <EntityPicker<string>
              label={t('new.copyOf')}
              value={pick}
              onChange={(v) => setPick(v ?? undefined)}
              isDisabled={busy}
              options={listed?.map((w) => ({ value: w.name, label: w.name }))}
              isLoading={listed === undefined}
              error={read.phase === 'failed' ? read.error ?? new Error(t('new.copyFailed')) : undefined}
              onRetry={() => setRetry((n) => n + 1)}
            />
          )}
          {text !== null && (
            <CodeEditor
              label={t('new.definition')}
              value={text}
              readOnly={busy}
              onChange={from === 'blank' ? setBlank : setCopy}
              rows={14}
              problems={problems}
            />
          )}
        </Stack>}
      </Stack>
    </Drawer>
  );
}

/** A definition that does not parse, for the editor's Problems list (marked on its line when it has one). */
function definitionProblems(t: T, d: Extract<ReturnType<typeof definitionOf>, { problem: unknown }>) {
  return [{ line: d.line ?? null, message: t(`new.problem.${d.problem}`, { key: d.key ?? '', line: String(d.line ?? '') }) }];
}

export interface HeldCreatesProps {
  computer: string;
  /** The realm shown (null: the realm shown now). */
  realm: string | null;
  /** A held create proved by Check again: the list opens it. */
  onCreated(name: string): void;
  /** One not to list (the drawer's own Create, shown in its outcome). */
  skip?: CreateAttempt | null;
  store?: CreateAttempts;
  makeApi?: NewWorkflowProps['makeApi'];
}

/** A warn Band per create of this computer and realm whose answer was lost (found by scope, so before any name is typed),
 *  with Check again (it only reads) and Stop tracking (a confirm). A create still out (its PUT unanswered) is listed as
 *  sending, with both off: stopping it would free its name for a second PUT before the first settled. Nothing when none
 *  is held. */
export function HeldCreates({ computer, realm, onCreated, skip = null, store = defaultStore, makeApi }: HeldCreatesProps) {
  const t = useStrings(strings);
  useSyncExternalStore(store.subscribe, store.version);
  const scope = scopeOf(capture(), realm ?? capture().realm ?? '');
  const held = (scope ? store.list(scope) : []).filter((a) => a !== skip);
  const [checked, setChecked] = useState<ReadonlyMap<CreateAttempt, CheckResult | { k: 'elsewhere' }>>(new Map());
  const [checking, setChecking] = useState<CreateAttempt | null>(null);
  const [stopping, setStopping] = useState<CreateAttempt | null>(null);
  const check = async (a: CreateAttempt) => {
    setChecking(a);
    try {
      const res = await checkAgain(store, a, { ...(makeApi ? { makeApi } : {}), ...(realm ? { realm } : {}) });
      if (res.k === 'ended') return;
      setChecked((m) => new Map(m).set(a, res));
      if (res.k === 'created') { refreshWorkflows(); onCreated(a.name); }
    } finally {
      setChecking(null);
    }
  };
  if (held.length === 0 && stopping === null) return null;
  return (
    <>
      {held.map((a) => (
        <Band
          key={a.key}
          tone="warn"
          size="table"
          // noDetails: the create's answer was lost, so no rejection came back to show; Check again reads what is there
          actions={<>
            <TextButton isDisabled={checking === a || a.phase === 'sending'} onPress={() => void check(a)}>{t('new.check')}</TextButton>
            <TextButton isDisabled={a.phase === 'sending'} onPress={() => setStopping(a)}>{t('new.stop')}</TextButton>
          </>}
        >
          {heldWords(t, a, checked.get(a), computer)}
        </Band>
      ))}
      <ConfirmDialog
        isOpen={stopping !== null}
        onOpenChange={(o) => !o && setStopping(null)}
        overlayId="ai-workflow-new-stop"
        title={t('new.stop.title', { name: stopping?.name ?? '' })}
        body={t('new.stop.body', { computer })}
        confirmLabel={t('new.stop.confirm')}
        onConfirm={() => { if (stopping?.phase === 'unknown') store.stop(stopping); setStopping(null); }}
      />
    </>
  );
}

/** A held create's Band words: what Check again last saw, or that it may have gone through. */
function heldWords(t: T, a: CreateAttempt, c: CheckResult | { k: 'elsewhere' } | undefined, computer: string): string {
  if (a.phase === 'sending') return t('new.out.sending', { name: a.name });
  if (c?.k === 'elsewhere') return t('new.elsewhere', { name: a.name, computer });
  if (c?.k === 'unknown' || a.seen) return t(`new.seen.${c?.k === 'unknown' ? c.seen : a.seen ?? 'unread'}`, { name: a.name, computer });
  return t('new.heldBand', { name: a.name });
}

/** This drawer's own Create: its answer, in words. A refusal wrote nothing; an unknown is never sent again. */
function MineOutcome({ t, a, live, name, computer, checked, checking, onCheck }: {
  t: T; a: CreateAttempt | null; live: CreateAttempt | null; name: string; computer: string;
  checked: CheckResult | { k: 'elsewhere' } | undefined; checking: boolean; onCheck(): void;
}) {
  if (!a) return null;
  if (live?.phase === 'sending') return <Outcome outcome="pending" title={t('new.out.sending', { name })} /* noDetails: still out, nothing came back */ />;
  if (live?.phase === 'unknown') {
    const detail = checked?.k === 'elsewhere' ? t('new.elsewhere', { name, computer }) : checked?.k === 'unknown' ? t(`new.seen.${checked.seen}`, { name, computer }) : undefined;
    return <Outcome variant="block" outcome="pending" title={t('new.out.unknown', { name, computer })} detail={detail} onCheck={onCheck} checking={checking} /* noDetails: the answer was lost, so nothing came back to show */ />;
  }
  if (a.phase === 'done') return <Outcome outcome="done" title={t('new.out.created', { name, computer })} />;
  const o = a.outcome;
  if (!o) return null; // Stop tracking: nothing to say here.
  if (o.k === 'exists') {
    // Open it is the drawer's secondary action (NewWorkflow), beside Create.
    return <Outcome outcome="failed" title={t('new.out.exists', { name })} /* noDetails: the agent's expected_absent check said the name is on the computer; the words say so */ />;
  }
  if (o.k === 'refused') {
    if (o.code === 'invalid_definition') return <Outcome variant="block" outcome="failed" title={t('new.out.invalid', { reason: diagnosticOf(o.reason ?? '') })} /* noDetails: the agent's diagnostic is the title */ />;
    if (o.code === 'reserved_name') return <Outcome outcome="failed" title={t('new.out.reserved')} /* noDetails: the agent's code reserved_name is the whole answer */ />;
    if (o.code === 'daemon_paused') return <Outcome outcome="failed" title={t('new.out.paused', { computer })} /* noDetails: the agent's code daemon_paused is the whole answer */ />;
    return <Outcome outcome="failed" title={t('new.out.refused', { computer })} /* noDetails: only the code is kept, nothing more to show */ />;
  }
  return null;
}

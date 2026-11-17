// AI → Settings → Rules & safety → Hooks → the hook editor. One dialog adds a hook, changes one in
// place, or replaces one. A hook is named by its event, its tool and its exact command, so changing any of those makes a different hook:
// Save then adds the new hook and, only once that is done, removes the old one, as two guarded writes with a nonce each. Each step is
// reported on its own. A lost answer is held as "outcome unknown" (hooksData.ts): the person looks at the list and stops tracking it;
// no read releases it and nothing is sent again. A test runs the draft command now, after a confirm that names it.
import { Band, Button, ConfirmEffect, Dialog, OutcomeBanner, Select, Stack, TextField, useStrings } from '@kit';
import { useMemo, useState } from 'react';
import type { HookChange, StepReport, TestResult } from './hooksData';
import { runPlan, runStep, runTest } from './hooksData';
import { HOOK_EVENTS, killScopes, type HookRow, type HooksBlock } from './hooks';
import { findHidden, markHidden } from './hidden';
import { draftOf, exactSame, identityOf, planOf, removeOf, strippedOf, timeoutOf, type DraftProblem, type HookDraft, type PlanKind, type Plan, type PlanStep } from './hookEdit';
import type { RuleScope } from './logic';
import type { Hold, SettingsAt } from './Session';
import strings from './HookEdit.strings.en.json';
import hookStrings from './Hooks.strings.en.json';

type T = ReturnType<typeof useStrings<typeof strings>>;
type HT = ReturnType<typeof useStrings<typeof hookStrings>>;
const word = (t: T, k: string): string => t(k as never);
type OkPlan = Extract<Plan, { ok: true }>;

export interface HookEditProps {
  at: SettingsAt;
  hold: Hold;
  block: HooksBlock;
  change: HookChange;
  /** The shown computer's name for words. */
  computer: string;
  /** The hook being changed, or null for a new one. */
  hook: HookRow | null;
  onClose: () => void;
  /** Reads the list again, for after a step was accepted. */
  reload: () => void;
  /** Reads the list again now and hands it back (null: no readable list): what a second try of the delete is judged on. */
  fresh: () => Promise<HooksBlock | null>;
}

interface Ran { plan: OkPlan; reports: StepReport[] }
type StepState = 'done' | 'pending' | 'failed' | 'not_sent' | 'stale' | 'skipped';

const stateOf = (reports: readonly StepReport[], i: number): StepState => reports[i]?.result.outcome ?? 'skipped';
const failed = (s: StepState): boolean => s === 'failed' || s === 'not_sent' || s === 'stale';

/** The text a refused step shows: the agent's typed refusal, or a typed "not sent" reason. Never the agent's own words. */
function refusalText(t: T, r: StepReport['result']): string | undefined {
  if (r.outcome === 'failed' && r.code) { const k = `refused.${r.code}`; return k in strings ? word(t, k) : undefined; }
  if (r.outcome === 'not_sent' && r.code) { const k = `notsent.${r.code}`; return k in strings ? word(t, k) : undefined; }
  return undefined;
}

function whatOf(t: T, plan: OkPlan, i: number): string {
  const s = plan.steps[i] as PlanStep;
  return s.op === 'delete' ? t('step.delete') : word(t, `step.upsert.${plan.kind}`);
}

function summaryOf(t: T, plan: OkPlan, reports: readonly StepReport[]): string | null {
  const a = stateOf(reports, 0);
  if (a === 'pending') return plan.kind === 'replace' ? t('ran.unknownAdd') : t('ran.unknownSave');
  if (a !== 'done') return t('ran.addFailed');
  if (plan.steps.length === 1) return null;
  const b = stateOf(reports, 1);
  if (b === 'done') return t('ran.replaced');
  if (b === 'pending') return t('ran.unknownRemove');
  return t('ran.oldStays');
}

const problemFor = (ps: readonly DraftProblem[], ...of: DraftProblem[]): DraftProblem | undefined => ps.find((p) => of.includes(p));

/** What a test printed, cut and with control characters removed. */
const shown = (s: string): string => s.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').slice(0, 1500);

export function HookEdit({ at, hold, block, change, computer, hook, onClose, reload, fresh }: HookEditProps) {
  const t = useStrings(strings);
  const ht = useStrings(hookStrings);
  const cwd = at.cwd;
  const [draft, setDraft] = useState<HookDraft>(() => draftOf(hook));
  /** The fields whose hidden characters the draft dropped: each says so under it while the dialog is open. */
  const stripped = useMemo(() => strippedOf(hook), [hook]);
  const [touched, setTouched] = useState(false);
  const kills = useMemo(() => killScopes(block, cwd), [block, cwd]);
  const [scopeNew, setScopeNew] = useState<RuleScope | null>(kills[0] ?? null);
  const plan = useMemo(() => planOf(block, hook, draft, cwd, hook ? null : scopeNew), [block, hook, draft, cwd, scopeNew]);
  const [ran, setRan] = useState<Ran | null>(null);
  /** Why the last Remove sent nothing (a string key), judged on the list read for it. */
  const [kept, setKept] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [askTest, setAskTest] = useState(false);
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState<TestResult | null>(null);
  const waiting = change.state !== 'free';
  const set = (p: Partial<HookDraft>) => { setDraft((d) => ({ ...d, ...p })); setTouched(true); setTested(null); };
  const problems = plan.ok ? [] : plan.why === 'invalid' ? plan.problems : [];
  // Problems show once the person edits: a saved hidden or direction-turning character never reaches the field (draftOf strips it), and a
  // typed or pasted direction-turning one is refused here once the field is touched (name_bidi / desc_bidi).
  const shownProblems = touched ? problems : [];
  /** A name or description as it would show with each hidden character marked: the field itself shows them as nothing. */
  const shownAs = (s: string): string | undefined => (findHidden(s) ? t('field.shownAs', { text: markHidden(s) }) : undefined);
  const kind: PlanKind = plan.ok ? plan.kind : !hook ? 'create' : exactSame(hook, identityOf(draft)) ? 'update' : 'replace';

  const save = async () => {
    if (!plan.ok || busy) return;
    setBusy(true);
    try {
      const reports = await runPlan(change, { at, hold, scope: plan.scope }, plan.steps);
      setRan({ plan, reports });
      if (reports.some((r) => r.result.outcome === 'done')) reload();
    } finally {
      setBusy(false);
    }
  };
  // The delete is never the one saved with the plan: the list is read again, and the old hook must still be there, exactly once, with
  // nothing the agent could take for it (its delete reaches every group of the canonical matcher). Otherwise nothing is minted or sent.
  const removeOld = async () => {
    if (!ran || busy || !hook) return;
    setBusy(true);
    setKept(null);
    try {
      const now = await fresh();
      if (!now) { setKept('remove.unread'); return; }
      const d = removeOf(now, hook, cwd);
      if (!d.ok) { setKept(d.why === 'gone' ? 'remove.gone' : d.why === 'twin' || d.why === 'ambiguous' ? 'remove.twin' : 'remove.unsafe'); return; }
      const step = await runStep(change, { at, hold, scope: ran.plan.scope }, d.step);
      setRan({ plan: ran.plan, reports: [ran.reports[0] as StepReport, step] });
      if (step.result.outcome === 'done') reload();
    } finally {
      setBusy(false);
    }
  };
  const test = async () => {
    setAskTest(false);
    setTesting(true);
    setTested(null);
    try {
      setTested(await runTest({ at, hold, event: draft.event, command: draft.command, timeout: timeoutOf(draft.timeout) ?? 0 }));
    } finally {
      setTesting(false);
    }
  };

  const allDone = ran !== null && ran.plan.steps.every((_, i) => stateOf(ran.reports, i) === 'done');
  const title = ran ? (allDone ? t('title.done') : t(hook ? 'title.edit' : 'title.add')) : t(hook ? 'title.edit' : 'title.add');
  const eventOptions = HOOK_EVENTS.map((e) => ({ value: e, label: `event.${e}` in hookStrings ? (ht as HT)(`event.${e}` as never) : e }));
  const scopeOptions = kills.map((s) => ({ value: s, label: (ht as HT)(`scope.${s}` as never) }));
  const canTest = draft.command.trim() !== '' && (HOOK_EVENTS as readonly string[]).includes(draft.event) && !busy && !testing && !waiting;

  return (
    <>
      <Dialog
        isOpen
        overlayId="ai-hook-edit"
        onOpenChange={(o) => { if (!o) onClose(); }}
        title={title}
        size="lg"
        primaryLabel={ran ? t('close') : word(t, `save.${kind}`)}
        primaryDisabled={ran ? false : !plan.ok || busy || waiting}
        primaryDisabledReason={!ran && !busy && !waiting && !plan.ok && plan.why === 'invalid' ? t('save.need') : undefined}
        hideCancel={ran !== null}
        busy={busy}
        onPrimary={() => { if (ran) onClose(); else void save(); }}
      >
        {ran ? (
          <Stack gap={3}>
            {(() => { const s = summaryOf(t, ran.plan, ran.reports); return s ? <Band tone={allDone ? 'neutral' : 'warn'} size="table" /* noDetails: this page's own summary of the steps below */>{s}</Band> : null; })()}
            {ran.plan.steps.map((_, i) => {
              const st = stateOf(ran.reports, i);
              const r = ran.reports[i]?.result;
              return (
                <Stack key={i} gap={2}>
                  <Band tone={st === 'done' ? 'neutral' : 'warn'} size="table" /* noDetails: the state of one step, its refusal is shown under it */>
                    {t('step.line', { n: String(i + 1), what: whatOf(t, ran.plan, i), state: word(t, `state.${st}`) })}
                  </Band>
                  {r && failed(st) && (
                    <OutcomeBanner
                      kind={st as 'failed' | 'not_sent' | 'stale'}
                      error={{ outcome: r.outcome, ...(r.code ? { code: r.code } : {}), ...(r.status !== undefined ? { status: r.status } : {}), ...(r.traceId ? { traceId: r.traceId } : {}), ...(r.route ? { route: r.route } : {}) }}
                      body={refusalText(t, r)}
                    />
                  )}
                </Stack>
              );
            })}
            {ran.plan.steps.length === 2 && stateOf(ran.reports, 0) === 'done' && failed(stateOf(ran.reports, 1)) && (
              <Button variant="secondary" isDisabled={busy || waiting} onPress={() => { void removeOld(); }}>{t('removeOld')}</Button>
            )}
            {kept && <Band tone="warn" size="table" /* noDetails: a check made on this page before anything is sent */>{word(t, kept)}</Band>}
          </Stack>
        ) : (
          <Stack gap={3}>
            <Select label={t('field.event')} options={eventOptions} value={draft.event} onChange={(v) => set({ event: v })} />
            {problemFor(shownProblems, 'event') && <Band tone="warn" size="table" /* noDetails: a check made on this page before anything is sent */>{word(t, `problem.event`)}</Band>}
            <TextField
              label={t('field.matcher')}
              description={t('field.matcher.hint')}
              value={draft.matcher}
              onChange={(v) => set({ matcher: v })}
              mono
            />
            <TextField
              label={t('field.command')}
              value={draft.command}
              onChange={(v) => set({ command: v })}
              mono
              isRequired
              errorMessage={problemFor(shownProblems, 'command') ? t('problem.command') : undefined}
            />
            <TextField
              label={t('field.timeout')}
              description={t('field.timeout.hint')}
              value={draft.timeout}
              onChange={(v) => set({ timeout: v })}
              mono
              errorMessage={problemFor(shownProblems, 'timeout') ? t('problem.timeout') : undefined}
            />
            <TextField
              label={t('field.name')}
              description={shownAs(draft.name) ?? (stripped.name ? t('field.name.stripped') : undefined)}
              value={draft.name}
              onChange={(v) => set({ name: v })}
              // A new hook (an add, or a replace: a new identity) needs its name and description (the agent answers 400 without); a label edit does not.
              {...(kind !== 'update' ? { isRequired: true } : {})}
              errorMessage={(() => { const p = problemFor(shownProblems, 'name_missing', 'name_line', 'name_bidi', 'name_long'); return p ? word(t, `problem.${p}`) : undefined; })()}
            />
            <TextField
              label={t('field.description')}
              description={shownAs(draft.description) ?? (stripped.description ? t('field.description.stripped') : undefined)}
              value={draft.description}
              onChange={(v) => set({ description: v })}
              multiline
              rows={2}
              {...(kind !== 'update' ? { isRequired: true } : {})}
              errorMessage={(() => { const p = problemFor(shownProblems, 'desc_missing', 'desc_bidi', 'desc_long'); return p ? word(t, `problem.${p}`) : undefined; })()}
            />
            {!hook && kills.length > 1 && (
              <Select label={t('field.savedIn')} options={scopeOptions} value={scopeNew ?? kills[0]!} onChange={(v) => setScopeNew(v)} />
            )}
            {!plan.ok && plan.why !== 'invalid' && <Band tone="warn" size="table" /* noDetails: a check made on this page before anything is sent */>{word(t, `refuse.${plan.why}`)}</Band>}
            <Button variant="secondary" isDisabled={!canTest} onPress={() => { setAskTest(true); }}>{t('test')}</Button>
            {tested && <TestOut t={t} r={tested} />}
          </Stack>
        )}
      </Dialog>
      <ConfirmEffect
        isOpen={askTest}
        onOpenChange={setAskTest}
        title={t('test.title')}
        effects={[t('test.runs', { command: draft.command, computer }), t('test.saved')]}
        confirmLabel={t('test.confirm')}
        onConfirm={() => { void test(); }}
      />
    </>
  );
}

function TestOut({ t, r }: { t: T; r: TestResult }) {
  if (r.kind === 'unknown') return <Band tone="warn" size="table" /* noDetails: the answer never came back */>{t('test.unknown')}</Band>;
  if (r.kind === 'not_run') return <Band tone="neutral" size="table">{t('test.notrun')}</Band>;
  if (r.kind === 'refused') {
    const k = `test.refused.${r.code}`;
    return <Band tone="warn" size="table" /* noDetails: the agent's typed refusal */>{k in strings ? word(t, k) : t('test.refused.other')}</Band>;
  }
  if (r.rows.length === 0) return <Band tone="neutral" size="table">{t('test.none')}</Band>;
  return (
    <Stack gap={2}>
      {r.rows.map((row, i) => (
        <Stack key={i} gap={1}>
          <Band tone={row.exitCode === 0 && !row.timedOut ? 'neutral' : 'warn'} size="table" /* noDetails: what the command did */>
            {row.timedOut ? t('test.timedOut') : t('test.exit', { code: String(row.exitCode ?? '?'), ms: String(row.durationMs ?? '?') })}
          </Band>
          {row.stdout.trim() !== '' && <TextField label={t('test.out')} value={shown(row.stdout)} isReadOnly multiline rows={3} mono />}
          {row.stderr.trim() !== '' && <TextField label={t('test.err')} value={shown(row.stderr)} isReadOnly multiline rows={3} mono />}
        </Stack>
      ))}
    </Stack>
  );
}

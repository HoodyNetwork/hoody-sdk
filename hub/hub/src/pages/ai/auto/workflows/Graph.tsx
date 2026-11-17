// A workflow's detail: a header (its name, where it
// comes from, Hidden when the agent says so, its summary, step count and inputs, and the ActionBar: Edit source, the rest
// in "..."), then its Sections. Steps lists the steps in run order (graphOf): each with its order mark (the row's number;
// a row of several steps gives each a letter, "3a, 3b"), its id, a kind badge with a tip, its line, and where it leads as
// facts. A row that is exactly one step's fan-out says so ("3a, 3b · run together" when the agent says it starts them at
// once, else "After fix", claiming nothing about which run). "Then" is said unless the rows already show it with no
// condition, and a question step lists its answers with the steps each one starts. While the answer routes are read the
// section is loading; a failed read keeps the steps under a band with Try again. Runs (Runs.tsx), Settings,
// Source (Source.tsx: the change notes and the Definition fold with the editor) follow, then the steps not reached from
// the start and the ones reached by a route not shown. The pause read decides the paused state (data.ts).
// Run… (first in "...") opens the run drawer (RunForm.tsx) in the realm the workflow was listed in, else the
// realm shown; it is not offered when neither names one realm (All realms).
import {
  ActionBar, AnatomySection, Band, Button, DetailBody, DetailHeader, EmptyState, Facts, ItemList, SectionGroup, Tag, useStrings,
  type ItemProps, type SectionState, type Translate,
} from '@kit';
import { isRealmOrGlobal } from '@core';
import { useAiRealm } from '../../aiRealm';
import { useState } from 'react';
import { useWorkflowDetail, useWorkflowHiddenCap, type Answers, type DetailRead } from './data';
import { graphOf, stepKind, stepMarks, type AnswerRoute, type Graph, type GraphRow, type Link, type Param, type Step, type Workflow } from './logic';
import { RunForm } from './RunForm';
import runStrings from './Run.strings.en.json';
import { RunsSection, type ChatHref } from './Runs';
import type { RunsRead } from './runsData';
import { useSourceActions, useWorkflowSource, WorkflowSource } from './Source';
import sourceStrings from './Source.strings.en.json';
import strings from './strings.en.json';

type T = Translate<typeof strings>;

function duration(t: T, sec: number): string {
  if (sec % 3600 === 0) return t('wf.hour', { count: sec / 3600 });
  if (sec >= 60) return t('wf.min', { n: Math.round(sec / 60) });
  return t('wf.sec', { n: sec });
}

function inputWords(t: T, params: readonly Param[]): string {
  if (!params.length) return t('wf.noInputs');
  const list = params.map((p) =>
    p.required ? t('wf.input.required', { name: p.name }) : p.default !== null ? t('wf.input.default', { name: p.name, value: p.default }) : p.name,
  );
  return t('wf.inputs', { list: list.join(', ') });
}

/** The next_steps links (answer links are listed per answer). */
function linkWords(t: T, ls: readonly Link[]): string {
  return ls.map((l) => (l.how === 'if' ? t('wf.then.if', { name: l.to }) : l.to)).join(', ');
}

function answerWords(t: T, as: readonly AnswerRoute[]): string {
  // One answer may start several steps, which then run together; the words keep each answer's own steps. A guarded
  // target runs only if its condition holds, so "together" names only the unguarded ones.
  const one = (a: AnswerRoute) => {
    const plain = a.to.filter((id) => !a.guarded?.includes(id));
    const sure = plain.length > 1 ? t('wf.answerTogether', { list: plain.join(', ') }) : plain.join('');
    const to = [sure, ...(a.guarded ?? []).map((name) => t('wf.then.if', { name }))].filter(Boolean).join(', ');
    return t('wf.answer', { title: a.title || t('wf.answerUntitled'), to });
  };
  return as.map(one).join(' · ');
}

/** A step's next_steps links are plain from the rows when none carries a condition and the rows show them: one link
 *  to the one step of the next row, or the next row is this step's own fan-out. */
function plain(step: Step, ls: readonly Link[], next: GraphRow | undefined): boolean {
  if (!ls.length) return true;
  if (ls.some((l) => l.how !== 'always')) return false;
  if (next?.from === step.id && next.steps.length === ls.length) return true;
  return ls.length === 1 && next?.kind === 'single' && next.steps[0]!.id === ls[0]!.to;
}

/** The kind badge: the kind in words (with the agent's, tool's or workflow's name) and what it means. */
function kindStatus(t: T, step: Step): ItemProps['status'] {
  const { kind, name } = stepKind(step);
  if (kind === null) return name ? { tone: 'neutral', label: name } : undefined;
  const label = kind !== 'bash' && name ? t(`wf.kind.${kind}.named`, { name }) : t(`wf.kind.${kind}`);
  return { tone: 'neutral', label, tip: t(`wf.kindTip.${kind}`) };
}

/** What the row says about how its steps run: together, or after one step. A row of steps led to from different steps
 *  says nothing: it is a layout grouping (each sits below every step that leads forward to it), not a point in a run. */
function rowWords(t: T, row: GraphRow, marks: ReadonlyMap<string, string>): string {
  if (row.steps.length < 2) return '';
  if (row.kind === 'parallel') return t('wf.parallelMark', { list: row.steps.map((x) => marks.get(x.id) ?? x.id).join(', ') });
  if (row.kind === 'after') return t('wf.after', { from: row.from! });
  return '';
}

interface StepPlace {
  row?: GraphRow;
  next?: GraphRow;
}

/** One step as a list row: mark, id, kind badge, its line and the row's words, and where it leads as facts. */
function stepItem(t: T, step: Step, g: Graph, marks: ReadonlyMap<string, string>, place: StepPlace, answers?: readonly AnswerRoute[]): ItemProps {
  const ls = (g.then.get(step.id) ?? []).filter((l) => l.how !== 'answer');
  const back = g.back.get(step.id) ?? [];
  const details = [
    ...(answers && answers.length > 0 ? [{ label: t('wf.fact.answers'), value: answerWords(t, answers) }] : []),
    ...(ls.length > 0 && !plain(step, ls, place.next) ? [{ label: t('wf.fact.then'), value: linkWords(t, ls) }] : []),
    ...(back.length > 0 ? [{ label: t('wf.fact.loops'), value: back.join(', ') }] : []),
  ];
  const second = [place.row ? rowWords(t, place.row, marks) : '', step.readOnly ? t('wf.readOnly') : ''].filter(Boolean).join(' · ');
  const lines = [step.explanation, second].filter(Boolean);
  const mark = marks.get(step.id);
  return {
    id: step.id,
    title: step.id,
    mono: true,
    ...(mark !== undefined ? { mark } : {}),
    ...(lines.length === 2 ? { meta: [lines[0]!, lines[1]!] as const } : lines.length === 1 ? { meta: [lines[0]!] as const } : {}),
    status: kindStatus(t, step),
    ...(details.length ? { details } : {}),
  };
}

/** The steps read: loading while the answer routes are read; a failed read still shows the steps (its band says why). */
const stepsState = (d: DetailRead): SectionState => (d.state === 'loading' ? { kind: 'loading', rows: 4 } : { kind: 'ready' });

/** The detail of one listed workflow. `computer` names the computer in sentences; `runs` is the page's read of the
 *  runs, and `chatHref` links a run to its chat. */
export function WorkflowDetail({ workflow: w, readAt, computer, runs, chatHref, onCopy }: { workflow: Workflow; readAt?: number; computer: string; runs: RunsRead; chatHref?: ChatHref; onCopy?: (name: string) => void }) {
  const t = useStrings(strings);
  const d = useWorkflowDetail({ name: w.name, realm: w.realm });
  if (d.state === 'paused')
    return (
      <EmptyState
        icon="pause"
        title={t('wf.paused.title', { computer })}
        body={t('wf.paused.body')}
        action={
          <Button variant="secondary" onPress={d.recheck}>
            {t('wf.paused.check')}
          </Button>
        }
      />
    );
  // Keyed by the workflow, so its source stores follow it (kept ones come back with it, Source.tsx).
  return <WorkflowShown key={`${w.realm ?? ''}/${w.name}`} w={w} readAt={readAt} onCopy={onCopy} d={d} computer={computer} runs={runs} chatHref={chatHref} />;
}

function WorkflowShown({ w, readAt, onCopy, d, computer, runs, chatHref }: { w: Workflow; readAt?: number; onCopy?: (name: string) => void; d: DetailRead; computer: string; runs: RunsRead; chatHref?: ChatHref }) {
  const t = useStrings(strings);
  const ts = useStrings(sourceStrings);
  const hiddenCap = useWorkflowHiddenCap();
  const src = useWorkflowSource(w, { hiddenCap, readAt });
  const tr = useStrings(runStrings);
  // The realm the workflow was listed in, else the page's (aiRealm.ts: under All realms the computer's own).
  const shown = useAiRealm().realm;
  const runRealm = w.realm ?? (isRealmOrGlobal(shown) ? shown : null);
  // The realm the drawer opened for, kept until it closes (null: closed).
  const [running, setRunning] = useState<string | null>(null);
  const own = useSourceActions(src, onCopy);
  const actions = own && runRealm !== null ? { ...own, menu: [{ id: 'wf-run', label: tr('run.menu'), opens: true, onAction: () => setRunning(runRealm) }, ...(own.menu ?? [])] } : own;
  const answers: Answers | undefined = d.state === 'ready' ? d.answers : undefined;
  const g = graphOf(w, answers);
  const marks = stepMarks(g);
  const state = stepsState(d);
  const items = g.rows.flatMap((row, i) => row.steps.map((x) => stepItem(t, x, g, marks, { row, next: g.rows[i + 1] }, answers?.get(x.id))));
  const side = (steps: readonly Step[]) => steps.map((x) => stepItem(t, x, g, marks, {}, answers?.get(x.id)));
  const settings = [
    ...(w.timeoutSec !== null ? [{ label: t('wf.timeout'), value: t('wf.timeoutValue', { time: duration(t, w.timeoutSec) }) }] : []),
    ...(w.maxConcurrency !== null ? [{ label: t('wf.concurrency'), value: t('wf.concurrencyValue', { count: w.maxConcurrency }) }] : []),
  ];
  const meta = [w.summary, t('wf.steps', { count: w.stepCount }), inputWords(t, w.params)].filter(Boolean).join(' · ');
  return (
    <>
      <DetailHeader
        title={w.name}
        status={
          <>
            <Tag tip={t(`wf.originTip.${w.origin}`)}>{t(`wf.originTag.${w.origin}`)}</Tag>
            {src.hidden && <Tag tip={t('wf.hiddenTip')}>{t('wf.hidden')}</Tag>}
          </>
        }
        meta={meta}
        actions={actions ? <ActionBar label={t('wf.actions', { name: w.name })} {...actions} /> : undefined}
      />
      <DetailBody>
        <SectionGroup firstUse={{ title: t('wf.firstUse.title'), body: t('wf.firstUse.body') }}>
          <AnatomySection
            id="wf-steps"
            title={t('wf.section.steps')}
            info={t('wf.stepsInfo')}
            state={state}
            notices={
              d.state === 'failed' ? (
                <Band
                  tone="warn"
                  size="table"
                  error={d.error}
                  actions={
                    <Button size="sm" busy={d.retrying} onPress={d.retry}>
                      {t('wf.retry')}
                    </Button>
                  }
                >
                  {t('wf.detailFailed')}
                </Band>
              ) : undefined
            }
          >
            <ItemList label={t('wf.steps', { count: w.stepCount })} items={items} />
          </AnatomySection>
          <RunsSection workflow={w.name} realm={w.realm} runs={runs} chatHref={chatHref} />
          {settings.length > 0 && (
            <AnatomySection id="wf-settings" title={t('wf.settings')} state={{ kind: 'ready' }}>
              <Facts items={settings} columns={1} />
            </AnatomySection>
          )}
          <AnatomySection id="wf-source" title={ts('title')}>
            <WorkflowSource source={src} computer={computer} />
          </AnatomySection>
          {g.unreachable.length > 0 && (
            <AnatomySection id="wf-unreachable" title={t('wf.unreachable.title')} state={state}>
              <ItemList label={t('wf.unreachable.title')} items={side(g.unreachable)} />
            </AnatomySection>
          )}
          {g.other.length > 0 && (
            <AnatomySection id="wf-other" title={t('wf.other.title')} state={state}>
              <ItemList label={t('wf.other.title')} items={side(g.other)} />
            </AnatomySection>
          )}
        </SectionGroup>
      </DetailBody>
      {running !== null ? <RunForm workflow={w} realm={running} computer={computer} chatHref={chatHref} onClose={() => setRunning(null)} /> : null}
    </>
  );
}

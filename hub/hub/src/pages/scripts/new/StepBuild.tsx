// Step 3 of the AI way, "Build it". An attempt n runs at its own place
// (attemptPath) on the bound computer through the draft's BuildApi; the progress list follows the attempt's session frames
// (replay, then the stream from the replay's cursor) and is display only: the answer decides. Only a readable, usable
// answer is "written"; a lost or unreadable end is "can't tell yet" with Check again (C9). A late answer of an older
// attempt never replaces newer code, and the last usable code stays the draft's until a newer one is usable.
import { AnatomySection, Band, ConfirmDialog, Disclosure, CodeEditor, InlineActions, ItemList, Meter, Verdict, VerdictMark, useNow, useStrings } from '@kit';
import { useBuildProgress } from './StepBuild.hooks';
export { useBuild, useBuildProgress } from './StepBuild.hooks';
export type { Fix, UseBuild } from './StepBuild.hooks';
import type { UseBuild } from './StepBuild.hooks';
import { useState } from 'react';
import { SLOW_MS } from './StepBuild.pure';
export { SLOW_MS, refusedOf, buildOf, forgetRepairs } from './StepBuild.pure';
export type { Build, RefusedWhy } from './StepBuild.pure';
import type { Binding } from '../data';
import strings from '../strings.en.json';
import { askNoteKey, askNoteVars } from '../parts/useAsk';
import { useBuildRun } from './record';
import { elapsed, words } from './progress';
import s from '../parts/parts.module.css';
import f from './Flow.module.css';

export interface StepBuildProps {
  b: Binding | null;
  draftId: string;
  computer: string;
  description: string;
  api: UseBuild;
  code: string;
  /** The person changed the built code: Build again asks once before replacing it. */
  codeEdited: boolean;
  onWriteMyself: () => void;
}

export function StepBuild(p: StepBuildProps) {
  const t = useStrings(strings);
  const { build } = p.api;
  const n = 'n' in build ? build.n : 0;
  const running = build.k === 'running' || build.k === 'stopping' || build.k === 'starting';
  // The step's head says "Building" only while a build runs or is about to; once it ended the plate below says how.
  const building = running || build.k === 'idle';
  const r = useBuildRun(p.draftId, n);
  const progress = useBuildProgress(p.b, r, running);
  const now = useNow(running);
  const [askEdited, setAskEdited] = useState(false);
  // Stopped, words gets no clock: a retry line left on screen shows the stated wait, not a count that moves on re-render.
  const view = words(progress, { computer: p.computer, ...(running ? { now } : {}), ...(r ? { phase: r.phase } : {}) });
  const took = r ? elapsed(r.sentAt, now) : null;
  const tr = (w: { key: string; vars?: Record<string, string | number> }) => t(w.key as never, w.vars as never);

  // How the build ended is one calm Verdict, the step's top plate. The one
  // coloured phrase is a broken end only (failed, no usable script); an end it cannot tell, a stop, a refusal or nothing sent
  // is never coloured (C9). Its one muted line is the reason, or that the answer came before the stop.
  const label = t('flow.built.verdict');
  let verdict: React.ReactNode = null;
  // A written script: the assistant's summary and the code follow the plate, before the call rows (what you got, then how).
  if (build.k === 'ready') {
    verdict = (
      <>
        <Verdict label={label} {...(build.beforeStop ? { next: t('flow.built.finishedFirst') } : {})}>{t('flow.built.ready')}</Verdict>
        {build.summary ? <p className={f.lead}>{build.summary}</p> : null}
        <Disclosure title={t('flow.built.seeCode')}>
          <CodeEditor label={t('new.code')} value={p.code} onChange={() => undefined} readOnly rows={12} lang="ts" className={s.editor} />
        </Disclosure>
      </>
    );
  } else if (build.k === 'no_script') verdict = <Verdict label={label} {...(build.why !== 'none' ? { next: t(`ai.err.${build.why}` as never) } : {})}><VerdictMark tone="danger">{t('flow.built.noScript')}</VerdictMark></Verdict>;
  else if (build.k === 'failed') verdict = <Verdict label={label} next={t(askNoteKey(build.code) as never, askNoteVars(build.code) as never)}><VerdictMark tone="danger">{t('flow.built.failed')}</VerdictMark></Verdict>;
  else if (build.k === 'stopped') verdict = <Verdict label={label}>{t('flow.built.stopped')}</Verdict>;
  else if (build.k === 'unknown') verdict = <Verdict label={label}>{t(build.stop ? 'flow.built.stopUnknown' : 'flow.built.unknown', { computer: p.computer })}</Verdict>;
  else if (build.k === 'not_sent') verdict = <Verdict label={label}>{t('flow.built.notSent')}</Verdict>;
  else if (build.k === 'refused') verdict = <Verdict label={label}>{t(`flow.built.refused.${build.why}` as never)}</Verdict>;
  // Running: the elapsed time in the plate's head and, under it, a bar that claims no amount (still under reduced motion).
  else if (build.k === 'running' || build.k === 'starting') {
    verdict = (
      <>
        <Verdict label={label} {...(took ? { count: tr(took) } : {})}>
          {t('flow.built.running')}
        </Verdict>
        <Meter indeterminate size="fill" label={t('flow.built.running')} />
      </>
    );
  }

  return (
    // The step's heading takes focus on arrival (the wizard's first heading: the step has no field).
    <AnatomySection id="new-build" title={building ? t('flow.built.title') : t('flow.step.build')} {...(building ? { description: t('flow.built.lead', { computer: p.computer }) } : {})}>
      {verdict}
      {running || progress.rows.length > 0 ? (
        <div className={f.group}>
          {/* One polite live region: the current line only, never the whole list again. */}
          <p className={f.fact} role="status" aria-live="polite">{build.k === 'stopping' ? t('flow.built.stopping') : view.line ? tr(view.line) : null}{/* one-line live hint: the build's current step */}</p>
          {view.partial ? <p className={f.note}>{t('flow.build.partial')}</p> : null}
          {view.rows.length > 0 ? (
            // One line per call in a kit ItemList, never the rail's two-column grid. The row's words say
            // what became of the call (a check: it ran, never that it passed; the error icon: it failed); no row opens.
            // A kit Track has no failed state (a done node reads "Done" with a check), so the rows use an ItemList.
            <ItemList label={t('flow.built.done')} items={view.rows.map((row) => ({ id: row.id, title: tr(row), leading: row.ok ? ('check' as const) : ('error' as const) }))} />
          ) : null}
          {running && r && now - r.sentAt > SLOW_MS ? <p className={f.note}>{t('flow.built.slow')}</p> : null}
        </div>
      ) : null}
      {askEdited ? <Band tone="warn" size="table" /* noDetails: building again replaces edited code; asked once, nothing was sent */>{t('flow.check.replaceEdited')}</Band> : null}
      {/* The build's one control row follows its state and never folds: Stop while it runs, Check again
          when its outcome is unknown, Build (again) and Write it myself after it ends. */}
      <InlineActions
        size="md"
        label={t('flow.built.actions')}
        actions={[
          ...(build.k === 'running' ? [{ id: 'stop', label: t('flow.built.stop'), onPress: () => void p.api.stop() }] : []),
          ...(build.k === 'unknown' ? [{ id: 'check-again', label: t('flow.built.checkAgain'), onPress: () => void p.api.checkAgain() }] : []),
          ...(['no_script', 'failed', 'stopped', 'not_sent', 'unknown', 'refused', 'ready', 'idle'].includes(build.k)
            ? [{ id: 'build', label: t(build.k === 'idle' ? 'flow.where.build' : 'flow.built.again'), onPress: () => { if (p.codeEdited && build.k !== 'idle' && !askEdited) { setAskEdited(true); return; } setAskEdited(false); void p.api.run(); } }]
            : []),
          ...(build.k === 'no_script' || build.k === 'failed' ? [{ id: 'write-myself', label: t('flow.built.writeMyself'), onPress: p.onWriteMyself }] : []),
        ]}
      />
      <ConfirmDialog
        overlayId="scripts-new-build-replace"
        isOpen={p.api.askReplace}
        onOpenChange={(o) => { if (!o) p.api.cancelReplace(); }}
        title={t('flow.built.replaceTitle')}
        body={t('flow.built.replaceBody')}
        confirmLabel={t('flow.built.replaceGo')}
        cancelLabel={t('flow.built.replaceStay')}
        onConfirm={() => void p.api.confirmReplace()}
      />
    </AnatomySection>
  );
}

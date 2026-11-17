// The Programs source: a program's recent output as one snapshot (never timed, never live), in a
// code block with "Find in output" (a plain substring, client-side: the snapshot is all there is).
import { programChoices } from '../pickers';
import { Button, EmptyState, SegmentedControl, NumberField, ProgramPicker, Skeleton, useBusyMark } from '@kit';
import { Fragment, useMemo, useRef } from 'react';
import type { ProgramsState } from '../controller';
import { findLines } from '../logic';
import s from './Logs.module.css';
import { shortClock, type T } from './words';

export interface ProgramOutputProps {
  t: T;
  state: ProgramsState | null;
  channel: 'stdout' | 'stderr';
  port: number | null;
  find: string;
  onProgram: (id: string) => void;
  onChannel: (c: 'stdout' | 'stderr') => void;
  onPort: (p: number) => void;
  onRefresh: () => void;
  onExplain: (lines: string[], name: string) => void;
}

function Marked({ line, q }: { line: string; q: string }) {
  if (!q) return <>{line}</>;
  const low = line.toLowerCase(), at: number[] = [];
  for (let i = low.indexOf(q); i >= 0; i = low.indexOf(q, i + q.length)) at.push(i);
  if (!at.length) return <>{line}</>;
  const out: React.ReactNode[] = [];
  let last = 0;
  at.forEach((i, n) => {
    out.push(line.slice(last, i), <mark key={n} className={s.mark}>{line.slice(i, i + q.length)}</mark>);
    last = i + q.length;
  });
  out.push(line.slice(last));
  return <>{out.map((x, i) => <Fragment key={i}>{x}</Fragment>)}</>;
}

export function ProgramOutput({ t, state, channel, port, find, onProgram, onChannel, onPort, onRefresh, onExplain }: ProgramOutputProps) {
  const cur = state && state.current;
  const q = find.trim().toLowerCase();
  const snap = state && state.snap;
  const lines = useMemo(() => {
    if (!snap || !('text' in snap)) return [];
    const all = snap.text ? snap.text.split('\n') : [];
    if (all.length && all[all.length - 1] === '') all.pop();
    return findLines(all, q);
  }, [snap, q]);
  // The e2e search proofs' settle hook: the root is marked while the snapshot loads.
  const root = useRef<HTMLDivElement>(null);
  useBusyMark(root, !snap || 'busy' in snap);
  if (!state || !cur) return <Skeleton variant="detail" immediate />;
  return (
    <div className={s.prog} ref={root}>
      <div className={s.progBar}>
        <ProgramPicker label={t('prog.pick')} programs={programChoices(state.list, t)} value={cur.id} onChange={onProgram} />
        {/* A port is an identifier, not a quantity: never grouped ("8081", not "8,081"). */}
        {cur.range && <NumberField label={t('prog.port')} value={port ?? cur.range.start} minValue={cur.range.start} maxValue={cur.range.end} formatOptions={{ useGrouping: false, maximumFractionDigits: 0 }} onChange={(v) => { if (Number.isFinite(v)) onPort(v); }} />}
        <SegmentedControl label={t('prog.channel')} value={channel} onChange={onChannel} items={[{ id: 'stdout', label: t('prog.out') }, { id: 'stderr', label: t('prog.err') }]} />
        <Button variant="secondary" icon="reload" onPress={onRefresh}>{t('act.refresh')}</Button>
        <Button variant="secondary" icon="sparkle" isDisabled={!lines.length} disabledReason={!snap || 'busy' in snap ? t('act.explainWait') : t('act.explainEmpty')} onPress={() => onExplain(lines, cur.name)}>{t('act.explain')}</Button>
      </div>
      <p className={s.one}>{t('prog.notTimed')}</p>
      {!snap || 'busy' in snap ? <Skeleton variant="detail" immediate />
        : 'big' in snap ? <EmptyState icon="warn" title={t('prog.tooBig')} size="sm" />
        : !lines.length ? <EmptyState icon="logs" title={q ? t('st.noMatch') : t('prog.empty')} size="sm" />
        : (
          <>
            <p className={s.one} aria-live="polite">{t('prog.asOf', { time: shortClock(snap.at) })}</p>
            {/* A scrolling output must be reachable by keyboard. */}
            {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
            <pre className={s.out} /* reason: a program's own output lines with find marks, not code or JSON: no language to colour */ tabIndex={0} aria-label={t('prog.title')}>{lines.map((l, i) => <div key={i}><Marked line={l} q={q} /></div>)}</pre>
          </>
        )}
    </div>
  );
}

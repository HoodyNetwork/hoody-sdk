// "Stop everything in realm X…", for Rules & safety's gear menu. A confirm, then the
// result of the sweep (kit/agent/stop.ts) where the person can read it and decide what is next.
//
// What it says is only what the agent answered: the headline counts per-item outcomes ("may still be running" is a
// failed item), `complete` is never shown as "everything stopped", failures stay listed even when the call was
// complete, and a lost answer reads as unknown. Loops are paused, not deleted. The count in the confirm is an
// estimate the host supplies.
import { useState, useSyncExternalStore } from 'react';
import { Button } from '../controls/Button';
import { ConfirmDialog } from '../overlays/Dialog';
import { Band } from '../states/Band';
import { useStrings } from '../strings';
import { MAX_PAGES, type StopRun, type StopView } from './stop';
import strings from './StopAll.strings.en.json';
import s from './StopAll.module.css';

export function useStopView(run: StopRun): StopView {
  return useSyncExternalStore(run.subscribe, run.view, run.view);
}

export interface StopAllProps {
  run: StopRun;
  /** The realm's name as the person knows it, and the computer's. */
  realm: string;
  computer: string;
  /** What looks to be running now, if known: shown in the confirm as an estimate. */
  estimate?: number | null;
}

export interface StopAllConfirmProps extends StopAllProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

/** The confirm, for a host whose own menu item opens it ("Stop everything in realm Work…"). Confirming starts a fresh sweep. */
export function StopAllConfirm({ run, realm, computer, estimate, isOpen, onOpenChange }: StopAllConfirmProps) {
  const t = useStrings(strings);
  return (
    <ConfirmDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={t('stop.title', { realm })}
      confirmLabel={t('stop.confirm')}
      body={
        <>
          <p>{t('stop.body', { realm, computer })}</p>
          {typeof estimate === 'number' && estimate >= 0 && <p>{t('stop.estimate', { count: estimate })}</p>}
        </>
      }
      onConfirm={() => { onOpenChange(false); void run.start(); }}
    />
  );
}

/** A button with its confirm, for a host that has no menu of its own. The realm is named in the confirm. */
export function StopAllButton(p: StopAllProps) {
  const t = useStrings(strings);
  const v = useStopView(p.run);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button tone="danger" icon="stop" isDisabled={v.phase === 'running'} onPress={() => setOpen(true)}>{t('stop.open')}</Button>
      <StopAllConfirm {...p} isOpen={open} onOpenChange={setOpen} />
    </>
  );
}

/** The sweep's result; nothing before the first sweep. */
export function StopAllResult({ run, realm }: Pick<StopAllProps, 'run' | 'realm'>) {
  const t = useStrings(strings);
  const v = useStopView(run);
  if (v.phase === 'idle') return null;
  if (v.phase === 'running' && v.pages === 0) return <p className={s.note} role="status">{t('stop.running')}</p>;
  if (v.phase === 'refused' && v.pages === 0) {
    return (
      <div className={s.stack}>
        <Band tone="warn" icon="warn">{v.error?.code ? t('stop.refused', { code: v.error.code }) : t('stop.refusedNoCode')}</Band>
        <div className={s.actions}><Button variant="secondary" onPress={() => void run.start()}>{t('stop.again')}</Button></div>
      </div>
    );
  }
  const failed = v.items.filter((i) => i.outcome === 'failed' || i.outcome === 'unknown');
  return (
    <div className={s.stack} aria-label={realm}>
      {v.phase === 'unsure' && <Band tone="warn" icon="warn">{t('stop.unsure')}</Band>}
      {v.phase === 'refused' && <Band tone="warn" icon="warn">{v.error?.code ? t('stop.refusedLater', { code: v.error.code }) : t('stop.refusedLaterNoCode')}</Band>}
      {v.pages > 0 && (
        <>
          <p className={s.head} role="status">
            {v.nothingNew ? t('stop.nothingNew') : t('stop.headline', { stopped: v.counts.stopped, already: v.counts.alreadyDone, failed: v.counts.failed })}
          </p>
          <p className={s.note}>{v.complete ? t('stop.reached') : t('stop.partial')}{v.pages > 1 ? ` ${t('stop.pages', { count: v.pages, max: MAX_PAGES })}` : ''}{!v.complete && v.pages >= MAX_PAGES ? ` ${t('stop.capped', { max: MAX_PAGES })}` : ''}</p>
        </>
      )}
      {failed.length > 0 && (
        <div>
          <p className={s.head}>{t('stop.failedTitle')}</p>
          <ul className={s.list}>
            {failed.map((i) => <li key={`${i.kind}/${i.id}`}>{i.detail ? t('stop.failedWhy', { kind: i.kind, id: i.id, detail: i.detail }) : t('stop.failedOne', { kind: i.kind, id: i.id })}</li>)}
          </ul>
        </div>
      )}
      {v.started.length > 0 && <p className={s.note}>{t('stop.started', { count: v.started.length })}</p>}
      {v.behind.length > 0 && <p className={s.note}>{t('stop.behind', { count: v.behind.length })}</p>}
      {v.notCovered.length > 0 && (
        <div>
          <p className={s.head}>{t('stop.notCoveredTitle')}</p>
          <ul className={s.list}>
            {v.notCovered.map((n) => <li key={n.kind}>{n.count !== undefined ? t('stop.notCoveredCount', { kind: n.kind, count: n.count, reason: n.reason }) : t('stop.notCoveredWhy', { kind: n.kind, reason: n.reason })}</li>)}
          </ul>
        </div>
      )}
      {(v.canContinue || v.again) && v.phase !== 'running' && (
        <div className={s.actions}>
          {v.canContinue && <Button variant="secondary" onPress={() => void run.next()}>{t('stop.continue')}</Button>}
          {v.again && <Button variant="secondary" onPress={() => void run.start()}>{t('stop.again')}</Button>}
        </div>
      )}
    </div>
  );
}

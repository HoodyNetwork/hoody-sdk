// What sits between the toolbar and the list: the spike band, the problem strip, the notes (partial
// data, Live state) and the state boxes that explain a list that cannot be shown, each with the
// one fix beside it. Nothing here suggests loosening a computer's access rules.
import { servedHubUrl } from '@core';
import { ActionMenu, Band, Button, EmptyState, ErrorState, IconButton, TextButton, formatNumber, openOutside } from '@kit';
import { useState } from 'react';
import type { Snapshot } from '../controller';
import { errKey, liveFiltered, waitText, type ErrState } from '../logic';
import type * as R from '../rules';
import s from './Logs.module.css';
import { asTx, shortClock, type T } from './words';

export function SpikeBand({ t, snap, onAround }: { t: T; snap: Snapshot; onAround: (ms: number) => void }) {
  const sp = snap.spike;
  if (!sp) return null;
  return (
    <Band size="table" tone="warn" /* noDetails: a burst of log lines, not a failed request */ actions={<Button size="sm" variant="secondary" onPress={() => onAround(sp.ms)}>{t('act.around')}</Button>}>
      {t('spike', { time: shortClock(sp.ms), n: formatNumber(sp.count) })}
    </Band>
  );
}

export interface StripProps {
  t: T;
  groups: R.Groups;
  closed: boolean;
  onToggle: (closed: boolean) => void;
  onGroup: (g: R.ProblemGroup) => void;
  onAround: (g: R.ProblemGroup) => void;
  onExplain: (g: R.ProblemGroup) => void;
}

const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

export function ProblemStrip({ t, groups, closed, onToggle, onGroup, onAround, onExplain }: StripProps) {
  if (!groups.groups.length) return null;
  const top = groups.groups.slice(0, 5);
  return (
    <div className={s.strip}>
      {/* The question is the strip's heading, on its own line (the sampled-read note ends that line); the chips are one
          group under it, from the list's start edge, so a wrapped row starts where the first one does. */}
      <div className={s.stripHead}>
        <TextButton onPress={() => onToggle(!closed)} aria-expanded={!closed}>
          {closed ? t('kinds', { count: groups.groups.length, n: String(groups.groups.length) }) + ' ▸' : t('g.title') + ' ▾'}
        </TextButton>
        {!closed && !groups.exact && <span className={s.one}>{t('g.sample', { read: formatNumber(groups.read), total: formatNumber(groups.total) })}</span>}
      </div>
      {!closed && (
        <div className={s.chips}>
          {top.map((g) => {
            const out = g.cls === '5xx' ? 'failed' : 'problem';
            const label = g.program ? cap(g.program) : t('row.web');
            return (
              <span key={g.key} className={s.chipGroup}>
                <button type="button" className={s.chipMain} onClick={() => onGroup(g)}>
                  <b>{t(`out.${out}`)}</b>
                  <span className={s.groupMeta}>{t('times', { count: g.count, n: formatNumber(g.count) })}</span>
                  <span className={s.groupMeta}>{label}</span>
                </button>
                <ActionMenu
                  label={t('act.more')}
                  // The 24 px trigger fits the 30 px chip; on a coarse pointer the chip grows to its press height (--xs-press-h).
                  trigger={<IconButton icon="dots" label={t('act.more')} size="xs" variant="secondary" more />}
                  items={[
                    { id: 'around', label: t('act.around'), onAction: () => onAround(g) },
                    { id: 'explain', label: t('act.explain'), icon: 'sparkle', onAction: () => onExplain(g) },
                  ]}
                />
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Notes({ t, snap, onRetry, onResume, onNewest, onVisits, onAgentUrl }: { t: T; snap: Snapshot; onRetry: () => void; onResume: () => void; onNewest: () => void; onVisits: () => void; onAgentUrl?: string | null }) {
  const items: { key: string; tone: 'warn' | 'info'; text: string; action?: { label: string; run: () => void } }[] = [];
  const served = snap.err?.code === 'servedOnly' ? servedHubUrl(snap.err.route ?? '/logs') : '';
  if (snap.err && snap.err.code !== 'scriptUpdate' && snap.items.some((x) => x.kind !== 'div')) {
    // servedOnly: the records open in the served Hub (one button there), so no Try again.
    items.push(snap.err.code === 'servedOnly'
      ? { key: 'err', tone: 'info', text: t('st.servedOnly'), ...(served ? { action: { label: t('act.servedHub'), run: () => { openOutside(served); } } } : {}) }
      // Private: trying again changes nothing; the computer's own Agent app shows them (as the list's own state says).
      : snap.err.code === 'private'
        ? { key: 'err', tone: 'warn', text: t(errKey(snap.err.code) as never) + ' ' + t('st.restShown'), ...(onAgentUrl ? { action: { label: t('act.agent'), run: () => { openOutside(onAgentUrl); } } } : {}) }
        // Rows are kept here, so a failed read says only part could be read, and an update is needed for all of the logs.
        : { key: 'err', tone: 'warn', text: t((errKey(snap.err.code) === 'st.failed' ? 'st.failedSome' : snap.err.code === 'update' ? 'st.updateSome' : errKey(snap.err.code)) as never), action: { label: t('act.retry'), run: onRetry } });
  }
  if (snap.note) items.push({ key: 'note', tone: 'warn', text: t(snap.note as never) });
  if (snap.tooBig) items.push({ key: 'big', tone: 'warn', text: t('st.tooLarge') });
  if (snap.chgFailed) items.push({ key: 'chg', tone: 'warn', text: t('st.partChanges'), action: { label: t('act.retry'), run: onRetry } });
  if (snap.skippedChanges) items.push({ key: 'skip', tone: 'info', text: t('st.skipChanges') });
  if (snap.liveOn) items.push({ key: 'live', tone: 'info', text: t(liveFiltered(snap.v) ? 'live.partial' : 'live.on') });
  if (snap.held) items.push({ key: 'held', tone: 'info', text: t('live.held'), action: { label: t('act.newest'), run: onNewest } });
  if (snap.liveNote && snap.liveNote !== 'private') items.push({ key: 'ln', tone: 'info', text: t(`live.${snap.liveNote}`), action: { label: t('act.resume'), run: onResume } });
  if (snap.asOf) items.push({ key: 'asof', tone: 'warn', text: t('live.asOf', { time: shortClock(snap.asOf) }) });
  if (snap.err?.code === 'scriptUpdate') items.push({ key: 'ex4', tone: 'warn', text: t('lbl.scripts_need_update'), action: { label: t('act.visits'), run: onVisits } });
  if (!items.length) return null;
  return (
    <div className={s.notes}>
      {items.map((n) => (
        <Band key={n.key} size="table" tone={n.tone === 'info' ? 'neutral' : 'warn'} /* noDetails: notes on partial data and Live; the failed changes read keeps only that it failed (controller chgFailed) */ actions={n.action ? <Button size="sm" variant="secondary" onPress={n.action.run}>{n.action.label}</Button> : undefined}>
          {n.text}
        </Band>
      ))}
    </div>
  );
}

/** The list area when it cannot show rows: what happened, and the one thing to do about it. */
export function StateBox({ t, err, onRetry, onHome, onAgentUrl, onScripts, tooLong }: {
  t: T; err: ErrState; onRetry: () => void; onHome?: (() => void) | undefined; onAgentUrl: string | null; onScripts?: (() => void) | undefined; tooLong?: boolean;
}) {
  const [why, setWhy] = useState(false);
  const c = err.code;
  const wait = waitText(err.retryAfterMs, asTx(t));
  if (c === 'stopped') return <EmptyState icon="computer" title={t('st.stopped')} action={onHome ? <Button variant="primary" onPress={onHome}>{t('act.computers')}</Button> : undefined} />;
  if (c === 'private' || c === 'blocked' || c === 'servedOnly') {
    // servedOnly: the records open in the served Hub, on this view and computer (one button there); its reason always shows.
    const served = c === 'servedOnly' ? servedHubUrl(err.route ?? '/logs') : '';
    const open = served || onAgentUrl;
    return (
      <EmptyState
        icon={c === 'servedOnly' ? 'info' : 'lock'}
        title={t(c === 'private' ? 'st.private' : c === 'blocked' ? 'st.blocked' : 'st.servedOnly')}
        body={c === 'servedOnly' || why ? t(c === 'private' ? 'st.privateWhy' : c === 'blocked' ? 'st.blockedWhy' : 'st.servedOnlyWhy') : undefined}
        action={open ? <Button variant="primary" onPress={() => openOutside(open)}>{t(served ? 'act.servedHub' : 'act.agent')}</Button> : undefined}
        secondary={c === 'servedOnly' ? undefined : <TextButton onPress={() => setWhy(!why)} aria-expanded={why}>{t('st.why')}</TextButton>}
      />
    );
  }
  if (c === 'scriptPick') return <EmptyState icon="scripts" title={t('sc.pick')} action={onScripts ? <Button variant="primary" onPress={onScripts}>{t('act.scripts')}</Button> : undefined} />;
  if (c === 'noPrograms') return <EmptyState icon="programs" title={t('st.noPrograms')} />;
  if (c === 'offline' || c === 'update' || c === 'tooLong' || tooLong) return <EmptyState icon="info" title={t(errKey(c) as never)} action={c === 'update' || c === 'offline' ? <Button variant="secondary" onPress={onRetry}>{t('act.retry')}</Button> : undefined} />;
  return <ErrorState title={t(errKey(c) as never)} {...(wait ? { body: t('st.retryIn', { when: wait }) } : {})} onRetry={onRetry} />;
}

// The writes' outcomes at the top of the page. A held change is core's: one pending banner per send core
// holds (from this page, an earlier visit, a reload or another tab) with Check again (a fresh `me`; only a proof frees
// it) and the kit's warned Stop watching. It never says failed and never offers to send again. A definite refusal is
// a note with its words; banned, forbidden and anything unmapped take the kit's own words.
import { OutcomeBanner } from '@kit';
import type { HeldRow } from '@core';
import type { Said, Write } from '../data';
import type { T } from './types';

const codeOf = (row: HeldRow): string => {
  const c = (row.identity as { code?: unknown } | null)?.code;
  return typeof c === 'string' ? c : '';
};

export function HeldBanners({ t, join, create, release }: { t: T; join: Write<Record<string, never>>; create: Write<{ code: string }>; release: Write<{ code: string }> }) {
  return (
    <>
      {join.held.map((row) => (
        <OutcomeBanner key={row.hold} kind="pending" title={t('held.join')} onCheck={() => void join.check()} checking={join.checking} onDismiss={() => void join.stopWatching(row)}
          /* noDetails: core's held send, which may have gone through; a hold outlives the page (reload, other tab) and keeps no rejection, and Check again reads the real state */
        />
      ))}
      {create.held.map((row) => (
        <OutcomeBanner key={row.hold} kind="pending" title={t('held.create', { code: codeOf(row) })} onCheck={() => void create.check()} checking={create.checking} onDismiss={() => void create.stopWatching(row)}
          /* noDetails: core's held send, which may have gone through; a hold outlives the page (reload, other tab) and keeps no rejection, and Check again reads the real state */
        />
      ))}
      {release.held.map((row) => (
        <OutcomeBanner key={row.hold} kind="pending" title={t('held.release', { code: codeOf(row) })} onCheck={() => void release.check()} checking={release.checking} onDismiss={() => void release.stopWatching(row)}
          /* noDetails: core's held send, which may have gone through; a hold outlives the page (reload, other tab) and keeps no rejection, and Check again reads the real state */
        />
      ))}
    </>
  );
}

/** The last write's note, with the rejection's facts under Details. A held outcome has none of its own: core's banner
 *  above says it. */
export function NoteBanner({ t, said, onClose }: { t: T; said: Said | null; onClose: () => void }) {
  const note = said?.note;
  if (!said || !note || note.kind === 'held') return null;
  if (note.kind === 'kit') return <OutcomeBanner kind={note.outcome} error={said.error} onDismiss={onClose} />;
  // Another change of the code may have gone through: nothing was sent.
  return <OutcomeBanner kind={note.k === 'change.checkFirst' ? 'not_sent' : 'failed'} body={note.v ? t(note.k, note.v) : t(note.k)} error={said.error} onDismiss={onClose} />;
}

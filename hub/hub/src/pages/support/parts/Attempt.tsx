// One held send of the Support page: the kit's pending banner with its three fixed lines, Check again (reads only: a
// possible match is a hint shown in the banner and settles nothing) and the kit's warned Stop tracking. It never says
// failed and never offers to send again.
import { LinkButton, OutcomeBanner, useStrings } from '@kit';
export { answerOwed } from './Attempt.pure';
import type { HeldAttempt } from '@core';
import { useState } from 'react';
import { checkAgain, draftOf, stopTracking, type CheckHint, type Draft } from '../data';
import { links } from '../links';
import strings from '../strings.en.json';

const clock = (ms: number | string): string => new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/** `onStopped` gets the draft of an attempt this banner has just stopped tracking: the box or drawer takes it as its own
 *  text, so what the locked fields showed stays in them once they unlock. */
export function AttemptBanner({ held, onStopped }: { held: HeldAttempt; onStopped?: (draft: Draft | undefined) => void }) {
  const t = useStrings(strings);
  const [checking, setChecking] = useState(false);
  const [hint, setHint] = useState<CheckHint | null>(null);
  const check = async () => {
    setChecking(true);
    try {
      setHint(await checkAgain(held));
    } finally {
      setChecking(false);
    }
  };
  // After a Check again its result is a line of its own under the line saying what Check again does (both stay, and
  // "what we know" too, since a result settles nothing); the kit reads a new result aloud. A possible match adds one
  // link beside the banner's own buttons.
  const found = !hint
    ? null
    : hint.kind === 'match'
      ? t('send.match', { time: clock(hint.at) })
      : hint.kind === 'none'
        ? t('send.none', { time: clock(hint.checkedAt) })
        : hint.kind === 'noDraft'
          ? t('send.noDraft', { time: clock(hint.checkedAt) })
          : t('send.readFailed', { time: clock(hint.checkedAt) });
  return (
    <OutcomeBanner
      kind="pending"
      known={t('send.known')}
      checkLine={t('send.checkLine')}
      result={found}
      stopLine={t('send.stopLine')}
      onCheck={() => void check()}
      checking={checking}
      actions={hint?.kind === 'match' ? <LinkButton size="sm" href={links.ticket(hint.ticket)}>{t('send.matchLink')}</LinkButton> : undefined}
      onDismiss={() => {
        const draft = draftOf(held.id);
        if (stopTracking(held)) onStopped?.(draft);
      }}
      /* noDetails: a held attempt is read from storage (another tab, a reload); no rejection travels with it */
    />
  );
}

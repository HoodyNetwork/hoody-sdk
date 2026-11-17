// HeldBand: a change that may have gone through, as one warn Band with Check again (reads only) and a warned Stop
// tracking of exactly the hold it shows. It is the kit's pending look and words: OutcomeBanner's pending state draws
// the same two controls and asks the same question. Use it for a held write a page tracks; use OutcomeBanner or the
// Outcome line for the result of an action the person just took. `readOnly`: another sender's hold, which only that sender can settle: no Stop
// tracking, and the band says where it is settled. The question keeps the Stop tracking the band had when it was
// opened (never a later send that took its place). Words default to the kit's; a page may name its own question.
import { useState } from 'react';
import { Button } from '../controls/Button';
import { ConfirmDialog } from '../overlays/Dialog';
import { useStrings } from '../strings';
import { Band } from './Band';
import strings from '../strings.en.json';
import bs from './Band.module.css';

export interface HeldBandProps {
  /** The sentence naming the change that may have gone through. */
  text: string;
  /** Another sender's hold: only Check again, and the `elsewhere` sentence after the text. */
  readOnly: boolean;
  /** Reads the state again; the button is busy until it settles. */
  onCheck: () => unknown;
  /** Stops tracking exactly this hold, after the question. */
  onDismiss: () => unknown;
  /** The question's overlay name (layout.overlayId), the page's own. */
  overlayId: string;
  /** The question's words, where a page has its own (each defaults to the kit's). */
  dismissTitle?: string;
  dismissBody?: string;
  dismissGo?: string;
  /** The read-only sentence (defaults to the kit's); null: none, the text says it all. */
  elsewhere?: string | null;
  /** What the last check said while the hold stays ("Not in the list yet."): one polite line under the text, kept until
   *  the page passes another. */
  note?: string;
  /** The send of this hold is still out: both actions stay focusable, say so, and do nothing until it answers. */
  inFlight?: boolean;
}

export function HeldBand({ text, readOnly, onCheck, onDismiss, overlayId, dismissTitle, dismissBody, dismissGo, elsewhere, note, inFlight = false }: HeldBandProps) {
  const t = useStrings(strings);
  const [checking, setChecking] = useState(false);
  const [asked, setAsked] = useState<{ go: () => unknown } | null>(null);
  const wait = inFlight ? { isDisabled: true, disabledReason: t('held.inFlight') } : {};
  return (
    <>
      <Band
        tone="warn"
        size="table"
        held
        /* noDetails: a held send has no answer, so no rejection to show; the text names the change */
        actions={
          <>
            <Button size="sm" busy={checking} {...wait} onPress={() => { setChecking(true); void Promise.resolve(onCheck()).finally(() => setChecking(false)); }}>{t('outcome.pending.check')}</Button>
            {readOnly ? null : <Button size="sm" variant="ghost" {...wait} onPress={() => setAsked({ go: onDismiss })}>{t('held.dismiss')}</Button>}
          </>
        }
      >
        {readOnly && elsewhere !== null ? `${text} ${elsewhere ?? t('held.elsewhere')}` : text}
        {note ? (
          <span className={bs.heldNote} aria-live="polite" data-held-note="">
            {note}
          </span>
        ) : null}
      </Band>
      <ConfirmDialog
        overlayId={overlayId}
        isOpen={asked !== null && !readOnly}
        onOpenChange={(o) => !o && setAsked(null)}
        title={dismissTitle ?? t('held.dismissTitle')}
        body={dismissBody ?? t('held.dismissBody')}
        confirmLabel={dismissGo ?? t('held.dismissGo')}
        onConfirm={() => {
          const go = asked?.go;
          setAsked(null);
          if (go) void go();
        }}
      />
    </>
  );
}

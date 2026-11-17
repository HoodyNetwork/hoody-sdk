// HeldBand in the terminal: the warn Band in its one-line look, held (the pending mark ◷), with Check again (busy
// until the read settles) and, for the page's own hold, Stop tracking, which asks first. `readOnly`: another sender's
// hold, so no Stop tracking and the sentence saying where it is settled. The last check's note is a muted line under
// the band. The question keeps the Stop tracking the band had when it was opened.
import { useState } from 'react';
import type * as Web from './HeldBand';
import { Button } from '../controls/Button';
import { ConfirmDialog } from '../overlays/Dialog';
import { useStrings } from '../strings';
import strings from '../strings.en.json';
import { Box, Text } from '../../term/prim';
import { Band } from './Band';

export type { HeldBandProps } from './HeldBand';

export const HeldBand: typeof Web.HeldBand = ({ text, readOnly, onCheck, onDismiss, overlayId, dismissTitle, dismissBody, dismissGo, elsewhere, note, inFlight = false }) => {
  const t = useStrings(strings);
  const [checking, setChecking] = useState(false);
  const [asked, setAsked] = useState<{ go: () => unknown } | null>(null);
  const wait = inFlight ? { isDisabled: true, disabledReason: t('held.inFlight') } : {};
  return (
    <Box dir="column" shrink={0}>
      <Band
        tone="warn"
        size="table"
        held
        actions={
          <>
            <Button size="sm" busy={checking} {...wait} onPress={() => { setChecking(true); void Promise.resolve(onCheck()).finally(() => setChecking(false)); }}>{t('outcome.pending.check')}</Button>
            {readOnly ? null : <Button size="sm" variant="ghost" {...wait} onPress={() => setAsked({ go: onDismiss })}>{t('held.dismiss')}</Button>}
          </>
        }
      >
        {readOnly && elsewhere !== null ? `${text} ${elsewhere ?? t('held.elsewhere')}` : text}
      </Band>
      {/* Under the sentence, past the band's mark. */}
      {note ? <Box dir="row" shrink={0} pad={{ left: 2 }}><Text colour="muted">{note}</Text></Box> : null}
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
    </Box>
  );
};

// Forget a change that may have gone through (C9): the person's explicit release of the hold, behind a warning
// that the next press is a new one. Shown only while the hold exists and no read has proved it, and only with the
// hold(s) shown: the press frees exactly those, so a hold sent again meanwhile stays (and the note says nothing
// was dismissed). No hold, no Forget.
import { ConfirmDialog, TextButton, useStrings } from '@kit';
import { useState } from 'react';
import strings from '../strings.en.json';

/** `what`: Mark all read's hold (forgetAll.*) or one notice's mark-read (forgetOne.*). `holds` are the holds shown
 *  now; the ones in view when the dialog opens are the ones `onForget` gets (true: something was freed). Its "nothing was
 *  dismissed" line is about one notice's hold, so a caller that shows it for different notices keys it by the notice. */
export function ForgetHold({ what, holds, onForget, overlayId }: { what: 'forgetAll' | 'forgetOne'; holds: readonly string[]; onForget: (holds: readonly string[]) => Promise<boolean>; overlayId: string }) {
  const t = useStrings(strings);
  const [shown, setShown] = useState<readonly string[] | null>(null);
  const [nothing, setNothing] = useState(false);
  if (holds.length === 0 && shown === null && !nothing) return null;
  return (
    <>
      {holds.length > 0 && (
        <TextButton
          onPress={() => {
            setNothing(false);
            setShown(holds);
          }}
        >
          {t(`${what}.button`)}
        </TextButton>
      )}
      <span aria-live="polite">{nothing ? t('forget.nothing') : null}</span>
      <ConfirmDialog
        isOpen={shown !== null}
        onOpenChange={(o) => !o && setShown(null)}
        overlayId={overlayId}
        title={t(`${what}.title`)}
        body={t(`${what}.body`)}
        confirmLabel={t(`${what}.confirm`)}
        onConfirm={() => {
          const mine = shown ?? [];
          setShown(null);
          void onForget(mine).then((freed) => setNothing(!freed));
        }}
      />
    </>
  );
}

export function ForgetReadAll({ holds, onForget, overlayId }: { holds: readonly string[]; onForget: (holds: readonly string[]) => Promise<boolean>; overlayId: string }) {
  return <ForgetHold what="forgetAll" holds={holds} onForget={onForget} overlayId={overlayId} />;
}

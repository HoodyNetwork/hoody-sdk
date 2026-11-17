// Start a new purchase beside a reservation whose outcome is unknown. The kept
// request may still go through, so a new one could charge twice: only the person's explicit confirm, in a danger
// dialog that says so, abandons the kept request (this browser never sends its key again) and opens a fresh review.
import { hostEnv } from '@core';
import { Button, ConfirmDialog, useStrings } from '@kit';
import { useRef, useState } from 'react';
import strings from '../strings.en.json';

export function ReserveNew<C>({
  prepare,
  onStart,
  busy = false,
  size,
  termOf,
}: {
  /** Read once when the dialog opens: the kept request (or, with none kept, the remembered reservation) it is shown for,
   *  which the confirm must still find. */
  prepare: () => C;
  /** The person confirmed: drop that request or reservation and start again. */
  onStart: (shown: C) => void;
  busy?: boolean;
  /** `sm` in an outcome banner's actions. */
  size?: 'sm';
  /** The term (days) of a reservation of another term than the drawer's that `prepare` returned: the confirm names it.
   *  Null: the general body. */
  termOf?: (shown: C) => string | null;
}) {
  const t = useStrings(strings);
  const [shown, setShown] = useState<{ v: C } | null>(null);
  // The drawer this button sits in: a confirm unmounts this button once the view turns into a fresh review, so focus
  // returns into the drawer (its consent box when the review has drawn by then), never the page title behind it.
  const host = useRef<HTMLElement | null>(null);
  const term = shown && termOf ? termOf(shown.v) : null;
  return (
    <>
      <Button
        variant="secondary"
        size={size}
        isDisabled={busy}
        onPress={(e) => {
          // A terminal press has no DOM node behind it (HTMLElement is a trap there, and the dialog never opened): its
          // dialog layer gives the focus back to the drawer by itself.
          host.current = hostEnv().browserPage === true && e.target instanceof HTMLElement ? e.target.closest<HTMLElement>('[role="dialog"]') : null;
          setShown({ v: prepare() });
        }}
      >
        {t('mkt.recoverNew')}
      </Button>
      <ConfirmDialog
        overlayId="billing-checkout-reserve-new"
        isOpen={shown !== null}
        onOpenChange={(open) => {
          if (!open) setShown(null);
        }}
        tone="danger"
        returnFocus={() => host.current?.querySelector<HTMLElement>('input[type="checkbox"]:not(:disabled)') ?? host.current}
        title={t('mkt.reserveNewTitle')}
        body={term ? t('mkt.reserveNewBodyTerm', { days: term }) : t('mkt.reserveNewBody')}
        confirmLabel={t('mkt.reserveNewConfirm')}
        onConfirm={() => {
          const sh = shown;
          setShown(null);
          if (sh) onStart(sh.v);
        }}
      />
    </>
  );
}

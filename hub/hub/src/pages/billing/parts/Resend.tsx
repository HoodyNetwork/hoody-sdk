// The deliberate resend of a held money request. Check again only reads; this is the one way
// to send the kept request again. It is never automatic and never the default button: the place that draws it says what it
// may charge (resendSentence), the ConfirmDialog says it again, and only that dialog's confirm sends.
import { Button, ConfirmDialog, useStrings } from '@kit';
import { useState } from 'react';
import { cents, usd } from '../logic';
import strings from '../strings.en.json';
import type { T } from './Bits';

/** What the resend may cost, as one sentence: a purchase's ceiling, or a top-up's payment page. */
export function resendSentence(t: T, what: { maxCents: number | null; place?: string | null } | { topUpAmount: string | null }): string {
  if ('topUpAmount' in what)
    return what.topUpAmount ? t('co.resendTopUpHint', { amount: usd(what.topUpAmount) }) : t('co.resendTopUpHintNoAmount');
  // A kept plan purchase that named a location is sent again for that same location: the sentence says where.
  if (what.place) return what.maxCents != null ? t('co.resendHintIn', { max: cents(what.maxCents), place: what.place }) : t('co.resendHintInNoMax', { place: what.place });
  return what.maxCents != null ? t('co.resendHint', { max: cents(what.maxCents) }) : t('co.resendHintNoMax');
}

/** The charge sentence as text, for the place that draws the control to show beside it. */
export function ResendHint({ what }: { what: Parameters<typeof resendSentence>[1] }) {
  const t = useStrings(strings);
  return <>{resendSentence(t, what)}</>;
}

/** The Retry-After seconds left before Resend may send, as a sentence for the line under the outcome banner (never
 *  inside its role="alert": it ticks every second). */
export function RetryIn({ s: secs }: { s: number }) {
  const t = useStrings(strings);
  return <>{t('mkt.retryIn', { s: secs })}</>;
}

export function Resend<C>({
  overlayId,
  prepare,
  chargeOf,
  onSend,
  busy = false,
  countdown = 0,
  countdownInLabel = true,
  size,
}: {
  /** Names the dialog's overlay: one literal per place the control is drawn. */
  overlayId: string;
  /** Read once when the dialog opens: the kept request it is shown for, which the confirm must still find. */
  prepare: () => C;
  /** What that snapshot may charge: the dialog states it from the snapshot it sends, never from a separate read. */
  chargeOf: (shown: C) => Parameters<typeof resendSentence>[1];
  onSend: (shown: C) => void;
  busy?: boolean;
  /** A reservation's Retry-After: the button waits it out and says so. */
  countdown?: number;
  /** false: the label never ticks (the button sits in a role="alert" banner, which would be read again each second);
   *  the caller shows the seconds outside the alert. */
  countdownInLabel?: boolean;
  size?: 'sm';
}) {
  const t = useStrings(strings);
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<{ v: C } | null>(null);
  const button = (
    <Button
      variant="secondary"
      size={size}
      isDisabled={busy || countdown > 0}
      onPress={() => {
        setShown({ v: prepare() });
        setOpen(true);
      }}
    >
      {countdown > 0 && countdownInLabel ? t('mkt.retryIn', { s: countdown }) : t('co.resend')}
    </Button>
  );
  return (
    <>
      {button}
      <ConfirmDialog
        overlayId={overlayId}
        isOpen={open}
        onOpenChange={setOpen}
        title={t('co.resendTitle')}
        body={shown ? resendSentence(t, chargeOf(shown.v)) : ''}
        confirmLabel={t('co.resendConfirm')}
        onConfirm={() => {
          setOpen(false);
          if (shown) onSend(shown.v);
        }}
      />
    </>
  );
}

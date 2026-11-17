import { Button, ConfirmDialog } from '@kit';
import { useState } from 'react';
import type { Held } from '../data';
import type { T } from './Bits';

/**
 * The person's way out of a held change that may have gone through. It reads which sends core holds now (their holds) when
 * pressed, asks first, then frees exactly those. The next press is a new send, so the question says to check the list before
 * trying again. When core holds nothing any more there is nothing to free: the page only reads again.
 */
export function HoldDismiss({
  t,
  find,
  onDismiss,
}: {
  t: T;
  /** The sends core holds for this setting now. */
  find: () => Promise<readonly Held[]>;
  /** Frees the holds the person was asked about (possibly none), then reads again. */
  onDismiss: (held: readonly Held[]) => void;
}) {
  const [held, setHeld] = useState<readonly Held[] | null>(null);
  const press = () => {
    void find().then((h) => (h.length > 0 ? setHeld(h) : onDismiss(h)));
  };
  return (
    <>
      <Button size="sm" variant="ghost" onPress={press}>
        {t('hold.dismiss')}
      </Button>
      <ConfirmDialog
        overlayId="billing-hold-dismiss"
        isOpen={held !== null}
        onOpenChange={(open) => !open && setHeld(null)}
        title={t('hold.dismissTitle')}
        body={<p>{t('hold.dismissBody')}</p>}
        confirmLabel={t('hold.dismissConfirm')}
        tone="danger"
        onConfirm={() => {
          const shown = held ?? [];
          setHeld(null);
          onDismiss(shown);
        }}
      />
    </>
  );
}

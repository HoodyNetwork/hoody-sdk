// Small shared pieces of the bots page: a link chip, a disclosure, a provider mark, the status
// tones and the bridge from a Change to the kit's outcome shape.
export { STATUS_TONE, dialogOutcome, outcomeOf, useComputerGoes } from './Bits.pure';
import { Button, ConfirmDialog, DangerConfirm, DrawerCancel, TextButton, openOutside, useDrawer, useGo, usePageLink, useStrings } from '@kit';
import { hostEnv } from '@core';
import { useEffect, useId, type ReactNode } from 'react';
import { guideConnectTarget } from '../logic';
import strings from '../strings.en.json';
import s from './pane.module.css';

/** The footer of a create or edit drawer: an outcome line, the kit's guarded Cancel and the primary action. */
export function DrawerFooter({
  note,
  cancelLabel,
  submitLabel,
  onSubmit,
  busy,
  pending,
  isDisabled,
}: {
  note?: ReactNode;
  cancelLabel: string;
  submitLabel: string;
  onSubmit: () => void;
  busy?: boolean;
  /** The send's outcome is unknown: the drawer closes without asking to discard. */
  pending?: boolean;
  isDisabled?: boolean;
}) {
  const drawer = useDrawer();
  const report = drawer?.reportOutcome;
  const reporter = useId();
  useEffect(() => {
    report?.(reporter, { pending: pending === true, busy: busy === true });
  }, [report, reporter, pending, busy]);
  useEffect(() => (report ? () => report(reporter, null) : undefined), [report, reporter]);
  return (
    <div className={s.drawerFooter}>
      {note && <div className={s.drawerFooterNote}>{note}</div>}
      <div className={s.drawerFooterActions}>
        <DrawerCancel label={cancelLabel} />
        <Button variant="primary" busy={busy} isDisabled={isDisabled} onPress={onSubmit}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

/**
 * A typed-name confirm that goes off while the action's answer is unknown (`held`): the daemon takes no
 * Idempotency-Key for these, so another press would be a second real call. The same dialog stays up with
 * its "may have gone through" outcome and Check again; the button comes back only after a dismiss.
 */
export function HeldDangerConfirm({ held, confirmText, consequences, ...rest }: { held: boolean } & React.ComponentProps<typeof DangerConfirm>) {
  if (!held) return <DangerConfirm confirmText={confirmText} consequences={consequences} {...rest} />;
  return (
    <ConfirmDialog {...rest} tone="danger" confirmDisabled>
      {consequences && consequences.length > 0 && (
        <ul>
          {consequences.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
    </ConfirmDialog>
  );
}

/** A quiet link to the Guide's Bots section ("How to connect"): through the router where this load serves the Guide,
 *  nothing otherwise (there is no classic Guide). */
export function GuideConnectLink() {
  const t = useStrings(strings);
  const link = usePageLink('guide');
  const go = useGo();
  if (!link) return null;
  const target = guideConnectTarget(link);
  return <TextButton onPress={() => (link.kind === 'hub' ? go(target) : hostEnv().browserPage === true ? window.location.assign(target) : openOutside(target))}>{t('empty.connect')}</TextButton>;
}

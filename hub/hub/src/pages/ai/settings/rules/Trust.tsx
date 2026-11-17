// AI → Settings → Rules & safety → Hooks → Review and trust. The agent holds hooks it has not been
// told to trust and runs none of them. This dialog lists exactly what would run (each command, when, and on which computer) and
// the targets the agent cannot check, and trusting is a separate press: the reviewed set's hash goes to the agent (trustData.ts),
// never a later one. Focus starts on Cancel. A set with unverifiable targets needs a second, explicit tick.
import { Band, Checkbox, Dialog, Facts, useStrings } from '@kit';
import { useState } from 'react';
import type { Review, ReviewHook } from './trust';
import strings from './Trust.strings.en.json';
import s from './Trust.module.css';

export interface TrustDialogProps {
  review: Review;
  /** The shown computer's name for words. */
  computer: string;
  /** The acknowledgement is being sent. */
  busy: boolean;
  /** When a hook runs, in words (the Hooks section's own wording). */
  when: (h: ReviewHook) => string;
  onTrust: () => void;
  onClose: () => void;
}

export function TrustDialog({ review, computer, busy, when, onTrust, onClose }: TrustDialogProps) {
  const t = useStrings(strings);
  const risky = review.unverifiable.length > 0;
  const [agreed, setAgreed] = useState(false);
  // A command or target holding what a screen would hide or change is shown as written, marked; Trust waits for a tick.
  const [seen, setSeen] = useState(false);
  return (
    <Dialog
      isOpen
      onOpenChange={(o) => { if (!o) onClose(); }}
      overlayId="ai-hook-trust"
      size="lg"
      title={t('title')}
      body={t('body', { computer })}
      tone={risky ? 'danger' : 'default'}
      primaryLabel={risky ? t('confirmRisk') : t('confirm')}
      primaryDisabled={!review.complete || (risky && !agreed) || (review.hidden && !seen)}
      onPrimary={onTrust}
      busy={busy}
      initialFocus="cancel"
    >
      {review.hooks.length === 0 ? <Band>{t('none')}</Band> : (
        <div className={s.list}>
          <Facts
            columns={1}
            label={t('title')}
            items={review.hooks.map((h) => ({ label: h.off ? t('off', { when: when(h) }) : when(h), value: <span className={s.command}>{h.command}</span>, mono: true, wide: true }))}
          />
        </div>
      )}
      {review.hidden && review.complete && (
        <>
          <Band tone="warn" /* noDetails: a caution about the marked text above, not a failure */>{t('hidden')}</Band>
          <Checkbox label={t('hiddenSeen')} isSelected={seen} onChange={setSeen} />
        </>
      )}
      {risky && (
        <>
          <Band tone="warn" /* noDetails: a caution about the files and addresses listed below, not a failure */>{t('risk')}</Band>
          <div className={s.list}>
            <Facts columns={1} label={t('risk')} items={review.targets.map((x) => ({ label: t('target'), value: <span className={s.command}>{x}</span>, mono: true, wide: true }))} />
          </div>
          <Checkbox label={t('agree')} isSelected={agreed} onChange={setAgreed} />
        </>
      )}
      {!review.complete && <Band tone="warn" /* noDetails: the set is too long to show whole, not a failure with a rejection behind it */>{t('toolong')}</Band>}
      <Facts columns={1} items={[{ label: t('hash'), value: review.hash.slice(0, 12), mono: true, wide: true }]} />
    </Dialog>
  );
}

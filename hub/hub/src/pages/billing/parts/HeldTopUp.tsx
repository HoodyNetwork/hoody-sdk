// The top-up that may have gone through, kept on the page whatever drawer or dialog is open (C9: a hold stays visible
// until a fresh answer or a warned Dismiss). The band shows core's own record (useTopUpHeld: synchronous, owner-bound,
// announced on every change), so it is there from the first render and after every drawer closes, and no read of the page
// can show, hide or bring back a hold. A machine is mounted only to ACT (Check again, the confirmed resend, Dismiss): those are offered when
// the machine has restored the same record and core says no POST of it is out.
import { Button, ConfirmDialog } from '@kit';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type HeldTopUp, leaveTo, noteTopUpEnded, topUpEndedHere, type TopUpShown, useTopUp, useTopUpHeld } from '../data';
import { usd } from '../logic';
import type { Word } from '../types';
import { Band, type T, say } from './Bits';
import { Resend } from './Resend';
import s from './parts.module.css';

/** A machine that has not restored the record after this long is replaced by a new one (its late answer is ignored). */
const MACHINE_TIMEOUT_MS = 10_000;

/**
 * The slot. The band follows core's record. When the record leaves it without this tab having ended it (another tab
 * answered or forgot it), the person is told; this tab's own Dismiss, Forget or answered resend says nothing more.
 */
export function HeldTopUpSlot({ t, banned }: { t: T; banned: boolean }) {
  const { held, owner } = useTopUpHeld();
  const key = held?.key ?? null;
  const [resolved, setResolved] = useState(false);
  const was = useRef<{ owner: string | null; key: string } | null>(null);
  useEffect(() => {
    const prev = was.current;
    was.current = key ? { owner, key } : null;
    if (key) {
      setResolved(false);
      return;
    }
    // Not when another account is shown now, and not for a top-up this tab ended itself.
    if (prev && prev.owner === owner && !topUpEndedHere(prev.key)) setResolved(true);
  }, [key, owner]);
  return (
    <>
      {held && <HeldTopUpBand key={held.key} t={t} held={held} banned={banned} />}
      {resolved && !held && (
        <Band
          tone="warn"
          /* noDetails: another tab settled the top-up; this is a notice, not a rejection, so there is no error to show */
          dataAttr="topup-resolved"
          actions={
            <Button variant="ghost" size="sm" onPress={() => setResolved(false)}>
              {t('dismiss')}
            </Button>
          }
        >
          <strong>{t('top.resolvedTitle')}</strong> <span className={s.muted}>{t('top.resolved')}</span>
        </Band>
      )}
    </>
  );
}

/** One hold: its machine is replaced while it has not restored the record, so one stalled read never decides. */
function HeldTopUpBand({ t, held, banned }: { t: T; held: HeldTopUp; banned: boolean }) {
  const [epoch, setEpoch] = useState(0);
  const replace = useCallback(() => setEpoch((n) => n + 1), []);
  return <HeldTopUpActions key={epoch} t={t} held={held} banned={banned} onStalled={replace} />;
}

/**
 * Check again only reads: it sends nothing, and still unknown keeps the hold and says why. "Send the same
 * request again" asks first, then sends the stored request (same key, provider and amount), which opens a payment page.
 * Dismiss asks first, then core drops the record and sends nothing; it is refused while a send of the hold is out. All
 * three wait for the machine, and for core to say nothing is being sent. While the account is suspended (`banned`) the
 * resend is not drawn (it would open a payment page; the header's Add funds is off too); Check again and Dismiss stay.
 */
function HeldTopUpActions({ t, held, banned, onStalled }: { t: T; held: HeldTopUp; banned: boolean; onStalled: () => void }) {
  const topup = useTopUp();
  const [checking, setChecking] = useState(false);
  const [word, setWord] = useState<Word | null>(null);
  const [ask, setAsk] = useState(false);
  const [refused, setRefused] = useState(false);
  const restored = !topup.loading && topup.pending?.key === held.key;
  useEffect(() => {
    if (restored) return;
    const timer = setInterval(onStalled, MACHINE_TIMEOUT_MS);
    return () => clearInterval(timer);
  }, [restored, onStalled]);

  const sending = held.sending;
  const amount = usd(held.amount);
  // `shown`: the held top-up the resend dialog was opened for (only that one is sent, and only while its amount is
  // the one the band and the dialog stated).
  const run = async (send: boolean, shown?: TopUpShown | null) => {
    setChecking(true);
    setRefused(false);
    // A second press while this band's own resend is out is ignored: the first call's answer is the outcome, and only
    // it ends the check.
    let owner = true;
    try {
      const r = await (send ? topup.resend(shown && shown.amount === held.amount ? shown : null) : topup.checkAgain());
      if ('ignored' in r) {
        owner = false;
        return;
      }
      if (r.ok) {
        noteTopUpEnded(held.key);
        leaveTo(r.url);
      } else if (!r.resolved) setWord(r.word);
    } finally {
      if (owner) setChecking(false);
    }
  };
  return (
    <>
      <ConfirmDialog
        overlayId="billing-held-topup-forget"
        isOpen={ask}
        onOpenChange={setAsk}
        title={t('top.forgetTitle')}
        body={t('top.forgetBody')}
        confirmLabel={t('top.forgetConfirm')}
        tone="danger"
        onConfirm={() => {
          // Only after this confirm: core drops its held record and sends nothing. Refused (still being sent, another key): said.
          const ok = topup.forget?.() !== false;
          if (ok) noteTopUpEnded(held.key);
          setRefused(!ok);
          setAsk(false);
        }}
      />
      <Band
        tone="warn"
        /* noDetails: the outcome of the send is unknown, which is core's held record, not a rejection; Check again only looks (evidence, never the held request's own answer) */
        dataAttr="topup-unknown"
        outcome="pending"
        actions={
          <>
            <Button size="sm" icon="reload" busy={checking || !restored} isDisabled={sending || !restored} onPress={() => void run(false)}>
              {t('buy.checkAgain')}
            </Button>
            {!banned && (
              <Resend
                overlayId="billing-resend-held-topup"
                size="sm"
                chargeOf={(sh) => ({ topUpAmount: sh?.amount ?? null })}
                busy={checking || sending || !restored}
                prepare={(): TopUpShown | null => (topup.pending ? { key: topup.pending.key, method: topup.pending.method, amount: topup.pending.amount } : null)}
                onSend={(shown) => void run(true, shown)}
              />
            )}
            {topup.forget && (
              <Button variant="ghost" size="sm" isDisabled={checking || sending || !restored} onPress={() => setAsk(true)}>
                {t('hold.dismiss')}
              </Button>
            )}
          </>
        }
      >
        <strong>{amount === '—' ? t('band.topupTitle') : t('band.topupTitleAmount', { amount })}</strong>{' '}
        <span className={s.muted}>{sending ? t('band.sendingBody') : t('band.topupBody')}</span>
        {word && !sending && <span className={s.muted}> {say(t, word)}</span>}
        {refused && <span className={s.muted}> {t('band.forgetRefused')}</span>}
        {!held.persisted && <span className={s.muted}> {t('top.notSaved')}</span>}
      </Band>
    </>
  );
}

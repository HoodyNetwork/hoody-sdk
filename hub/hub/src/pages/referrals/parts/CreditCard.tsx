// Referral credit: Available is the one big amount (muted at 0.00 or none), then a kit Ledger whose rows are On hold,
// Reversed and Owed (Owed only above 0). Money is the API's string or a dash, never a guess. The next due day is the
// day in UTC, in On hold's note (null hides it, and so does a removed account: nothing is released while the account
// is removed, so no day is promised). The hold and refund hint with the hold FAQ answer shows whenever something is on
// hold or a date is sent, except for a removed account, which gets the waits line instead (credit.heldRemoved).
// Available takes the strip's whole row (narrow="rows": the card is under 600 px wide at every page width) and wraps
// rather than clip, so every digit stays readable. Withdrawal: a Creator gets Withdraw… in the section's actions, which
// opens an explainer that sends nothing; a Referrer gets one fact that says withdrawal is for Creators, with the
// withdrawal FAQ answer, and no button; a level the API did not name gets the same fact saying the level is not known
// (never "You're a Referrer"); a removed account gets neither.
import { AnatomySection, Facts, FaqLink, Ledger, RowNote, StatStrip, type LedgerRow } from '@kit';
import { commerceRules } from '@core';
import { useState } from 'react';
import { pageFaq } from '../faq';
import { above0, releaseDay, stateOf, type Me } from '../logic';
import s from './parts.module.css';
import type { T } from './types';
import { WithdrawInfo } from './WithdrawInfo';

export function CreditCard({ t, me }: { t: T; me: Me }) {
  const c = me.credit;
  const { byId } = pageFaq(t);
  const [withdraw, setWithdraw] = useState(false);
  const canAsk = stateOf(me) !== 'removed';
  const day = canAsk ? releaseDay(me.nextReleaseAt) : null;
  const creator = me.level === 'creator';
  // On hold's note: the due day as a line of its own (a row note, so tests and readers find it whole), then the hint
  // that stays visible under it (money clarity).
  const holdNote =
    day || above0(c.pending) ? (
      canAsk ? (
        <>
          {day && (
            <>
              <RowNote>{t('credit.release', { date: day })}</RowNote>
              <br />
            </>
          )}
          {t('credit.releaseNote')} <FaqLink item={byId.hold}>{t('credit.holdWhy')}</FaqLink>
        </>
      ) : (
        t('credit.heldRemoved')
      )
    ) : undefined;
  const rows: LedgerRow[] = [
    { id: 'pending', label: t('credit.pending'), amount: commerceRules.usdText(c.pending), ...(holdNote !== undefined ? { note: holdNote } : {}) },
    { id: 'reversed', label: t('credit.reversed'), amount: commerceRules.usdText(c.reversed) },
  ];
  if (above0(c.owed)) rows.push({ id: 'owed', label: t('credit.owed'), amount: commerceRules.usdText(c.owed), note: t('credit.owedNote') });
  return (
    <AnatomySection
      id="referral-credit"
      title={t('credit.title')}
      state={{ kind: 'ready' }}
      actions={canAsk && creator ? { secondary: [{ id: 'withdraw', label: t('withdraw.action'), opens: 'dialog', onPress: () => setWithdraw(true) }] } : undefined}
    >
      <StatStrip label={t('credit.title')} narrow="rows" items={[{ label: t('credit.available'), value: <span className={above0(c.available) ? s.bigMoney : `${s.bigMoney} ${s.muted}`}>{commerceRules.usdText(c.available)}</span>, detail: t('credit.spentFirst') }]} />
      <Ledger label={t('credit.ledger')} rows={rows} />
      {canAsk && !creator && (
        <Facts
          columns={1}
          items={[
            {
              label: t('withdraw.label'),
              value: (
                <>
                  {t(me.level === 'unknown' ? 'withdraw.lineUnknown' : 'withdraw.line')} <FaqLink item={byId.withdraw}>{t('withdraw.more')}</FaqLink>
                </>
              ),
            },
          ]}
        />
      )}
      {canAsk && creator && <WithdrawInfo t={t} me={me} isOpen={withdraw} onOpenChange={setWithdraw} />}
    </AnatomySection>
  );
}

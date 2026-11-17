// Referral credit in the terminal: the web card's words, amounts and rules (CreditCard.tsx), drawn with prims. Available is
// one bold amount (muted at 0.00 or none); On hold's note is the due day on a line of its own, then the hold hint with its
// FAQ link on the line under it (the web's line break is a column here). Withdrawal and the removed account read as on
// the web.
import { AnatomySection, Facts, FaqLink, Ledger, RowNote, StatStrip, type LedgerRow } from '@kit';
import { commerceRules } from '@core';
import { Box, Text } from '@term/prim';
import { useState } from 'react';
import { pageFaq } from '../faq';
import { above0, releaseDay, stateOf } from '../logic';
import type * as Web from './CreditCard';
import { WithdrawInfo } from './WithdrawInfo';

export const CreditCard: typeof Web.CreditCard = ({ t, me }) => {
  const c = me.credit;
  const { byId } = pageFaq(t);
  const [withdraw, setWithdraw] = useState(false);
  const canAsk = stateOf(me) !== 'removed';
  const day = canAsk ? releaseDay(me.nextReleaseAt) : null;
  const creator = me.level === 'creator';
  const holdNote =
    day || above0(c.pending) ? (
      canAsk ? (
        <Box dir="column" shrink={0}>
          {day && <RowNote>{t('credit.release', { date: day })}</RowNote>}
          <Box dir="row" wrap gap={1} shrink={0}>
            <Text colour="muted">{t('credit.releaseNote')}</Text>
            <FaqLink item={byId.hold}>{t('credit.holdWhy')}</FaqLink>
          </Box>
        </Box>
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
      <StatStrip
        label={t('credit.title')}
        narrow="rows"
        items={[{ label: t('credit.available'), value: <Text bold {...(above0(c.available) ? {} : { colour: 'muted' as const })}>{commerceRules.usdText(c.available)}</Text>, detail: t('credit.spentFirst') }]}
      />
      <Ledger label={t('credit.ledger')} rows={rows} />
      {canAsk && !creator && (
        <Facts
          columns={1}
          items={[
            {
              label: t('withdraw.label'),
              value: (
                <Box dir="row" wrap gap={1} shrink={0}>
                  <Text>{t(me.level === 'unknown' ? 'withdraw.lineUnknown' : 'withdraw.line')}</Text>
                  <FaqLink item={byId.withdraw}>{t('withdraw.more')}</FaqLink>
                </Box>
              ),
            },
          ]}
        />
      )}
      {canAsk && creator && <WithdrawInfo t={t} me={me} isOpen={withdraw} onOpenChange={setWithdraw} />}
    </AnatomySection>
  );
};

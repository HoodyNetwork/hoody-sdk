// The wallet band's Referral credit lines in the terminal: the sentence on its own (it wraps), then Referrals and
// "What these amounts are" on a row under it. On the web the links run on in the sentence; in cells a link is a
// pressable box that ends a text run, so the line could not wrap and was cut at 80 columns ("What these amounts are"
// lost).
import { FaqLink, TextButton, followPageLink, useGo, usePageLink } from '@kit';
import { Box, Text } from '@term/prim';
import { centsFromUsd, usd } from '../logic';
import { pageFaq } from '../faq';
import type * as Web from './ReferralLines';

export const ReferralLines: typeof Web.ReferralLines = ({ t, balance }) => {
  const referrals = usePageLink('referrals');
  const go = useGo();
  const above0 = (v: string | null) => (centsFromUsd(v) ?? 0) > 0;
  const credit = above0(balance.referral);
  const owed = above0(balance.owed);
  if (!credit && !owed) return null;
  const { byId } = pageFaq(t);
  const more = (
    <Box dir="row" wrap gapX={2} shrink={0}>
      {referrals && <TextButton onPress={() => followPageLink(referrals, go)}>{t('referralLink')}</TextButton>}
      <FaqLink item={byId.walletCredit}>{t('credit.more')}</FaqLink>
    </Box>
  );
  return (
    <Box dir="column" shrink={0}>
      {credit && <Text colour="muted">{t('referralLine', { amount: usd(balance.referral) })}</Text>}
      {owed && <Text colour="muted">{t('owedLine', { amount: usd(balance.owed) })}</Text>}
      {more}
    </Box>
  );
};

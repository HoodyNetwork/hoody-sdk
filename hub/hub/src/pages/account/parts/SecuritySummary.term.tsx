// The security checklist in the terminal: the same three lines and the same actions as the web. Each line keeps its mark in
// a fixed two-cell gutter on its first line (the text wraps under itself, never under the mark), and its button sits at
// the right end of that line, as on the web; one line per item, no blank rows between them. "Review" moves the settings page to its Sessions
// section through `?section=` (the terminal SettingsPage follows it; the web scrolls an element, which has no meaning here).
import type { ReactNode } from 'react';
import { Button, Icon, Skeleton, useSearchParam, useStrings } from '@kit';
import { Box, Text } from '@term/prim';
import { revealAnchor } from '../../../kit/layouts/termScroll';
import { useProfile, useSessions, useTwoFactor } from '../data';
import { otherActiveCount } from '../logic';
import strings from '../strings.en.json';
import { useMailAsk } from './mailAsk';
import type * as Web from './SecuritySummary';

function Line({ mark, text, action }: { mark: ReactNode; text: string; action?: ReactNode }) {
  return (
    <Box dir="row" align="start">
      <Box width={2} shrink={0}>{mark}</Box>
      <Box grow={1} shrink={1}><Text>{text}</Text></Box>
      {action ? <Box shrink={0} pad={{ left: 1 }}>{action}</Box> : null}
    </Box>
  );
}

export const SecuritySummary: typeof Web.SecuritySummary = ({ onOpen }) => {
  const t = useStrings(strings);
  const profile = useProfile();
  const twofa = useTwoFactor();
  const sessions = useSessions('active');
  const [, setSection] = useSearchParam('section');
  const verify = useMailAsk('verify');
  // While a read is out the region keeps its heading over the rows' skeleton, as the web's SubSection does.
  if (profile.isPending || twofa.isPending || sessions.isPending)
    return (
      <Box dir="column" sem={{ role: 'region', name: t('sum.railTitle') }}>
        <Text bold sem={{ role: 'heading', name: t('sum.railTitle') }}>{t('sum.railTitle')}</Text>
        <Skeleton variant="rows" rows={3} />
      </Box>
    );

  // A failed read is unknown, as on the web: never "not verified", and it offers Try again.
  const me = profile.error ? null : profile.data;
  const emailUnread = !me;
  const verified = me?.emailVerified === true;
  const tf = twofa.error ? null : twofa.data;
  const list = sessions.error ? null : sessions.data;
  const others = list ? otherActiveCount(list.sessions) : null;
  // The summary reads the first page of sessions only: with more pages its count is a floor, never the total.
  const more = list?.hasMore === true;
  // Not verified, as a profile that was read says it: the line offers the verification mail again, once, as the web's
  // (no action while it says a wait).
  const address = me && !verified ? me.email : '';

  return (
    <Box dir="column" sem={{ role: 'region', name: t('sum.railTitle') }}>
      <Text bold sem={{ role: 'heading', name: t('sum.railTitle') }}>{t('sum.railTitle')}</Text>
      <Line
        mark={<Icon name={verified ? 'check-circle' : 'warn'} tone={verified ? 'ok' : 'warn'} />}
        text={emailUnread ? t('sum.emailUnknown') : verified ? t('sum.emailOk') : (address !== '' ? (verify.short ?? verify.refused) : null) ?? t('sum.emailNo')}
        action={
          emailUnread ? (
            <Button size="sm" onPress={() => void profile.refetch()}>{t('sum.tryAgain')}</Button>
          ) : address !== '' && verify.canSend && !verify.busy && !verify.waiting ? (
            <Button size="sm" onPress={() => verify.send(address)}>{t('p.resend')}</Button>
          ) : undefined
        }
      />
      <Line
        mark={<Icon name={tf?.enabled ? 'check-circle' : 'warn'} tone={tf?.enabled ? 'ok' : 'warn'} />}
        // An account with no password has none that signs in: the line then says only that it is off (as the web's).
        text={t(tf === null || tf === undefined ? 'sum.twofaUnknown' : tf.enabled ? 'sum.twofaOn' : me?.hasPassword === false ? 'sum.twofaOffNoPassword' : 'sum.twofaOff')}
        action={
          tf === null || tf === undefined ? (
            <Button size="sm" onPress={() => void twofa.refetch()}>{t('sum.tryAgain')}</Button>
          ) : !tf.enabled && !tf.setupUnfinished ? (
            <Button size="sm" onPress={() => onOpen('setup')}>{t('2fa.turnOn')}</Button>
          ) : undefined
        }
      />
      <Line
        mark={<Icon name={others === null ? 'warn' : others === 0 && !more ? 'check-circle' : 'info'} tone={others === null ? 'warn' : others === 0 && !more ? 'ok' : 'muted'} />}
        text={others === null ? t('sum.sessionsUnknown') : t(more ? 'sum.sessionsMore' : 'sum.sessions', { count: others })}
        action={
          others === null ? (
            <Button size="sm" onPress={() => void sessions.refetch()}>{t('sum.tryAgain')}</Button>
          ) : others > 0 || more ? (
            // The address may already name the section (a second press after scrolling up): bring it up every time,
            // as the web scrolls to it on every press. 'hub-set-<id>' is the settings layout's section anchor.
            <Button size="sm" onPress={() => { setSection('sessions', { replace: true }); revealAnchor('hub-set-sessions'); }}>{t('sum.review')}</Button>
          ) : undefined
        }
      />
    </Box>
  );
};

// The security checklist in the summary rail: what is in good shape and what to do next, one action each.
// An unreadable status says so and offers Try again; it never reads as "off". The mark of a row is its icon's shape
// (a tick, a warning, a note), never a colour alone. An address that is not verified offers its verification mail.
import { ItemList, SubSection, scrollSettingsSection, useStrings, type ActionSpec, type ItemProps } from '@kit';
import { useProfile, useSessions, useTwoFactor } from '../data';
import { otherActiveCount } from '../logic';
import strings from '../strings.en.json';
import { useMailAsk } from './mailAsk';

export function SecuritySummary({ onOpen }: { onOpen: (sheet: 'setup') => void }) {
  const t = useStrings(strings);
  const profile = useProfile();
  const twofa = useTwoFactor();
  const sessions = useSessions('active');
  const verify = useMailAsk('verify');
  if (profile.isPending || twofa.isPending || sessions.isPending) return <SubSection title={t('sum.railTitle')} state={{ kind: 'loading', rows: 3 }} />;

  // A failed read is unknown: never "not verified", never "off".
  const me = profile.error ? null : profile.data;
  const emailUnread = !me;
  const verified = me?.emailVerified === true;
  const tf = twofa.error ? null : twofa.data;
  const list = sessions.error ? null : sessions.data;
  const others = list ? otherActiveCount(list.sessions) : null;
  // The summary reads the first page of sessions only: with more pages its count is a floor, never the total.
  const more = list?.hasMore === true;
  const review = () => scrollSettingsSection(document.querySelector<HTMLElement>('[data-section="sessions"]'), true);

  const unread = tf === null || tf === undefined;
  const twoStep: ActionSpec | null = unread
    ? { id: 'two-step-read', label: t('sum.tryAgain'), onPress: () => void twofa.refetch() }
    : !tf.enabled && !tf.setupUnfinished
      ? { id: 'two-step-on', label: t('2fa.turnOn'), opens: 'dialog', onPress: () => onOpen('setup') }
      : null;
  // Not verified, as a profile that was read says it: the line offers the verification mail again, once. After the
  // press the line is what the ask came to (where to look, or the wait), as on the email row. While it says a wait it
  // has no action: a press then is only refused again (the email row keeps its own, for after the wait).
  const address = me && !verified ? me.email : '';
  const emailAction: ActionSpec | null = emailUnread
    ? { id: 'email-read', label: t('sum.tryAgain'), onPress: () => void profile.refetch() }
    : address !== '' && verify.canSend && !verify.busy && !verify.waiting
      ? { id: 'email-verify', label: t('p.resend'), onPress: () => verify.send(address) }
      : null;
  const items: ItemProps[] = [
    {
      id: 'email',
      leading: verified ? 'check-circle' : 'warn',
      title: emailUnread ? t('sum.emailUnknown') : verified ? t('sum.emailOk') : (address !== '' ? (verify.short ?? verify.refused) : null) ?? t('sum.emailNo'),
      ...(emailAction ? { actions: { inline: [emailAction] as const } } : {}),
    },
    {
      id: 'two-step',
      leading: tf?.enabled ? 'check-circle' : 'warn',
      // An account with no password has none that signs in: the line then says only that it is off.
      title: t(unread ? 'sum.twofaUnknown' : tf.enabled ? 'sum.twofaOn' : me?.hasPassword === false ? 'sum.twofaOffNoPassword' : 'sum.twofaOff'),
      ...(twoStep ? { actions: { inline: [twoStep] as const } } : {}),
    },
    {
      id: 'sessions',
      leading: others === null ? 'warn' : others === 0 && !more ? 'check-circle' : 'info',
      title: others === null ? t('sum.sessionsUnknown') : t(more ? 'sum.sessionsMore' : 'sum.sessions', { count: others }),
      ...(others === null
        ? { actions: { inline: [{ id: 'sessions-read', label: t('sum.tryAgain'), onPress: () => void sessions.refetch() }] as const } }
        : others > 0 || more
          ? { actions: { inline: [{ id: 'sessions-review', label: t('sum.review'), onPress: review }] as const } }
          : {}),
    },
  ];

  return (
    <SubSection title={t('sum.railTitle')} state={{ kind: 'ready' }}>
      <ItemList label={t('sum.railTitle')} items={items} />
    </SubSection>
  );
}

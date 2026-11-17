// Password: one setting row and the one action. The change itself is a drawer. When a change may have gone
// through, the action is replaced by a line that opens the drawer's read-back. An account that has no password (a
// GitHub or Google sign-up, for one) cannot change one: its row offers the mail whose link sets the first password, and
// says where to look once Hoody took the request. Only a profile that says so counts: one that does not report it
// (an older API) or could not be read keeps Change password.
import { Button, StatusPill, useStrings, SettingRow } from '@kit';
import { useProfile } from '../data';
import strings from '../strings.en.json';
import { useOpLock } from './locks';
import { useMailAsk } from './mailAsk';

export function PasswordSection({ onOpen }: { onOpen: () => void }) {
  const t = useStrings(strings);
  const held = useOpLock('password') === 'pending';
  const me = useProfile().data;
  const mail = useMailAsk('reset');
  if (!held && me?.hasPassword === false && me.email !== '') {
    return (
      <SettingRow
        label={t('pw.row')}
        // The row's one sentence: why there is no password, then (once asked) where to look for the link.
        help={mail.sentTo !== null ? t('mail.sentReset', { email: mail.sentTo }) : mail.unsure ? t('mail.unsure') : t('pw.noneHelp')}
        outcome={mail.refused ? { kind: 'failed' } : undefined}
        // noDetails: the ask answers with a typed outcome only (too many asks, a fault); there is no rejection to show.
        detail={mail.refused ?? undefined}
        actions={
          mail.canSend ? (
            <Button busy={mail.busy} onPress={() => mail.send(me.email)}>
              {t('pw.set')}
            </Button>
          ) : undefined
        }
      >
        {mail.sentTo !== null ? <StatusPill tone="ok">{t('mail.pillSent')}</StatusPill> : mail.unsure ? <StatusPill tone="warn">{t('mail.pillUnsure')}</StatusPill> : null}
      </SettingRow>
    );
  }
  return (
    <SettingRow
      label={t('pw.row')}
      help={t('pw.rowHelp')}
      actions={
        held ? (
          <Button onPress={onOpen}>
            {t('check.again')}
          </Button>
        ) : (
          <Button onPress={onOpen}>{t('pw.change')}</Button>
        )
      }
    />
  );
}

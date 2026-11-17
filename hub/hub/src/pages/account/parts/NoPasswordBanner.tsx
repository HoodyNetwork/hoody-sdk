// An account with no password (a GitHub or Google sign-up, for one) cannot give the password a drawer asks for. The
// drawer (change password, change email, two-step set-up) then shows this in place of a form to fill in: why, and the
// mail whose link sets the first password. The action and its state are the password row's own ask (mailAsk), so a
// mail asked for anywhere on the page is never asked for again here.
import { Button, OutcomeBanner, useStrings } from '@kit';
import { useProfile } from '../data';
import strings from '../strings.en.json';
import { BannerSlot } from './BannerSlot';
import { useMailAsk } from './mailAsk';

/** Which drawer shows it: the sentence says what that drawer asks the password for. */
const BODY = { change: 'pw.noneBody', email: 'e.noPasswordBody', setup: '2fa.noPasswordBody' } as const;

export function NoPasswordBanner({ asks }: { asks: keyof typeof BODY }) {
  const t = useStrings(strings);
  const reset = useMailAsk('reset');
  const email = useProfile().data?.email ?? '';
  return (
    <BannerSlot>
      <OutcomeBanner
        kind="not_sent"
        title={t('e.noPasswordTitle')}
        // noDetails: nothing was refused here; the account has no password yet.
        body={[t(BODY[asks]), reset.said ?? reset.refused ?? ''].filter(Boolean).join(' ')}
        actions={
          email !== '' && reset.canSend ? (
            <Button size="sm" busy={reset.busy} onPress={() => reset.send(email)}>
              {t('pw.set')}
            </Button>
          ) : undefined
        }
      />
    </BannerSlot>
  );
}

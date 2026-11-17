// One ask for a mail to the account's own address (data.ts useAccountMail), in the words every place that shows it
// uses: the password row, the email row, the email drawer and the security checklist. The ask lives outside the
// render, so those places show the same state and a mail asked from one is never asked again from another.
import { useStrings } from '@kit';
import { useAccountMail, type MailKind } from '../data';
import { mailRefusalWords, maskEmail } from '../logic';
import strings from '../strings.en.json';

export interface MailAskView {
  /** A request is out. */
  busy: boolean;
  /** Whether the action shows: not once Hoody took the request (one mail per visit; a reload offers it again). */
  canSend: boolean;
  /** Where to look, or that no answer came back: the row's own sentence. Null when there is none. */
  said: string | null;
  /** The same in a few words, for a checklist line beside the row that says it in full. */
  short: string | null;
  /** The masked address of a taken ask (`said` is then its sentence), for a row that writes the sentence itself. */
  sentTo: string | null;
  /** No answer came back (`said` is then that sentence). */
  unsure: boolean;
  /** A definite refusal (too many asks with its wait, a framed page, a fault), in words. Null when there is none. */
  refused: string | null;
  /** The refusal is too many asks: a press before the wait is over is refused again. */
  waiting: boolean;
  send: (email: string) => void;
}

export function useMailAsk(kind: MailKind): MailAskView {
  const t = useStrings(strings);
  const { ask, send } = useAccountMail(kind);
  const words = mailRefusalWords(ask);
  return {
    busy: ask?.state === 'sending',
    // Not after a taken ask, and not after one whose outcome is not known: neither is asked for twice from here.
    canSend: ask?.state !== 'sent' && ask?.state !== 'unsure',
    said:
      ask?.state === 'sent' ? t(kind === 'reset' ? 'mail.sentReset' : 'mail.sentVerify', { email: maskEmail(ask.to) })
      : ask?.state === 'unsure' ? t('mail.unsure')
      : null,
    short: ask?.state === 'sent' ? t(kind === 'reset' ? 'mail.shortReset' : 'mail.shortVerify') : ask?.state === 'unsure' ? t('mail.shortUnsure') : null,
    sentTo: ask?.state === 'sent' ? maskEmail(ask.to) : null,
    unsure: ask?.state === 'unsure',
    refused: words === null ? null : words.key === 'err.tooManyWait' ? t(words.key, words.vars) : t(words.key),
    waiting: ask?.state === 'wait',
    send: (email) => void send(email),
  };
}

// A ticket's status pill and the thread's status line: Waiting for you (warn: the one
// status that asks something of the person; the accent stays for the primary button), Waiting for support (neutral),
// Closed (muted), Closed for good.
import { StatusPill, formatDate, useStrings, type Tone } from '@kit';
import { statusWord, type StatusWord, type Ticket } from '../logic';
import strings from '../strings.en.json';
import s from './parts.module.css';

const TONE: Record<StatusWord, Tone> = { waitingYou: 'warn', waitingSupport: 'neutral', closed: 'neutral', closedForGood: 'neutral' };

export function TicketStatus({ ticket }: { ticket: Ticket }) {
  const t = useStrings(strings);
  const w = statusWord(ticket);
  return (
    <StatusPill tone={TONE[w]} dot={w === 'waitingYou' || w === 'waitingSupport'}>
      {t(`status.${w}`)}
    </StatusPill>
  );
}

/** The line under the thread: what happens next. The message cap and closed for good are the thread's own states. */
export function StatusLine({ ticket }: { ticket: Ticket }) {
  const t = useStrings(strings);
  const w = statusWord(ticket);
  const text =
    w === 'waitingYou'
      ? t('thread.waitingYou')
      : w === 'waitingSupport'
        ? t('thread.waitingSupport')
        : w === 'closed'
          ? t('thread.closed', { date: ticket.closedAt ? formatDate(ticket.closedAt) : '' })
          : t('thread.closedForGood');
  return <p className={s.statusLine}>{text}</p>;
}

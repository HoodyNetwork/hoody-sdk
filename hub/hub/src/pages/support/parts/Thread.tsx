// One ticket's thread. Oldest message at the top; Show older reads the page
// before the oldest loaded seq. Each body is TEXT: a text node with white-space pre-wrap, http(s) addresses as kit
// ExtLinks and nothing else (never Markdown or HTML). The ⋯ menu holds Close ticket… (one confirm) and Copy ticket
// reference. A close is held like a send (data.ts): while one may have gone through (a lost answer here, a reload,
// another tab) the menu offers no Close and the thread shows the pending banner; Check again reads the ticket, and only
// a closed status (or the warned Stop tracking) frees it. While this tab's own close waits for its answer its dialog
// says busy instead (a thread mounted again, with no dialog, shows the banner). A support 503 refusal says why in its
// own words. A reply that may have gone through keeps its pending banner (Check again, Stop tracking) when the ticket
// then reads closed for good: the reply box that normally shows it is gone there, and the hold would have no way out.
import {
  Button,
  ConfirmDialog,
  DetailPage,
  EmptyState,
  ErrorState,
  NoAccessState,
  OutcomeBanner,
  Skeleton,
  StatusPill,
  autolink,
  formatDateTime,
  maskId,
  useStrings,
  type MenuEntry,
} from '@kit';
import { useState } from 'react';
import { closeLanded, closeLock, closeTicket, replyLock, stopTracking, useHeld, useThread, type CloseResult, type SendResult } from '../data';
import { categoryKey, closedForGood, noAccessOf, type Message, type Ticket } from '../logic';
import strings from '../strings.en.json';
import { AttemptBanner, answerOwed } from './Attempt';
import { ReplyBox, type ReplyEnd } from './ReplyBox';
import s from './parts.module.css';
import { TicketStatus } from './Status';
import { busyUntil, refusalWords } from './words';

const clock = (ms: number): string => new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
/** A refused close as the send words take it: its verdict and its wait. */
const sendOf = (r: Exclude<CloseResult, { outcome: 'done' }>): SendResult => ({ verdict: r.verdict ?? 'other', ...(r.retryAfterMs !== undefined ? { retryAfterMs: r.retryAfterMs } : {}) });

export function Thread({ id, onBack, onNewTicket }: { id: string; onBack: () => void; onNewTicket: (followUp?: Ticket) => void }) {
  const t = useStrings(strings);
  const th = useThread(id);
  const [end, setEnd] = useState<{ id: string; end: ReplyEnd } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [closing, setClosing] = useState<CloseResult | null>(null);
  // When a close refused busy may be sent again: taken at its answer, so the banner names that one time on every draw.
  const [closeTill, setCloseTill] = useState<number | undefined>(undefined);
  const [checking, setChecking] = useState(false);
  const [closeHint, setCloseHint] = useState<{ open: boolean; at: number } | null>(null);
  const [closingNow, setClosingNow] = useState(false);
  const heldClose = useHeld(closeLock(id))[0];
  const heldReplies = useHeld(replyLock(id));
  const ended = end?.id === id ? end.end : null;
  const ticket = th.ticket;

  const err = th.error as { code?: string | null; status?: number | null } | null;
  const no = err ? noAccessOf(err.code, err.status) : null;
  if (no) return <NoAccessState body={t(`access.${no}`)} />;
  const gone = !!err && (err.code === 'SUPPORT_TICKET_NOT_FOUND' || err.status === 404);
  // A first read that failed for another reason (the network, a busy server) is not absence: it says the ticket did
  // not load and offers Try again, never "not found" with only Back.
  if (!ticket && err && !gone) return <ErrorState title={t('thread.readFailed')} error={th.error} onRetry={() => void th.refetch()} secondary={<Button onPress={onBack}>{t('action.back')}</Button>} />;
  if (gone || !ticket) return th.isPending && !gone ? <Skeleton variant="detail" rows={6} /> : <EmptyState icon="warn" title={t('thread.notFound')} action={<Button onPress={onBack}>{t('action.back')}</Button>} />;
  if (ended === 'notFound') return <EmptyState icon="warn" title={t('thread.notFound')} action={<Button onPress={onBack}>{t('action.back')}</Button>} />;

  const forGood = closedForGood(ticket) || ended === 'closedForGood';
  const cap = ended === 'messageCap';
  const menu: MenuEntry[] = [
    ...(ticket.status !== 'closed' && !heldClose ? [{ id: 'close', label: t('action.close'), icon: 'x' as const, opens: true, onAction: () => setConfirm(true) }] : []),
    { id: 'copy', label: t('action.copyRef'), icon: 'copy' as const, copy: ticket.id, onAction: () => undefined },
  ];
  const doClose = async () => {
    if (closingNow) return;
    setClosingNow(true);
    setCloseHint(null);
    try {
      const r = await closeTicket(ticket.id);
      const answeredAt = Date.now();
      setClosing(r.outcome === 'done' ? null : r);
      setCloseTill(r.outcome === 'failed' && r.verdict === 'busy' ? busyUntil(sendOf(r), answeredAt) : undefined);
      setConfirm(false);
    } finally {
      setClosingNow(false);
    }
  };
  const checkClose = async (h: NonNullable<typeof heldClose>) => {
    setChecking(true);
    try {
      const landed = await closeLanded(h);
      if (landed === true) {
        setClosing(null);
        setCloseHint(null);
      } else setCloseHint({ open: landed === false, at: Date.now() });
    } finally {
      setChecking(false);
    }
  };
  const closeWords = closing && closing.outcome === 'failed' && closing.verdict ? refusalWords(t, sendOf(closing), Date.now(), closeTill) : null;

  return (
    <>
      <DetailPage
        header={{
          title: ticket.subject,
          // The status is the one pill beside the title; the category and the reference are the meta line under it,
          // spaced by the kit.
          meta: <TicketStatus ticket={ticket} />,
          subtitle: (
            <>
              <StatusPill tone="neutral">{t(categoryKey(ticket.category))}</StatusPill>
              <span className={s.ref}>{maskId(ticket.id)}</span>
            </>
          ),
        }}
        menu={menu}
        // The footer's New ticket is secondary: the page header's New ticket stays the one primary in view.
        footer={
          forGood ? (
            <div className={s.endState}>
              <p>{t('thread.closedForGood')}</p>
              <Button icon="plus" onPress={() => onNewTicket()}>
                {t('action.new')}
              </Button>
            </div>
          ) : cap ? (
            <div className={s.endState}>
              <p>{t('thread.messageCap')}</p>
              <Button icon="plus" onPress={() => onNewTicket(ticket)}>
                {t('action.new')}
              </Button>
            </div>
          ) : (
            <ReplyBox ticket={ticket} onEnd={(e) => setEnd({ id, end: e })} />
          )
        }
      >
        {/* Hidden only beside the dialog that sent it, which stays up, busy, until the answer. Back on this ticket after
            leaving, nothing else would say a close is out. */}
        {heldClose && (answerOwed(heldClose) || !closingNow) && (
          <OutcomeBanner
            kind="pending"
            {...(closing?.outcome === 'pending' ? { error: closing.error } : {})}
            known={closeHint ? t(closeHint.open ? 'close.stillOpen' : 'close.readFailed', { time: clock(closeHint.at) }) : t('close.unknown')}
            checkLine={t('close.checkLine')}
            onCheck={() => void checkClose(heldClose)}
            checking={checking}
            onDismiss={() => {
              if (stopTracking(heldClose)) setClosing(null);
            }}
            /* noDetails: a held close is read from storage (another tab, a reload); this tab's lost answer passes its error above */
          />
        )}
        {/* No reply box (closed for good, or the message cap): a reply still held shows here, never nowhere. */}
        {(forGood || cap) && heldReplies.filter(answerOwed).map((h) => <AttemptBanner key={h.id} held={h} />)}
        {closing && closing.outcome !== 'pending' && closing.outcome !== 'done' && (
          <OutcomeBanner kind={closing.outcome === 'failed' ? 'failed' : closing.outcome} {...(closeWords ? { body: closeWords } : {})} error={closing.error} onDismiss={() => setClosing(null)} />
        )}
        {th.olderError && <ErrorState size="compact" title={t('thread.olderFailed')} error={th.olderError} onRetry={th.showOlder} />}
        {th.hasOlder && !th.olderError && (
          <div className={s.older}>
            <Button size="sm" onPress={th.showOlder} busy={th.loadingOlder}>
              {t('action.showOlder')}
            </Button>
          </div>
        )}
        <ol className={s.messages}>
          {th.messages.map((m) => (
            <MessageItem key={m.seq} m={m} />
          ))}
        </ol>
      </DetailPage>
      <ConfirmDialog
        overlayId="support-close"
        isOpen={confirm}
        onOpenChange={setConfirm}
        title={t('close.title')}
        body={t('close.body')}
        confirmLabel={t('close.confirm')}
        confirmDisabled={closingNow}
        busy={closingNow}
        onConfirm={() => void doClose()}
      />
    </>
  );
}

function MessageItem({ m }: { m: Message }) {
  const t = useStrings(strings);
  return (
    <li className={m.from === 'support' ? `${s.message} ${s.staff}` : s.message}>
      <div className={s.messageHead}>
        <span className={s.author}>{t(m.from === 'you' ? 'from.you' : 'from.support')}</span>
        <time className={s.time} dateTime={m.createdAt}>
          {formatDateTime(m.createdAt)}
        </time>
      </div>
      <div className={s.body} data-support-text="">
        {autolink(m.body)}
      </div>
    </li>
  );
}

// The reply box under a thread. One press holds an attempt in core and sends it
// once with that attempt's client_key. While a reply of this ticket may have gone through (a lost answer here, after a
// reload or in another tab), the box offers only the pending banner: Check again reads, Stop tracking forgets, nothing
// is sent again. While this tab's own send waits for its answer the box is locked and Send reads busy, with no banner
// (Attempt.tsx answerOwed). A definite refusal unlocks the draft with its words; the message cap and closed for good hide the box.
import { Button, OutcomeBanner, TextField, formatNumber, useStrings } from '@kit';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { draftOf, keepAnswer, replyLock, sendReply, useHeld, useUnclaimed, type Draft, type SendResult } from '../data';
import { BODY_MAX, BODY_MAX_LINES, textSize, type Ticket } from '../logic';
import strings from '../strings.en.json';
import { AttemptBanner, answerOwed } from './Attempt';
import s from './parts.module.css';
import { StatusLine } from './Status';
import { busyUntil, fieldError, refusalWords } from './words';

export type ReplyEnd = 'messageCap' | 'closedForGood' | 'notFound';

export function ReplyBox({ ticket, onEnd }: { ticket: Ticket; onEnd: (end: ReplyEnd) => void }) {
  const t = useStrings(strings);
  const held = useHeld(replyLock(ticket.id));
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [cleaned, setCleaned] = useState(false);
  const [busyTill, setBusyTill] = useState<number | null>(null);
  const first = held[0];
  // The thread is keyed per ticket: switching tickets mid-send leaves this box, and its answer is kept for the next box
  // of this ticket, which takes it: a refusal's words over the text it refused, an
  // end, or a sent reply's note.
  const answer = useUnclaimed(replyLock(ticket.id));
  const open = useRef(true);
  useEffect(() => {
    open.current = true;
    return () => {
      open.current = false;
    };
  }, []);
  const lockedText = first ? (draftOf(first.id)?.body ?? text) : text;
  // The counter counts the text the field shows (a held send's draft, after the box was left and opened again).
  const size = textSize(lockedText);
  const over = size.chars > BODY_MAX || size.lines > BODY_MAX_LINES;
  const now = Date.now();
  const busy = busyTill !== null && now < busyTill;
  const canSend = !first && !sending && !busy && text.trim() !== '' && !over;
  // Off only because nothing is written yet: Send says so (a hold, a send, a wait or a too-long text shows its own words).
  const need = !first && !sending && !busy && !over && text.trim() === '' ? t('new.need.message') : null;
  // The wait ends by itself at that time, with no edit: Send is live again and the busy words go.
  useEffect(() => {
    if (busyTill === null) return undefined;
    const id = setTimeout(() => {
      setBusyTill(null);
      setResult((r) => (r?.verdict === 'busy' ? null : r));
    }, Math.max(0, busyTill - Date.now()));
    return () => clearTimeout(id);
  }, [busyTill]);
  // After this box's own reply went through, the focus goes back to the empty field for the next message: Send turns off
  // with the empty text, and a focused control that turns off gives the focus up (in a terminal to nowhere, so the next
  // Tab started at the top of the screen). Run after the render that ends the send: while sending the field is read-only,
  // which in a terminal is another field (the one that had the focus is gone).
  const replyField = useRef<HTMLTextAreaElement>(null);
  const refocus = useRef(false);
  useEffect(() => {
    if (!refocus.current || sending || first) return;
    refocus.current = false;
    replyField.current?.focus();
  });

  // One answer, in this box (`draft`: the text a kept answer was sent with, back in the box for a refusal).
  const settle = (r: SendResult, draft?: Draft, answeredAt = Date.now()) => {
    if (r.verdict === 'sent') {
      setText('');
      setCleaned(!!r.cleaned);
      return;
    }
    if (r.verdict === 'messageCap' || r.verdict === 'closedForGood' || r.verdict === 'notFound') {
      onEnd(r.verdict);
      return;
    }
    if (draft) setText(draft.body);
    if (r.verdict === 'busy') setBusyTill(busyUntil(r, answeredAt));
    setResult(r);
  };
  const submit = async () => {
    if (!canSend) return;
    setSending(true);
    setResult(null);
    setCleaned(false);
    try {
      const r = await sendReply(ticket.id, text);
      if (!open.current) {
        keepAnswer(r);
        return;
      }
      settle(r);
      if (r.verdict === 'sent') refocus.current = true;
    } finally {
      setSending(false);
    }
  };
  const { kept, take } = answer;
  useEffect(() => {
    if (!kept) return;
    // Another hold shows: a newer send holds the lock (perhaps another tab's); the old answer is dropped, never settled.
    if (held.some((h) => h.id !== kept.hold)) return void take(kept);
    if (!take(kept)) return;
    settle(kept.result, kept.draft, kept.at);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per kept answer
  }, [kept]);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void submit();
    }
  };
  const field = result ? fieldError(t, result) : null;
  // A send is out or its answer is still coming: the box keeps its rows and Send shows busy.
  const owed = held.filter(answerOwed);
  const waiting = sending || owed.length < held.length;
  const words = result ? refusalWords(t, result, now, busyTill ?? undefined) : null;
  return (
    <div className={s.reply}>
      {/* What happens next sits with the reply box, not at the end of the messages: in a short pane the messages scroll
          and the box stays, so the line is always in view beside the action it explains. */}
      <StatusLine ticket={ticket} />
      {held.filter(answerOwed).map((h) => (
        // Stop tracking unlocks the text on screen: the held draft becomes this box's own text.
        <AttemptBanner key={h.id} held={h} onStopped={(d) => void (d && setText(d.body))} />
      ))}
      {cleaned && <p className={s.note} role="status">{t('thread.cleaned')}</p>} {/* reason: one-line note after a send */}
      {result && words && <OutcomeBanner kind="failed" body={words} error={result.error} onDismiss={() => setResult(null)} />}
      {result && !words && !field && result.verdict === 'other' && <OutcomeBanner kind="failed" error={result.error} onDismiss={() => setResult(null)} />}
      <TextField
        label={t('reply.label')}
        multiline
        rows={4}
        value={lockedText}
        onChange={(v) => {
          setText(v);
          if (field) setResult(null);
        }}
        onKeyDown={onKeyDown}
        inputRef={replyField}
        isReadOnly={!!first || sending}
        keepRows={waiting}
        description={t('field.help', { counter: t('field.counter', { n: formatNumber(size.chars) }), hint: t('field.hint') })}
        errorMessage={field?.field === 'body' ? field.words : size.chars > BODY_MAX ? t('text.tooLong', { max: formatNumber(BODY_MAX) }) : over ? t('text.tooManyLines') : undefined}
        focusOnError
      />
      <div className={s.replyActions}>
        <Button variant="primary" onPress={() => void submit()} isDisabled={!canSend} {...(need ? { disabledReason: need } : {})} busy={waiting}>
          {t('action.send')}
        </Button>
      </div>
    </div>
  );
}

// New ticket, a kit Drawer on ?new=1. It takes the in-memory prefill
// once (links.ts; never from the URL) and never sends on its own. One press holds a create attempt in core and sends it
// once with that attempt's client_key; while a create may have gone through (here, after a reload or in another tab)
// the drawer offers only the pending banner and keeps the draft locked.
import { Button, Drawer, LinkButton, OutcomeBanner, Select, TextField, formatNumber, useMedia, useStrings } from '@kit';
import { useEffect, useRef, useState } from 'react';
import { CREATE_LOCK, draftOf, keepAnswer, sendCreate, useHeld, useLimits, useUnclaimed, type Draft, type SendResult } from '../data';
import { links, takePrefill, type Prefill } from '../links';
import { BODY_MAX, BODY_MAX_LINES, CATEGORIES, SUBJECT_MAX, duplicateRefusal, messageRows, textSize, type Category, type Ticket } from '../logic';
import strings from '../strings.en.json';
import { AttemptBanner, answerOwed } from './Attempt';
import { Limits } from './Limits';
import s from './parts.module.css';
import { busyUntil, fieldError, refusalWords } from './words';

const asCategory = (c: string | undefined): Category | undefined => (CATEGORIES as readonly string[]).includes(c ?? '') ? (c as Category) : undefined;

export function NewTicket({ onClose, onCreated, followUp }: { onClose: () => void; onCreated: (t: Ticket | undefined) => void; followUp?: Ticket }) {
  const t = useStrings(strings);
  // Taken once, at the drawer's first render: a follow-up from the message cap, or another page's prefill.
  const [initial] = useState<Prefill>(() => (followUp ? { category: followUp.category, subject: t('thread.followUp', { subject: followUp.subject }) } : (takePrefill() ?? {})));
  const [category, setCategory] = useState<Category | undefined>(asCategory(initial.category));
  const [subject, setSubject] = useState(Array.from(initial.subject ?? '').slice(0, SUBJECT_MAX).join(''));
  const [body, setBody] = useState(initial.body ?? '');
  const [sending, setSending] = useState(false);
  // Answered sent: the ticket exists and the drawer is on its way out, which can take a moment (its close steps Back).
  // Until it has gone, nothing here is live: no second send, no discard ask, and no other close (a second one would step
  // the page back past this one). The Drawer's own busy stays off: it would refuse the very Back that closes the drawer.
  const [sent, setSent] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [busyTill, setBusyTill] = useState<number | null>(null);
  const limits = useLimits();
  const rows = messageRows({ tall: useMedia('(height >= 820px)'), roomy: useMedia('(height >= 1000px)'), phone: useMedia('(width < 768px)') });
  const held = useHeld(CREATE_LOCK);
  const first = held[0];
  // This drawer's answer acts only while this drawer is open. The palette can leave a busy drawer: a late answer must not
  // move the page the user has gone on to, or close a drawer opened since.
  const open = useRef(true);
  useEffect(() => {
    open.current = true;
    return () => {
      open.current = false;
    };
  }, []);
  // A send this drawer's earlier mount made, answered after it was left, is taken here:
  // a definite refusal comes back with its words and its text to edit. A created ticket opens only in a drawer that
  // showed that very send held (open while it was out); a drawer opened after the answer starts empty (the list has it).
  const answer = useUnclaimed(CREATE_LOCK);
  const seenHolds = useRef(new Set<string>());
  if (first) seenHolds.current.add(first.id);
  const owed = held.filter(answerOwed);
  // A send still out from an earlier mount of this drawer reads as busy too: its banner is hidden, so this is what says so.
  const sendOut = sending || owed.length < held.length;
  const draft = first ? draftOf(first.id) : undefined;
  // What the fields show: a held send's draft while it is held (after the drawer was left and opened again), else the
  // text being written. The counter and the length checks read the same text.
  const shownCategory = first ? (asCategory(draft?.category) ?? category) : category;
  const shownSubject = first ? (draft?.subject ?? subject) : subject;
  const shownBody = first ? (draft?.body ?? body) : body;
  const subj = textSize(shownSubject), msg = textSize(shownBody);
  const subjectOver = subj.chars > SUBJECT_MAX || shownSubject.includes('\n');
  const bodyOver = msg.chars > BODY_MAX || msg.lines > BODY_MAX_LINES;
  const now = Date.now();
  const busy = busyTill !== null && now < busyTill;
  // The wait ends by itself at that time, with no edit: Send ticket is live again and the busy words go.
  useEffect(() => {
    if (busyTill === null) return undefined;
    const id = setTimeout(() => {
      setBusyTill(null);
      setResult((r) => (r?.verdict === 'busy' ? null : r));
    }, Math.max(0, busyTill - Date.now()));
    return () => clearTimeout(id);
  }, [busyTill]);
  const canSend = !first && !sending && !sent && !busy && !!category && subject.trim() !== '' && body.trim() !== '' && !subjectOver && !bodyOver;
  const dirty = !first && !sent && (subject !== '' || body !== '');
  // The one required field still empty, in the form's order: the footer names it, so a form that lacks only that never
  // looks dead (the API requires all three; an over-long or refused field has its own error at the field).
  const need = first || sending || sent || busy || subjectOver || bodyOver ? null : !category ? t('new.need.category') : subject.trim() === '' ? t('new.need.subject') : body.trim() === '' ? t('new.need.message') : null;

  // One answer, in this drawer: a sent one opens the ticket; a refusal shows its words over the text it refused (`draft`:
  // the text a kept answer was sent with, back in the fields).
  const settle = (r: SendResult, draft?: Draft, answeredAt = Date.now()) => {
    if (r.verdict === 'sent') {
      setSent(true);
      onCreated(r.ticket);
      return;
    }
    if (draft) {
      setCategory(asCategory(draft.category));
      setSubject(draft.subject ?? '');
      setBody(draft.body);
    }
    if (r.verdict === 'busy') setBusyTill(busyUntil(r, answeredAt));
    setResult(r);
  };
  const submit = async () => {
    if (!canSend || !category) return;
    setSending(true);
    setResult(null);
    try {
      const r = await sendCreate({ category, subject, body });
      // Left before the answer: kept for the next drawer, never acted on here (the page has moved on).
      if (!open.current) {
        keepAnswer(r);
        return;
      }
      settle(r);
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
    if (kept.result.verdict !== 'sent' || seenHolds.current.has(kept.hold)) settle(kept.result, kept.draft, kept.at);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per kept answer
  }, [kept]);
  const field = result ? fieldError(t, result) : null;
  const words = result ? refusalWords(t, result, now, busyTill ?? undefined) : null;
  const isDuplicate = result?.verdict === 'duplicate';
  const savedIn = isDuplicate ? duplicateRefusal(result.data).ticketId : null;
  const locked = !!first || sending || sent;
  return (
    <Drawer
      isOpen
      overlayId="support-new"
      resizeKey="support-new"
      onOpenChange={(open) => (open || sent ? undefined : onClose())}
      title={t('new.title')}
      size="sm"
      dirty={dirty}
      busy={sendOut}
      {...(need ? { reason: need } : {})}
      primary={
        <Button variant="primary" onPress={() => void submit()} isDisabled={!canSend} {...(need ? { disabledReason: need } : {})} busy={sendOut || sent}>
          {t('action.sendTicket')}
        </Button>
      }
    >
      <div className={s.form}>
        <Limits limits={limits.data} />
        <Select
          label={t('new.category')}
          options={CATEGORIES.map((c) => ({ value: c, label: t(`category.${c}`), description: t(`categoryHint.${c}`) }))}
          value={shownCategory}
          onChange={(v) => {
            setCategory(v);
            if (isDuplicate) setResult(null);
          }}
          isDisabled={locked}
          isRequired
        />
        <TextField
          label={t('new.subject')}
          value={shownSubject}
          onChange={(v) => {
            setSubject(v);
            if (isDuplicate || field?.field === 'subject') setResult(null);
          }}
          isReadOnly={locked}
          isRequired
          errorMessage={field?.field === 'subject' ? field.words : subjectOver ? (shownSubject.includes('\n') ? t('text.multiline') : t('text.tooLong', { max: formatNumber(SUBJECT_MAX) })) : undefined}
          focusOnError
          reserveError
        />
        <TextField
          label={t('new.message')}
          multiline
          rows={rows}
          value={shownBody}
          onChange={(v) => {
            setBody(v);
            if (isDuplicate || field?.field === 'body') setResult(null);
          }}
          isReadOnly={locked}
          keepRows={sendOut || sent}
          isRequired
          description={t('field.help', { counter: t('field.counter', { n: formatNumber(msg.chars) }), hint: t('new.hint') })}
          errorMessage={field?.field === 'body' ? field.words : msg.chars > BODY_MAX ? t('text.tooLong', { max: formatNumber(BODY_MAX) }) : bodyOver ? t('text.tooManyLines') : undefined}
          focusOnError
        />
        {/* The banners go in the body under the fields, not the footer's Outcome slot: a banner's sentences need the
            drawer's width (the 64 px footer squeezed them to a word a line). */}
        {owed.map((h) => (
          // Stop tracking unlocks the text on screen: the held draft becomes this drawer's own text.
          <AttemptBanner
            key={h.id}
            held={h}
            onStopped={(d) => {
              if (!d) return;
              setCategory(asCategory(d.category) ?? category);
              setSubject(d.subject ?? subject);
              setBody(d.body);
            }}
          />
        ))}
        {/* Any edit clears this refusal and so its link: following it drops the form with no discard question, which is
            safe only while the form holds the very text the ticket already has. */}
        {result && words && (
          <OutcomeBanner
            kind="failed"
            body={words}
            error={result.error}
            actions={savedIn ? <LinkButton size="sm" href={links.ticket(savedIn)}>{t('send.matchLink')}</LinkButton> : undefined}
            onDismiss={() => setResult(null)}
          />
        )}
        {/* Only a definite failure: a lost answer ('unknown') shows the held attempt's banner above and nothing else. */}
        {result && !words && !field && result.verdict === 'other' && <OutcomeBanner kind="failed" error={result.error} onDismiss={() => setResult(null)} />}
      </div>
    </Drawer>
  );
}

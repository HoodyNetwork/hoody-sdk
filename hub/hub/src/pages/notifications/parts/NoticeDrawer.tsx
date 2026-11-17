// One abuse notice in a drawer: its facts, the restriction line, what Hoody wrote and every
// message after it, and the reply box while the notice is open. It shows only the owner answer's fields.
//
// The reply (abuse.ts sendReply) is held in core before it leaves. While a reply of this notice may have gone through
// (a lost answer here, after a reload, in another tab of the account) the box offers only the pending banner: Check
// again re-reads the notice and settles nothing, Stop tracking (warned by the kit) frees only the hold shown, nothing is
// sent again. The banner follows the requested notice id, so it shows while the notice is loading or cannot be read.
// While this tab's own send waits for its answer the box is locked and Send reads busy, with no banner.
import { AnatomySection, Band, Button, Drawer, Facts, Form, ItemList, OutcomeBanner, StatusPill, TextField, formatDateTime, formatNumber, useStrings, type Fact, type ItemProps, type SectionState } from '@kit';
import { alive, capture, useCore, type HeldAttempt } from '@core';
import { useEffect, useRef, useState } from 'react';
import { checkReply, clearStopFailed, draftOf, sendReply, stopTracking, useAbuseNotice, useHeldReplies, useStopFailed, type ReplyResult } from '../abuse';
import { REPLY_MAX, REPLY_MAX_LINE, REPLY_MAX_LINES, refusalKey, repliesLeft, replyFits, replySize, type AbuseNoticeDetail, type AbuseStatus } from '../abuseLogic';
import strings from '../strings.en.json';
import { isolated, plainLines } from './noticeBits';

type T = ReturnType<typeof useStrings<typeof strings>>;

/** The status word and tone of a notice (open needs the owner's attention). */
export function NoticeStatus({ status }: { status: AbuseStatus }) {
  const t = useStrings(strings);
  return <StatusPill tone={status === 'open' ? 'warn' : 'ok'}>{t(status === 'open' ? 'an.status.open' : 'an.status.resolved')}</StatusPill>;
}

const clock = (ms: number): string => new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/** A name inside a sentence, isolated (FSI ... PDI) so a right-to-left name cannot reorder the words around it. */
const isolate = (s: string): string => `\u2068${s}\u2069`;

/** Not while this tab's own request is out: nothing is unknown yet. Another tab's send, a reload and a lost answer show it. */
const answerOwed = (h: HeldAttempt): boolean => h.inFlight !== 'here';

export function NoticeDrawer({ id, title, onClose }: { id: string | undefined; title: string | undefined; onClose: () => void }) {
  const t = useStrings(strings);
  const q = useAbuseNotice(id);
  const d = q.data;
  const state: SectionState = d
    ? { kind: 'ready' }
    : q.error || q.malformed
      ? { kind: 'failed', error: q.error ?? { code: 'MALFORMED_ANSWER' }, onRetry: () => void q.refetch() }
      : { kind: 'loading', rows: 6 };
  // The held reply is the requested notice's (its id), read or not: its banner shows while the notice is loading or
  // failed, the box only with a valid read.
  const reply = useReply(id ?? null, d);
  // A reply just sent is confirmed first, even the one that used up the limit (the limit sentence would read as a refusal).
  const note = !d ? undefined : d.status !== 'open' ? t('an.resolvedNoReply') : reply.sent ? t('an.sent') : reply.left === 0 && !reply.locked ? t('an.err.limit') : undefined;
  // One reply of a notice is held at a time (its lock): the banner shows that one.
  const heldNow = reply.held[0];
  // What the last Check again (or a failed Stop tracking) found: its own status line, read aloud. The check line stays,
  // with its warning that a message of the same text may be an earlier one.
  const checkResult = reply.stopFailed
    ? t('an.held.stopFailed')
    : !reply.checked
      ? null
      : reply.checked.ok
        ? t('an.held.checked', { time: clock(reply.checked.at) })
        : t('an.held.readFailed', { time: clock(reply.checked.at) });
  const refusalWords = reply.refusalKey === 'an.err.resolved' ? t('an.err.resolved') : reply.refusalKey === 'an.err.limit' ? t('an.err.limit') : reply.refusalKey === 'an.err.gone' ? t('an.err.gone') : undefined;
  return (
    <Drawer
      overlayId="notifications-notice"
      resizeKey="notifications-notice"
      isOpen={!!id}
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={d?.title ?? title ?? t('an.drawerTitle')}
      subtitle={d?.serverLabel ? t('an.about', { server: isolate(d.serverLabel) }) : undefined}
      cancel={t('an.close')}
      dirty={reply.dirty}
      busy={reply.sending}
      primary={
        reply.offered ? (
          <Button variant="primary" onPress={() => void reply.submit()} isDisabled={!reply.canSend} {...(reply.need ? { disabledReason: reply.need } : {})} busy={reply.busy}>
            {t('an.reply.send')}
          </Button>
        ) : undefined
      }
    >
      <AnatomySection
        id="notice"
        title={t('an.s.notice')}
        state={state}
        notices={d?.restriction === 'active' ? <Band tone="warn" /* noDetails: a fact of the notice, not a failed request */>{t('an.restrictionActive')}</Band> : undefined}
      >
        {d && <Facts items={factsOf(t, d)} layout="spec" columns={1} label={t('an.factsLabel')} />}
        {d && <ItemList label={t('an.s.messages')} items={messagesOf(t, d)} />}
      </AnatomySection>
      {(d || heldNow) && (
        <AnatomySection
          id="notice-reply"
          title={t('an.s.reply')}
          {...(note ? { note } : {})}
          notices={
            heldNow ? (
              <OutcomeBanner
                key={heldNow.id}
                kind="pending"
                known={t('an.held.known')}
                checkLine={t('an.held.checkLine')}
                result={checkResult}
                stopLine={heldNow.inFlight === 'elsewhere' ? t('an.held.elsewhere') : t('an.held.stopLine')}
                onCheck={() => void reply.check(heldNow)}
                checking={reply.checking}
                {...(heldNow.inFlight === 'elsewhere' ? {} : { onDismiss: () => void reply.stop(heldNow) })}
                /* noDetails: a held reply is read from storage (another tab, a reload); no rejection travels with it */
              />
            ) : reply.notSent ? (
              <OutcomeBanner kind="not_sent" body={t('an.notSent')} onDismiss={reply.clear} /* noDetails: nothing left the browser */ />
            ) : reply.refusal ? (
              <OutcomeBanner kind="failed" body={refusalWords} error={reply.refusal.error} onDismiss={reply.clear} />
            ) : undefined
          }
        >
          {reply.offered && (
            <Form onSubmit={() => void reply.submit()} busy={reply.sending} locked={reply.locked}>
              <TextField
                label={t('an.reply.label')}
                multiline
                rows={4}
                value={reply.shownText}
                onChange={reply.setText}
                isReadOnly={reply.locked || reply.sending}
                keepRows={reply.busy}
                description={t('an.reply.help', { n: formatNumber(reply.size), max: formatNumber(REPLY_MAX), left: reply.left, count: reply.left })}
                errorMessage={reply.fieldError}
                focusOnError
              />
            </Form>
          )}
        </AnatomySection>
      )}
    </Drawer>
  );
}

/** A time as the API sent it, or 'not recorded' for its null (never a made-up time). */
const timeOf = (t: T) => (iso: string | null): string => (iso ? formatDateTime(iso) : t('an.timeUnknown'));

function factsOf(t: T, d: AbuseNoticeDetail): Fact[] {
  const when = timeOf(t);
  return [
    { label: t('an.f.server'), value: d.serverLabel === null ? t('an.serverUnknown') : isolated(d.serverLabel) },
    { label: t('an.f.status'), value: <NoticeStatus status={d.status} /> },
    { label: t('an.f.opened'), value: when(d.createdAt) },
    { label: t('an.f.updated'), value: when(d.updatedAt) },
    ...(d.resolvedAt ? [{ label: t('an.f.resolved'), value: when(d.resolvedAt) }] : []),
    ...(d.restriction
      ? [{ label: t('an.f.restriction'), value: <StatusPill tone={d.restriction === 'active' ? 'danger' : 'neutral'}>{t(d.restriction === 'active' ? 'an.r.active' : 'an.r.lifted')}</StatusPill> }]
      : []),
  ];
}

/** What Hoody wrote first, then every message, oldest first. */
function messagesOf(t: T, d: AbuseNoticeDetail): ItemProps[] {
  const when = timeOf(t);
  const first: ItemProps = {
    id: 'notice-text',
    title: t('an.from.hoody'),
    meta: [when(d.createdAt)],
    details: [{ label: t('an.f.message'), value: plainLines(d.userMessage) }],
  };
  return [
    first,
    ...d.messages.map(
      (m): ItemProps => ({
        id: `seq-${m.seq}`,
        title: t(m.author === 'admin' ? 'an.from.hoody' : 'an.from.you'),
        meta: [when(m.createdAt)],
        details: [{ label: t('an.f.message'), value: plainLines(m.body) }],
      }),
    ),
  ];
}

/** The reply box's state: the held replies of this notice (this account), the draft, and the last answer. Everything is
 *  bound to the account and notice shown: a switch of either clears it, and an answer that comes back after one is
 *  dropped (each async step captures the core context and the shown key, and applies only while both still hold). */
function useReply(id: string | null, d: AbuseNoticeDetail | undefined) {
  const t = useStrings(strings);
  const account = useCore().account;
  const shownKey = `${account ?? ''}:${id ?? ''}`;
  const held = useHeldReplies(id);
  const [text, setTextRaw] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<ReplyResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState<{ at: number; ok: boolean; hold: string } | null>(null);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  // Another notice or another account: nothing of the last one stays, and its late answers are dropped.
  const shownFor = useRef(shownKey);
  useEffect(() => {
    if (shownFor.current === shownKey) return;
    shownFor.current = shownKey;
    setTextRaw('');
    setResult(null);
    setChecked(null);
    setSending(false);
    setChecking(false);
  }, [shownKey]);
  /** An async step started now applies its result only while the same account and notice are shown. */
  const bind = () => {
    const ctx = capture();
    const key = shownFor.current;
    return () => live.current && alive(ctx) && shownFor.current === key;
  };

  const first = held[0];
  const left = d ? repliesLeft(d) : 0;
  const size = replySize(text);
  const over = size.chars > REPLY_MAX || size.lines > REPLY_MAX_LINES;
  const refusal = result?.verdict === 'refused' ? result : null;
  const words = refusal ? refusalKey(refusal.code) : null;
  const textRefused = words === 'an.err.text';
  const offered = !!d && d.id === id && d.status === 'open' && (left > 0 || !!first);
  const canSend = offered && !first && !sending && left > 0 && replyFits(text);
  // Why Send reply is off when the box is only empty (the other reasons show where they are).
  const need = offered && !first && !sending && left > 0 && text.trim() === '' ? t('an.reply.need') : null;

  const submit = async () => {
    if (!d || !canSend) return;
    const still = bind();
    setSending(true);
    setResult(null);
    setChecked(null);
    try {
      const r = await sendReply(d.id, text);
      if (!still()) return;
      if (r.verdict === 'sent') setTextRaw('');
      setResult(r);
    } finally {
      if (still()) setSending(false);
    }
  };
  const check = async (h: HeldAttempt) => {
    const still = bind();
    setChecking(true);
    clearStopFailed(h.id);
    try {
      const c = await checkReply(h);
      if (still()) setChecked({ ...c, hold: h.id });
    } finally {
      if (still()) setChecking(false);
    }
  };
  /** Stop tracking runs outside the view (abuse.ts): until core answers the hold stays listed and the box locked, here
   *  and in any view opened meanwhile. */
  const stop = async (h: HeldAttempt) => {
    const still = bind();
    setChecked(null);
    // Freed: the text it was sent with goes too, so the unlocked box never offers to post it again.
    if ((await stopTracking(h)) === 'freed' && still()) setTextRaw('');
  };

  const shown = held.filter(answerOwed);
  const stopFailedShown = useStopFailed(shown[0]?.id);
  const forShown = (holdId: string | null | undefined) => !!holdId && holdId === shown[0]?.id;
  return {
    held: shown,
    notSent: result?.verdict === 'notSent' && result.code !== 'HELD',
    refusal: refusal && !textRefused ? refusal : null,
    refusalKey: words,
    sent: result?.verdict === 'sent',
    clear: () => setResult(null),
    offered,
    canSend,
    need,
    busy: sending || held.some((h) => !answerOwed(h)),
    sending,
    /** An unsent draft: closing the drawer asks first. A held reply's text is not a draft (it went, or may have). */
    dirty: !first && !sending && text.trim() !== '',
    locked: !!first,
    left,
    size: size.chars,
    shownText: first ? (draftOf(first.id) ?? text) : text,
    fieldError: textRefused
      ? t('an.err.text')
      : over
        ? t('an.err.tooLong', { max: formatNumber(REPLY_MAX) })
        : size.longestLine > REPLY_MAX_LINE
          ? t('an.err.lineTooLong', { max: formatNumber(REPLY_MAX_LINE) })
          : undefined,
    setText: (v: string) => {
      setTextRaw(v);
      if (textRefused) setResult(null);
      if (result?.verdict === 'sent') setResult(null);
    },
    submit,
    check,
    stop,
    checking,
    /** Only the shown hold's own check and stop answers show. */
    checked: checked && forShown(checked.hold) ? checked : null,
    stopFailed: stopFailedShown,
  };
}

// SessionView: one conversation, read through a ConversationSource. The transcript is a list of turns (the person's message, the
// agent's activity ledger, its reply and the turn's foot) and the open gates, in a column that follows new output while the reader is
// at the end; under it, pinned, the working bar (what the newest turn is doing, with the host's Stop). It draws what the source's
// snapshot says and nothing else: a gate card decides only when the source is active and `can('decide' | 'answer')` says so.
// The same view serves the AI tab, the dock and tiles; the size class sets the column width.
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Button, LinkButton, cx } from '../controls/Button';
import { TextButton } from '../controls/Link';
import { formatRelative } from '../format';
import { Icon } from '../icons';
import { Band } from '../states/Band';
import { HoodyLoader } from '../states/HoodyLoader';
import { Skeleton } from '../states/States';
import { useStrings } from '../strings';
import { useNow } from '../useNow';
import { AttachChip, AttachList } from './AttachChips';
import { StoredPicture } from './StepPictures';
import { focusCard } from './focusCard';
import { DecidedLine, GateCard } from './GateCard';
import { JumpToNewest } from './JumpToNewest';
import { NeedsBar } from './NeedsBar';
import { Prose, ReplyBox, ReplyFooter } from './Reply';
import { Author, SentText, useAgentName } from './SentMessage';
import { ResultRow } from './ResultRow';
import { StepTrail } from './StepTrail';
import { SummaryNote } from './SummaryNote';
import { gateIdOf, isActive, type ActiveSource, type ConversationSource, type ConvBlock, type GateEntry, type RowAction } from './source';
import { turnPhase, type TurnPhase } from './turnPhase';
import { useWhy } from './why';
import type { SizeClass } from './useSizeClass';
import strings from './SessionView.strings.en.json';
import s from './SessionView.module.css';

/** What a user row needs to offer its actions: the source (they are checked against it where pressed), and the host's draft. */
interface RowCtx {
  source: ConversationSource;
  /** Puts a message taken back into the host's composer. Without it no row offers Edit (nowhere to put the text). */
  onTakeBack?: (text: string) => void;
  /** The host keeps the files of a message taken back (its draft holds attachments). Without it Edit is offered only on rows that
   *  carry none, so no file is dropped. */
  takeBackFiles?: boolean;
  /** The computer's Agent app (SessionViewProps agentUrl), '' when not known. */
  agentUrl?: string;
}

const LABEL: Record<RowAction, 'sv.resend' | 'sv.retry' | 'sv.edit' | 'sv.remove' | 'sv.checkAgain'> = { resend: 'sv.resend', retry: 'sv.retry', takeBack: 'sv.edit', editQueued: 'sv.edit', withdraw: 'sv.remove', check: 'sv.checkAgain' };
/** The source method and capability each row action goes through: Edit on a queued message asks the agent to take it back, as Remove does;
 *  Check again (a take-back of unknown outcome) only reads the row back. */
const METHOD: Record<RowAction, 'resend' | 'retry' | 'takeBack' | 'withdraw' | 'check'> = { resend: 'resend', retry: 'retry', takeBack: 'takeBack', editQueued: 'withdraw', withdraw: 'withdraw', check: 'check' };

/** The actions of a user row that can be drawn now: the host's block names them, the source must have the method, and Edit needs
 *  somewhere to put the text (and, on a row with files, a host draft that keeps them). */
function rowActionsOn(b: Extract<ConvBlock, { k: 'user' }>, row: RowCtx): RowAction[] {
  const src = row.source;
  if (!isActive(src) || !b.req || !b.actions) return [];
  return b.actions.filter((a) => typeof src[METHOD[a]] === 'function'
    && (a !== 'takeBack' || (!!row.onTakeBack && (!!row.takeBackFiles || !b.files?.length)))
    && (a !== 'editQueued' || !!row.onTakeBack));
}

/** Send again, Retry, Edit and Remove under a user message (`on` = rowActionsOn, not empty). The source's capability table is the truth at the
 *  press, and says why a button cannot act. `lead`: a note stands before them, so the first one is separated from it by a dot. */
function RowActions({ b, row, on }: { b: Extract<ConvBlock, { k: 'user' }>; row: RowCtx; on: readonly RowAction[] }) {
  const t = useStrings(strings);
  const why = useWhy();
  const [full, setFull] = useState(false);
  const src = row.source;
  if (!isActive(src) || !b.req) return null;
  const req = b.req;
  const press = (a: RowAction) => {
    // Checked again where the action is taken: the facts may have changed since the button was drawn.
    if (!src.can(METHOD[a]).ok) return;
    if (a === 'resend') void src.resend?.(req);
    else if (a === 'retry') void src.retry?.(req);
    else if (a === 'withdraw') void src.withdraw?.(req, 'remove');
    else if (a === 'check') void src.check(req);
    else if (a === 'editQueued') {
      // The text comes back only when the agent answered withdrawn; `onTakeBack` is the draft of the chat this row was pressed in. What
      // any other answer means the host's row says (its note), never this button.
      const put = row.onTakeBack;
      void src.withdraw?.(req, 'edit').then((r) => { if (r.k === 'withdrawn' && r.text) put?.(r.text); });
    } else {
      const r = src.takeBack?.(req);
      setFull(!!r && r.k === 'refused' && r.code === 'draft_full');
      if (r && r.k === 'text') row.onTakeBack?.(r.text);
    }
  };
  const blocked = on.map((a) => src.can(METHOD[a])).find((c) => !c.ok);
  return (
    <>
      {/* The actions wrap as one group, with a dot only between two of them: a narrow row never starts a line with a dot. */}
      <span className={s.rowActs}>
        {on.map((a, i) => (
          <span key={a} className={s.rowAction}>
            {i > 0 && <span aria-hidden="true">·</span>}
            <TextButton isDisabled={!src.can(METHOD[a]).ok} onPress={() => press(a)}>{t(LABEL[a])}</TextButton>
          </span>
        ))}
      </span>
      {blocked && !blocked.ok && <span>{why(blocked)}</span>}
      {full && <span role="status">{t('sv.editFull')}</span>}
    </>
  );
}

function Block({ b, turnMenu, row, onReview, ownTime }: { b: ConvBlock; turnMenu?: TurnMenu; row?: RowCtx; onReview?: () => void; ownTime?: boolean }): ReactNode {
  const t = useStrings(strings);
  switch (b.k) {
    case 'user': {
      const on = row ? rowActionsOn(b, row) : [];
      return (
        <div className={s.userWrap}>
          <Author who="you" at={b.at} />
          <div className={s.user}>
            <SentText text={b.text} />
            {b.files && b.files.length > 0 && (
              <AttachList label={t('sv.attSent')} big>
                {b.files.map((f) => (f.stored
                  ? <StoredPicture key={f.id} id={f.stored} name={f.name} />
                  : <AttachChip key={f.id} kind={f.kind} url={f.url} name={f.name} meta={f.gone ? t('sv.pic.none') : f.meta} />))}
              </AttachList>
            )}
          </div>
          {/* The message's meta row: its state and actions (a failed turn's prompt was taken by the agent, so it has no note of its
              own: its actions still draw). When it was sent is in the author row above. */}
          {(b.note || (row && on.length > 0)) && <p className={cx(s.userState, b.note?.bad && s.bad)}>{b.note && !b.note.bad && <Icon name="clock" size="sm" className={s.userStateMark} />}{b.note && <span>{b.note.text}</span>}{row && on.length > 0 && <RowActions b={b} row={row} on={on} />}</p>}
        </div>
      );
    }
    case 'steps': return <StepTrail b={b} />;
    case 'summary': return <SummaryNote text={b.text} />;
    case 'reply':
      if (!b.text) return null;
      return (
        <ReplyBox>
          <Prose text={b.text} caret={b.streaming} marks />
          {b.cut && <p className={s.muted}>{b.cut}</p>}
          {b.final && !b.streaming && <ResultRow text={b.text} files={b.files} onReview={onReview} />}
          {/* When the answer was finished is in the Agent's header row over the turn (answeredAt), as "You" and its time are over a
              sent message: the foot keeps the actions and the cost. An earlier finished reply of the same turn keeps its own
              time in its foot (ownTime), so no time the data carries is lost. */}
          {b.final && !b.streaming && <ReplyFooter text={b.text} cost={b.cost} at={ownTime ? b.at : null} menu={turnMenu && b.turn !== undefined ? turnMenu({ key: b.key, turn: b.turn }) : undefined} />}
        </ReplyBox>
      );
    case 'decided': return <div className={s.ledger}><DecidedLine d={b.d} /></div>;
    // An outcome of the turn (stopped, failed, may have gone through): its mark, then the host's words, unchanged.
    case 'line': {
      const line = <p className={cx(s.line, s.outcome, b.tone === 'bad' && s.bad, b.tone === 'muted' && s.muted)} role={b.tone === 'info' ? undefined : 'note'}><Icon name={b.tone === 'bad' ? 'error' : 'info'} size="sm" className={s.outcomeMark} />{b.text}</p>;
      // A turn whose outcome is not known: Check again reads the chat again (never sends), on an active source that can.
      const src = row?.source;
      const recheck = b.recheck && src && isActive(src) ? src.recheckOutcome : undefined;
      if (recheck) return <div className={s.recheck}>{line}<RecheckButton onPress={recheck} /></div>;
      const go = b.link ?? (b.agentApp && row?.agentUrl ? { label: b.agentApp, href: row.agentUrl } : null);
      return go ? <div className={s.recheck}>{line}<LinkButton href={go.href} variant="secondary" size="sm" literal>{go.label}</LinkButton></div> : line;
    }
  }
}

function RecheckButton({ onPress }: { onPress: () => void }) {
  const t = useStrings(strings);
  return <Button variant="secondary" size="sm" onPress={onPress}>{t('sv.checkAgain')}</Button>;
}

/** The host's menu for one finished turn: called only for a final reply that has its turn index; what it returns draws last in that reply's footer. */
export type TurnMenu = (t: { key: string; turn: number }) => ReactNode;

export interface SessionViewProps {
  source: ConversationSource;
  size: SizeClass;
  /** Where "Open the Agent app" goes for a gate this Hub cannot answer. */
  agentUrl?: string;
  /** The person is typing in a composer: a gate card does not take focus. */
  typing?: boolean;
  /** Shown when there is nothing yet. */
  empty?: ReactNode;
  /** A band above the transcript (cannot reach, paused). */
  top?: ReactNode;
  /** A menu on each finished reply (Fork from here): the host owns the items, the kit owns the place. */
  turnMenu?: TurnMenu;
  /** Edit under a message the agent did not take: puts its text in the host's composer. Without it Edit is not offered. */
  onTakeBack?: (text: string) => void;
  /** The host's draft keeps a taken-back message's files; without it Edit is offered only on a message with none. */
  takeBackFiles?: boolean;
  /** Opens Details on Edits (a result row's Review). Without it a row shows its count only. */
  onReview?: () => void;
  /** The host's Stop of the running turn (its own attempt: one press at a time), drawn in the working bar; given only while a turn
   *  can be stopped. `busy`: a press is unresolved, so Stop is held. `unknown`: that press has no answer (the host says so in its
   *  own words), so the bar does not claim the turn is stopping. Without `stop` the bar says what the turn is doing and offers nothing. */
  stop?: ConvStop | null;
}

export interface ConvStop { busy: boolean; unknown?: boolean; onPress: () => void }

const PHASE_WORD = {
  sending: 'sv.work.sending', working: 'sv.work.working', waiting: 'sv.work.waiting', stopping: 'sv.work.stopping', reconnecting: 'sv.work.reconnecting', catching_up: 'sv.work.catchingUp', lost: 'sv.work.lost',
} as const satisfies Record<Exclude<TurnPhase['k'], 'idle'>, keyof typeof strings>;

/** The working bar's words: what the turn waits on when that is known (compacting, a step, the reply being written, the model
 *  thinking), else the phase's own line ("Working…" for a turn that says nothing more). */
export function workWord(phase: Exclude<TurnPhase, { k: 'idle' }>): keyof typeof strings {
  if (phase.k !== 'working') return PHASE_WORD[phase.k];
  if (phase.doing === 'compacting') return 'sv.work.compacting';
  if (phase.step) return 'sv.work.step';
  if (phase.writing) return 'sv.work.writing';
  if (phase.doing === 'thinking') return 'sv.work.thinking';
  return PHASE_WORD.working;
}

/** The host's Stop as the working bar and the Needs-you bar draw it: the pressed Stop keeps focus and refuses a second press. */
function StopButton({ stop }: { stop: ConvStop }) {
  const t = useStrings(strings);
  return <Button variant="secondary" size="sm" icon="stop" busy={stop.busy} onPress={stop.onPress}>{t('sv.work.stop')}</Button>;
}

/** How long a running turn may plausibly be: a longer time, or one from a clock ahead of this one, is not the turn's and is not drawn. */
const TURN_MAX_MS = 24 * 3_600_000;
/** Without a change on this page for this long, the bar says so: the turn is not proven stuck, the person just sees how long. */
const QUIET_AFTER_MS = 30_000;
/** The phases in which the agent (not the person, not a lost computer) is expected to send something. */
const EXPECTS_UPDATES: ReadonlySet<TurnPhase['k']> = new Set(['sending', 'working', 'stopping', 'reconnecting']);

/** The newest turn's own facts for the working bar: when its message was sent (the turn's start, also after a reload) and how many
 *  steps it has taken so far (the agent's own words between steps are not steps). A message sent into the running turn, or
 *  queued for it, is not the turn's start: typing a follow-up never resets the clock or the step count. */
function turnClock(blocks: readonly ConvBlock[]): { since: number | undefined; steps: number } {
  let steps = 0;
  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    const b = blocks[i] as ConvBlock;
    if (b.k === 'steps') steps += b.rows.filter((r) => r.kind !== 'note').length;
    if (b.k === 'user' && !b.queued && !b.followUp) return { since: b.at > 0 ? b.at : undefined, steps };
  }
  return { since: undefined, steps };
}

/** A running time as the step rows write theirs: seconds, then minutes and seconds, then hours and minutes. */
function useElapsedWords(): (ms: number) => string {
  const t = useStrings(strings);
  return (ms) => {
    const sec = Math.max(0, Math.floor(ms / 1000));
    if (sec < 60) return t('sv.work.secs', { n: sec });
    const m = Math.floor(sec / 60);
    return m < 60 ? t('sv.work.mins', { m, s: sec % 60 }) : t('sv.work.hours', { h: Math.floor(m / 60), m: m % 60 });
  };
}

/** The working bar: what the newest turn is doing now, pinned under the transcript so it never scrolls away, with the host's Stop.
 *  Its words are a status (announced when they change); the step beside them is not (it changes with every tool call), and neither
 *  is the meta at the end: how many steps the turn has taken, how long it has run (from when its message was sent) and, when
 *  nothing changed on this page for a while, for how long. `mark` is the snapshot: a new one is a change. */
function WorkBar({ phase, stop, since, steps, mark }: { phase: Exclude<TurnPhase, { k: 'idle' }>; stop?: ConvStop | null; since?: number; steps: number; mark: unknown }) {
  const t = useStrings(strings);
  const time = useElapsedWords();
  const now = useNow(true);
  // When this page last saw the conversation change.
  const [seen, setSeen] = useState(() => ({ mark, at: Date.now() }));
  if (seen.mark !== mark) setSeen({ mark, at: Date.now() });
  const step = phase.k === 'working' ? phase.step : undefined;
  const words = t(workWord(phase));
  const ran = since === undefined ? -1 : now - since;
  const elapsed = phase.k !== 'lost' && phase.k !== 'catching_up' && ran >= 0 && ran < TURN_MAX_MS ? time(ran) : null;
  const still = seen.mark === mark ? now - seen.at : 0;
  const quiet = EXPECTS_UPDATES.has(phase.k) && still >= QUIET_AFTER_MS ? t('sv.work.quiet', { time: time(still) }) : null;
  const count = phase.k === 'working' && steps > 0 ? t('sv.work.stepN', { n: steps }) : null;
  return (
    <div className={s.work} data-work-bar data-phase={phase.k}>
      <span className={s.workMark}>{phase.k === 'lost' ? <Icon name="info" size="sm" className={s.infoMark} /> : phase.k === 'waiting' ? <Icon name="clock" size="sm" className={s.infoMark} /> : <HoodyLoader />}</span>
      <span className={s.workWords} role="status">{words}</span>
      {step && (
        <span className={s.workStep}>
          <span className={s.stepTool}>{step.verb}</span>
          {step.summary && <span className={s.stepSum} translate="no">{step.summary}</span>}
        </span>
      )}
      {phase.k === 'catching_up' && <span className={s.workStep}>{t('sv.work.catchingUpWhy')}</span>}
      {phase.k === 'working' && phase.doing === 'compacting' && <span className={s.workStep}>{t('sv.work.compactingWhy')}</span>}
      {/* Not a live region: it changes every second. A screen reader reads it on demand; the words before it announce the state. */}
      {(elapsed || count || quiet) && (
        <span className={s.workMeta} data-work-meta="">
          {quiet && <span className={s.workQuiet} data-work-quiet="">{quiet}</span>}
          {count && <span data-work-steps="">{count}</span>}
          {elapsed && <span className={s.workTime} data-work-elapsed="" title={t('sv.work.elapsed', { time: elapsed })}>{elapsed}</span>}
        </span>
      )}
      {stop && <span className={s.workEnd}><StopButton stop={stop} /></span>}
    </div>
  );
}

/** The transcript as turns: a message opens one, and everything up to the next message belongs to it. Blocks before any message (a
 *  chat read from its middle) make a turn of their own. */
/** While a card waits, the messages queued at the end of the column (not read by the agent yet) are drawn after the cards, so the
 *  card stays with the turn that asked it and the message reads as the next one. */
function queuedAfterCards(blocks: readonly ConvBlock[], cardWaits: boolean): { before: readonly ConvBlock[]; after: readonly ConvBlock[] } {
  let cut = blocks.length;
  while (cardWaits && cut > 0) {
    const b = blocks[cut - 1] as ConvBlock;
    if (b.k !== 'user' || !b.queued) break;
    cut -= 1;
  }
  return { before: cut === blocks.length ? blocks : blocks.slice(0, cut), after: blocks.slice(cut) };
}

function turnsOf(blocks: readonly ConvBlock[]): ConvBlock[][] {
  const out: ConvBlock[][] = [];
  for (const b of blocks) {
    if (b.k === 'user' || b.k === 'summary' || out.length === 0 || (out[out.length - 1] as ConvBlock[])[0]?.k === 'summary') out.push([]);
    (out[out.length - 1] as ConvBlock[]).push(b);
  }
  return out;
}

/** When the Agent finished its answer in this turn: the time of its last finished reply. A turn still running has none. */
function answeredAt(turn: readonly ConvBlock[]): number | undefined {
  for (let i = turn.length - 1; i >= 0; i -= 1) {
    const b = turn[i] as ConvBlock;
    if (b.k === 'reply' && b.final && !b.streaming && b.at !== null) return b.at;
  }
  return undefined;
}

/** The turn's last block is a finished reply, so the turn ends with that reply's foot. */
function endsWithFoot(turn: readonly ConvBlock[]): boolean {
  const b = turn[turn.length - 1] as ConvBlock;
  return b.k === 'reply' && !!b.text && b.final && !b.streaming;
}

/** How near the end counts as the end: about one line of text. */
const FOLLOW_LINE = 24;

// The follow rule's whole memory: the content height, viewport height and scrollTop at the view's last move (a follow, Jump
// to newest) or at the last scroll event that moved the position. No scroll event, key, wheel or pointer is read for intent.
interface Seen { sh: number; ch: number; top: number }
const note = (seen: { current: Seen }, el: HTMLElement) => { seen.current = { sh: el.scrollHeight, ch: el.clientHeight, top: el.scrollTop }; };
const scrollToEnd = (seen: { current: Seen }, el: HTMLElement) => {
  el.scrollTop = el.scrollHeight;
  note(seen, el);
};
// A move consistent with the browser's clamp: the log was at the end, and the position went up by no more than the layout
// took from below it (the content shrank, the view grew taller), +1 px of rounding. The layout may change again before
// anything here runs (a wider column reflows shorter, a band draws above, text arrives), leaving the clamped position
// short of the new end; it is still the end. A reader who went up further than that, or down, is not a clamp. Accepted
// edge: a reader at the end who scrolls up by no more than that, in the same frame, cannot be told from a clamp and is
// taken back to the end.
const clamped = (seen: { current: Seen }, el: HTMLElement) => {
  const s = seen.current;
  const room = Math.max(0, s.sh - el.scrollHeight) + Math.max(0, el.clientHeight - s.ch);
  return s.sh - s.ch - s.top <= FOLLOW_LINE && el.scrollTop < s.top && s.top - el.scrollTop <= room + 1;
};
// Whether the log sat at the end (within one line) when the change now being handled arrived. The position now decides.
// The earlier layout counts only when the position has not moved since it was noted: then the content grew under a reader
// who did nothing (it arrived before this check) and "the end" is the end of the layout they last saw. A scroll that moved
// the position is noted with the layout it found (onScroll; a clamp is followed instead), so a reader who reached the end
// of that layout and then saw it grow is at the end; one who has moved since, or whose move is not noted yet, is judged by
// the layout as it is now only, or as a clamp. A stale position never wins over a scroll of their own, except a scroll
// that the clamp rule cannot tell from a clamp (see clamped).
const wasAtEnd = (seen: { current: Seen }, el: HTMLElement) => {
  const s = seen.current;
  if (el.scrollHeight - el.clientHeight - el.scrollTop <= FOLLOW_LINE) return true;
  return (Math.abs(el.scrollTop - s.top) < 1 && s.sh - s.ch - el.scrollTop <= FOLLOW_LINE) || clamped(seen, el);
};

export function SessionView({ source, size, agentUrl = '', typing = false, empty, top, turnMenu, onTakeBack, takeBackFiles, onReview, stop }: SessionViewProps) {
  const t = useStrings(strings);
  const why = useWhy();
  const agentName = useAgentName();
  const snap = useSyncExternalStore(source.subscribe, source.snapshot);
  // The gates that wait for the person: a decision on its way or of unknown outcome is not waiting (its card says so).
  const waiting = snap.gates.filter((g) => g.decision === null);
  const scroller = useRef<HTMLDivElement>(null);
  const seen = useRef<Seen>({ sh: 0, ch: 0, top: 0 });
  // One rule: while the reader is at the end, the view follows ANY change at the end of the transcript (a new block, a
  // step row or its note, reply text growing or finishing, a note, a gate, a reflow from a width change, an image or a
  // resized field); once they have scrolled up, never, and "Jump to newest" brings them back. Changes come from a new
  // snapshot, from DOM changes below it, and from size changes of the column and of every block in it.
  const [behind, setBehind] = useState(false);
  // Whether the first waiting gate's card is fully inside the visible log (the Needs-you bar shows when it is not), and
  // whether it can be: a card taller than the log never is, so Show cannot bring the log to its end.
  const [firstSeen, setFirstSeen] = useState(true);
  const [cardFits, setCardFits] = useState(true);
  const measureGate = useCallback(() => {
    const el = scroller.current;
    const card = el?.querySelector<HTMLElement>('[data-gate-wrap]');
    if (!el || !card) { setFirstSeen(true); setCardFits(true); return; }
    const a = el.getBoundingClientRect(), b = card.getBoundingClientRect();
    setFirstSeen(b.top >= a.top - 1 && b.bottom <= a.bottom + 1);
    setCardFits(b.height <= a.height + 1);
  }, []);
  const follow = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    if (wasAtEnd(seen, el)) { scrollToEnd(seen, el); setBehind(false); } // a position that cannot move (all content fits) sends no scroll event
    else { setBehind(true); note(seen, el); }
    measureGate();
  }, [measureGate]);
  useLayoutEffect(follow, [snap, follow]);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return undefined;
    const mo = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => { sync(); follow(); });
    mo?.observe(el, { childList: true, subtree: true, characterData: true });
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(follow);
    const sync = () => {
      if (!ro) return;
      ro.disconnect();
      ro.observe(el);
      // The thread (the log's one child) and every block in it.
      for (const c of Array.from(el.children)) { ro.observe(c); for (const b of Array.from(c.children)) ro.observe(b); }
    };
    sync();
    return () => { mo?.disconnect(); ro?.disconnect(); };
  }, [follow]);
  // A scroll event takes the button away once the log is at the end and notes a move; the one move it follows itself is one
  // consistent with a clamp (see clamped), which it takes to the end.
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= FOLLOW_LINE) setBehind(false);
    // A move of the position is noted with the layout it found; the late event of our own move (position unchanged) is not,
    // and a clamp is followed to the end, not noted as a move away from it.
    if (Math.abs(el.scrollTop - seen.current.top) >= 1) {
      if (clamped(seen, el)) { scrollToEnd(seen, el); setBehind(false); } else note(seen, el);
    }
    measureGate();
  };
  // Show: the first waiting card comes into view and takes focus, as on arrival. The bar itself decides nothing.
  const showGate = () => {
    const el = scroller.current;
    const card = el?.querySelector<HTMLElement>('[data-gate-wrap]');
    if (!el || !card) return;
    card.scrollIntoView?.({ block: 'nearest' });
    focusCard(card);
    measureGate();
  };
  const toNewest = () => {
    const el = scroller.current;
    setBehind(false);
    if (el) {
      scrollToEnd(seen, el);
      // The button goes away with this press: keyboard focus moves to the log, at the newest content, not to the page.
      el.focus({ preventScroll: true });
    }
  };
  const active = isActive(source);
  const needsBar = waiting.length > 0 && (waiting.length > 1 || !firstSeen);
  // Show's card is the newest thing in the log (the one waiting card, drawn last) and Show brings all of it into view.
  const showIsNewest = waiting.length === 1 && snap.gates[snap.gates.length - 1] === waiting[0] && cardFits;
  // The host hands a Stop only while a turn can be stopped: with it the bar is never away, whatever else the snapshot says.
  const read = turnPhase(snap, { stopping: !!stop?.busy && !stop.unknown });
  const phase: TurnPhase = read.k === 'idle' && stop ? { k: 'working' } : read;
  const nothing = snap.blocks.length === 0 && snap.gates.length === 0;
  const drawn = queuedAfterCards(snap.blocks, snap.gates.length > 0);
  // A message queued while a card waits is drawn after the card, which on a small screen can be below the visible log (the card
  // came into view on arrival, so the reader is not at the end and the follow rule moves nothing). The newest one comes into view
  // once, when it first appears: the person just sent it and must see where it went.
  const afterKey = drawn.after.length ? (drawn.after[drawn.after.length - 1] as ConvBlock).key : null;
  const lastAfter = useRef<string | null>(null);
  useLayoutEffect(() => {
    const prev = lastAfter.current;
    lastAfter.current = afterKey;
    const el = scroller.current;
    if (!afterKey || afterKey === prev || !el) return;
    const rows = el.querySelectorAll<HTMLElement>('[data-queued]');
    rows[rows.length - 1]?.scrollIntoView?.({ block: 'nearest' });
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= FOLLOW_LINE) setBehind(false);
    note(seen, el);
    measureGate();
  }, [afterKey, measureGate]);
  // Nothing shown yet while the source still reads the chat: say so, never the empty (first use) state of a chat with no messages.
  const reading = nothing && snap.facts.state === 'loading';
  const gateCard = (g: GateEntry) => {
    const action = g.gate.kind === 'confirm' ? 'decide' : 'answer';
    // The capability is the one truth: a card whose action is refused cannot act, whatever else the card knows, and says why.
    const cap = source.can(action);
    const unavailable = cap.ok ? undefined : why(cap);
    // Checked again where the action is taken: the card may have been drawn before the facts changed.
    const may = (a: 'decide' | 'answer' | 'check') => active && source.can(a).ok;
    const checkCap = source.can('check');
    return (
      <GateCard
        gate={g.gate}
        pending={g.decision === 'sending'}
        unknown={g.decision === 'unknown'}
        gone={g.decision === 'unknown' && !!g.gone}
        sent={g.sent}
        addressing={g.addressing}
        held={g.held}
        helper={g.helper ? { name: g.helperName ?? '' } : false}
        unavailable={unavailable}
        agentUrl={agentUrl}
        typing={typing}
        onDecide={(choice, reason) => { if (may(action)) void (source as ActiveSource).decide(g.ref, { choice, reason }); }}
        onAnswer={(a) => { if (may(action)) void (source as ActiveSource).answer(g.ref, a); }}
        onCheck={() => { if (may('check')) void (source as ActiveSource).check({ key: g.key, kind: 'decision' }); }}
        checkUnavailable={checkCap.ok ? undefined : why(checkCap)}
        onDismiss={active && (source as ActiveSource).canDismiss(g.ref) ? () => { (source as ActiveSource).dismissDecision(g.ref); } : undefined}
      />
    );
  };
  return (
    <div className={s.root} data-size={size}>
      {top}
      {/* The log scrolls at the pane's edge; the thread inside it is the column (capped and centred, as the rows pinned under it). */}
      <div ref={scroller} className={s.column} role="log" tabIndex={-1} aria-label={t('sv.log')} onScroll={onScroll}>
        <div className={s.thread} data-thread="">
        {/* This browser's saved copy, shown while the computer is read: said once, in the kit's band (nothing in it acts). */}
        {snap.saved && <Band size="table" tone="neutral" className={s.saved}>{t('sv.saved', { when: formatRelative(snap.saved.at) })}</Band>}
        {snap.gapTop && <p className={s.line}>{t('sv.gap')}</p>}
        {reading ? <div className={s.reading}><p className={s.line}>{t('sv.reading')}</p><Skeleton variant="text" rows={4} /></div> : nothing ? empty : turnsOf(drawn.before).map((turn, n, all) => (
          // The newest turn keeps its reply's actions in sight (Conversation.module.css); older ones show them on hover or focus.
          // A turn that ends with its reply's foot (the actions' row, drawn or kept empty) says so: the rule under it comes closer.
          <section key={(turn[0] as ConvBlock).key} className={s.turn} data-turn {...(n === all.length - 1 && !drawn.after.length ? { 'data-latest': '' } : {})} {...(endsWithFoot(turn) ? { 'data-foot': '' } : {})}>
            {turn.map((b, i) => (
              <Fragment key={b.key}>
                {/* Who answers: once per turn, above the Agent's first block (its steps, its reply, an outcome line). */}
                {b.k !== 'user' && b.k !== 'summary' && (i === 0 || (turn[i - 1] as ConvBlock).k === 'user') && <div className={s.blk} data-k="author"><Author who="agent" name={agentName(snap.meta)} at={answeredAt(turn)} /></div>}
                <div className={s.blk} data-k={b.k} aria-busy={b.k === 'reply' && b.streaming ? true : undefined}><Block b={b} turnMenu={turnMenu} row={{ source, onTakeBack, takeBackFiles, agentUrl }} onReview={onReview} ownTime={b.k === 'reply' && b.at !== answeredAt(turn)} /></div>
              </Fragment>
            ))}
          </section>
        ))}
        {snap.gates.map((g) => <div key={gateIdOf(g)} className={s.gate} data-gate-key={gateIdOf(g)} {...(g === waiting[0] ? { 'data-gate-wrap': '' } : {})}>{gateCard(g)}</div>)}
        {/* Messages queued while a card waits come after it: the agent reads them once the card is answered. */}
        {!reading && drawn.after.map((b, n) => (
          <section key={b.key} className={s.turn} data-turn data-queued="" {...(n === drawn.after.length - 1 ? { 'data-latest': '' } : {})}>
            <div className={s.blk} data-k={b.k}><Block b={b} turnMenu={turnMenu} row={{ source, onTakeBack, takeBackFiles, agentUrl }} onReview={onReview} /></div>
          </section>
        ))}
        </div>
      </div>
      {/* One pinned row speaks at a time: the Needs-you bar while it is up (it then carries Stop), else the working bar. Jump to
          newest stands aside for the Needs-you bar only when both lead to the same place: one card waits, it is the last
          one drawn (gates are drawn after every turn) and it fits in the log, so Show brings the newest content into view. */}
      {behind && !(needsBar && showIsNewest) && <JumpToNewest onPress={toNewest} />}
      {needsBar
        ? <NeedsBar gates={waiting} onShow={showGate} end={stop ? <StopButton stop={stop} /> : undefined} />
        : phase.k !== 'idle' && (phase.k !== 'waiting' || !!stop) && <WorkBar phase={phase} stop={stop} {...turnClock(snap.blocks)} mark={snap} />}
    </div>
  );
}

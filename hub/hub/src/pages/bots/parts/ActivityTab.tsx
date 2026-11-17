// Activity: the Bot's conversation as it is written. Messages are bubbles (markdown drawn by the kit
// Prose as React text, secrets hidden, never HTML); runtime rows are compact 28 px lines that say the consequence in plain
// words, with the raw line only under Advanced details. The Bot's status facts, its running tasks and its settings summary
// are the Details panel, opened from the header's Details button (the AI page's pattern): a column beside the
// log on a wide pane, above the log below that, and never a disclosure in the flow.
import { Band, Checkbox, EmptyState, ErrorState, Facts, Icon, ItemList, JumpToNewest, Link, NeedsBar, Prose, SettingGroup, SettingRow, Skeleton, Spinner, StatusPill, SubSection, TextButton, Tooltip, formatRelative, useSearchParam, useStrings, type GateEntry } from '@kit';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { useBotModelLabel, type BotRow, type BotView, type BotLink, type Delegate, type LogPage, type LogRow } from '../data';
import { isTaskUpdate, messageText, plainLine, scrubSecrets, senderLine, voiceMarkParts, type RowPlace, type SettingsSection } from '../logic';
import strings from '../strings.en.json';
import { atEnd, bringTopIntoView, isScrollOf, noteSeen, observeLogResize, onAnyScroll, rowTopIn, scrollerOf, SHOW_GAP, toEnd, visibleOf } from './activityScroll';
import { ChatBoxProvider, type ChatBoxHandle } from './chatBox';
import s from './pane.module.css';

const RUNTIME_TONE: Record<LogRow['kind'], '' | 'warn' | 'bad'> = {
  user: '',
  bot: '',
  note: '',
  report: '',
  gone: '',
  stop: 'warn',
  provider: 'warn',
  error: 'bad',
};

type T = ReturnType<typeof useStrings<typeof strings>>;

/** Who sent a message and the door; a chat app's logo sits right before the app's name. */
function SenderLine({ line }: { line: ReturnType<typeof senderLine> }) {
  return (
    <span className={s.sender}>
      {line.before}
      {line.mark && (
        <>
          <Icon name={line.mark} size="sm" className={s.senderMark} />
          {line.door}
        </>
      )}
      {line.after}
    </span>
  );
}

/** A runtime row's task place, with its chat's Hub path: null when this load cannot open the chat. */
export type RowPlaceView = RowPlace & { href: string | null };

/** "on atlas" when the task's session and its work share the Bot's computer, else both computers. */
function placeText(t: T, p: RowPlace): string {
  // Computer names come from the API: outside text, scrubbed like the rest of the row.
  const session = plainLine(scrubSecrets(p.session), 60);
  if (p.runs === null) return t('log.place.here', { computer: session });
  return p.runs ? t('log.place.split', { session, runs: plainLine(scrubSecrets(p.runs), 60) }) : t('log.place.elsewhere', { session });
}

function RuntimeRow({ row, place }: { row: LogRow; place?: RowPlaceView | null }) {
  const t = useStrings(strings);
  const tone = RUNTIME_TONE[row.kind];
  const named = row.delegateTitle || place?.title;
  const title = named ? plainLine(scrubSecrets(named), 80) : null;
  const href = place?.href;
  return (
    <li className={`${s.runtime} ${tone === 'warn' ? s.runtimeWarn : ''} ${tone === 'bad' ? s.runtimeBad : ''}`} data-seq={row.seq}>
      <Icon name={tone === 'bad' ? 'error' : tone === 'warn' ? 'warn' : 'info'} size="sm" className={s.runtimeIcon} />
      <span className={s.runtimeKind}>
        {t(`log.kind.${row.kind}`)}
        {title && ' · '}
        {/* The task's title is the link to its chat (a row title, not an action). */}
        {title && href ? (
          <Link href={href} variant="plain" aria-label={t('log.openChatOne', { title })}>
            {title}
          </Link>
        ) : (
          title
        )}
        {place ? ` · ${placeText(t, place)}` : ''}
      </span>
      <span className={s.runtimeText}>{plainLine(scrubSecrets(row.text), 300)}</span>
      <span className={s.time}>{formatRelative(row.at)}</span>
      {row.raw && (
        <details className={s.runtimeRaw}>
          <summary>{t('ui.advanced')}</summary>
          <p className={s.mono}>{plainLine(scrubSecrets(row.raw), 300)}</p>
        </details>
      )}
    </li>
  );
}

function summaryLine(t: T, section: SettingsSection, bot: BotView, modelLabel: string): string {
  switch (section) {
    case 'model':
      return bot.provider.ready === 'needs_key' ? t('about.model.needsKey', { model: modelLabel, provider: bot.provider.label }) : modelLabel;
    case 'behaviour':
      return bot.yolo ? t('about.behaviour.auto') : t('about.behaviour.ask');
    case 'workers':
      return bot.workers.known ? t(`about.workers.${bot.workers.backend}`) : t('about.workers.unknown');
    case 'guardrails':
      return t('about.guardrails', { count: bot.guardrails.length, mode: t(`guard.mode.${bot.guardrailCheck}`) });
    case 'voice':
      return bot.speech.config ? t('voice.rail.custom') : t('voice.rail.default');
    case 'advanced':
      return t(`advanced.routing.${bot.routing}`);
  }
}

const SECTION_ROWS: readonly SettingsSection[] = ['model', 'behaviour', 'workers', 'guardrails', 'voice', 'advanced'];

interface RailProps {
  bot: BotView;
  row: BotRow;
  link: BotLink | null;
  onOpenSettings: (section: SettingsSection) => void;
  /** Opens Give it a link; the status with no link becomes this button. */
  onGiveLink?: () => void;
  /** Opens the Link and keys tab; the link's status becomes this button. */
  onOpenLink?: () => void;
  /** The Bot's tasks as listed; undefined while they are not known (nothing is claimed then). */
  tasks?: readonly Delegate[];
  /** Opens the message form for a task; without it the tasks are only listed. */
  onMessageTask?: (task: Delegate) => void;
}

/** Status facts, the running tasks and the settings summary: the body of the Details panel. The header already shows the Bot's
 *  state and computer, so the status holds only what it lacks: when the Bot was last active and its identifier, one Facts list
 *  in the spec layout, and the link as a setting row under it (it carries an action; a Facts list holds no control). The
 *  settings summary is a SettingGroup: a row per section, its current value, Open at its end. */
function Rail({ bot, row, link, onOpenSettings, onGiveLink, onOpenLink, tasks, onMessageTask }: RailProps) {
  const t = useStrings(strings);
  const id = useId();
  const running = tasks?.filter((d) => d.state !== 'closed');
  const modelLabel = useBotModelLabel(bot.key, bot);
  return (
    <div className={s.rail}>
      <section aria-labelledby={`${id}-status`}>
        <h3 id={`${id}-status`} className={s.railTitle}>
          {t('rail.status')}
        </h3>
        <Facts
          label={t('rail.status')}
          columns={1}
          layout="spec"
          items={[
            { label: t('rail.lastActive'), value: row.lastActivityAt ? formatRelative(row.lastActivityAt) : t('col.never') },
            { label: t('rail.id'), id: bot.uid },
          ]}
        />
        {/* The link carries an action, so it is a setting row, not a fact (a Facts list holds no control). */}
        <SettingGroup label={t('rail.link')}>
          <SettingRow label={t('rail.link')}>
            {link ? (
              onOpenLink ? (
                <Tooltip content={t('rail.linkOpenTip')}>
                  <TextButton onPress={onOpenLink} aria-label={t('rail.linkOpen', { status: t(`link.status.${link.status}`) })}>
                    {t(`link.status.${link.status}`)}
                  </TextButton>
                </Tooltip>
              ) : (
                t(`link.status.${link.status}`)
              )
            ) : onGiveLink ? (
              <TextButton onPress={onGiveLink}>{t('rail.linkGive')}</TextButton>
            ) : (
              t('link.status.none')
            )}
          </SettingRow>
        </SettingGroup>
      </section>
      {running && (
        <section aria-labelledby={`${id}-tasks`}>
          <h3 id={`${id}-tasks`} className={s.railTitle}>
            {t('rail.tasks')}
          </h3>
          {running.length === 0 ? (
            <p className={s.help}>{t('rail.tasksNone')}</p>
          ) : (
            <ItemList
              label={t('rail.tasks')}
              items={running.map((d) => {
                // The title comes from the agent: outside text, scrubbed and cut like every other row.
                const title = plainLine(scrubSecrets(d.title), 80);
                return {
                  id: d.sessionId,
                  title,
                  ...(onMessageTask ? { actions: { inline: [{ id: `message-${d.sessionId}`, label: t('task.message'), name: t('task.messageOne', { title }), opens: 'dialog' as const, onPress: () => onMessageTask(d) }] as const } } : {}),
                };
              })}
            />
          )}
        </section>
      )}
      <section aria-labelledby={`${id}-settings`}>
        <h3 id={`${id}-settings`} className={s.railTitle}>
          {t('rail.settings')}
        </h3>
        <SettingGroup label={t('rail.settings')}>
          {SECTION_ROWS.map((r) => (
            <SettingRow
              key={r}
              label={t(`about.${r}`)}
              actions={
                <TextButton onPress={() => onOpenSettings(r)} aria-label={t('rail.openSection', { section: t(`about.${r}`) })}>
                  {t('rail.open')}
                </TextButton>
              }
            >
              {/* the section's current value, a setting's value, not an explanation */}
              {summaryLine(t, r, bot, modelLabel)}
            </SettingRow>
          ))}
        </SettingGroup>
      </section>
    </div>
  );
}

/** A spoken message's mark: only a row whose agent recorded `voice` has one; `via: voice` alone is not evidence. */
function voiceMarkText(t: T, voice: NonNullable<LogRow['voice']>): string {
  const m = voiceMarkParts(voice);
  const origin = t(m.originKey);
  return m.lang ? t('voice.markLang', { origin, duration: m.duration, lang: m.lang }) : t('voice.mark', { origin, duration: m.duration });
}

/** One row of a log: a message bubble, or a runtime line (the Activity log and the archive draw rows the same way). */
export function LogItem({ row: r, place }: { row: LogRow; place?: RowPlaceView | null }) {
  const t = useStrings(strings);
  return r.kind === 'user' || r.kind === 'bot' ? (
    <li className={`${s.bubble} ${r.kind === 'user' ? s.bubbleUser : s.bubbleBot}`} dir="auto" data-seq={r.seq}>
      {r.kind === 'user' && <SenderLine line={senderLine((k, p) => t(k as never, p), r.sender)} />}
      <div dir="auto"><Prose text={messageText(r.text)} /></div>
      <span className={s.time}>{r.kind === 'user' && r.voice ? `${voiceMarkText(t, r.voice)} · ` : ''}{formatRelative(r.at)}</span>
    </li>
  ) : (
    <RuntimeRow row={r} place={place} />
  );
}

/** The Bot's reply as its session writes it: read-only, from the Bot's current session only; the log row replaces it. */
function LiveReply({ text }: { text: string }) {
  const t = useStrings(strings);
  return (
    <div className={`${s.bubble} ${s.bubbleBot}`} dir="auto" role="group" aria-label={t('activity.liveReply')}>
      <div dir="auto"><Prose text={messageText(text)} caret /></div>
    </div>
  );
}

interface LogProps {
  /** Opens the archive (the Activity tab only; a Board tile has none). */
  onOpenArchive?: () => void;
  page: LogPage | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onLoadOlder: () => void;
  loadingOlder: boolean;
  olderFailed: boolean;
}

interface Props extends RailProps, LogProps {
  /** The Details panel is open (the header's Details button; `?details=1`). */
  details?: boolean;
  /** Closes the Details panel (its Close button; the keyboard goes back to the header's Details button). */
  onDetails?: (open: boolean) => void;
  /** Filled with the log's reveal (FollowProps.revealRef): the host brings the panel it opened on screen. */
  revealRef?: MutableRefObject<((el: HTMLElement | null) => void) | null>;
  /** The composer (Say): the Bot's own conversation, docked at the bottom of the tab under the log and the rail, held at the
   *  bottom of the page's one scroll. */
  composer?: ReactNode;
  /** The Bot's waiting card (GateCard), drawn at the end of the thread, directly above the dock. */
  card?: ReactNode;
  /** What the card waits on, for the Waiting-for-you bar in the dock while the card is not wholly on screen. */
  waiting?: GateEntry | null;
  /** A turn runs (the view's turnRunning): with no reply text yet the thread shows a working row. */
  working?: boolean;
  /** The reply the Bot's current session is writing now (BotSource.tail), drawn below the log until its row arrives. */
  tail?: string | null;
  /** Where a runtime row's task lives and runs, and its chat's opener; rows without it show neither. */
  placeOf?: (row: LogRow) => RowPlaceView | null;
}

export function ActivityTab({ page, loading, error, onRetry, onLoadOlder, loadingOlder, olderFailed, onOpenArchive, composer, tail, placeOf, card, waiting, working, details = false, onDetails, revealRef, ...rail }: Props) {
  const t = useStrings(strings);
  const [tasks, setTasks] = useSearchParam('tasks');
  const log = { page, loading, error, onRetry, onLoadOlder, loadingOlder, olderFailed, onOpenArchive };
  // The log follows the newest row only while the reader is at the end (ActivityLog); scrolled up, the dock offers the way
  // back, and while the card is not wholly on screen it names what waits (kit NeedsBar: Show brings the card, it decides nothing).
  const [behind, setBehind] = useState(false);
  const [cardSeen, setCardSeen] = useState(true);
  const jump = useRef<(() => void) | null>(null);
  const showCard = useRef<(() => void) | null>(null);
  // The chat box's input (Say fills it): Jump to newest puts the keyboard there.
  const chatBox = useRef<ChatBoxHandle | null>(null);
  return (
    <div className={`${s.activity} ${details ? s.activityDetails : ''}`} data-activity="">
      {/* Before the log in the document (a phone-wide pane shows it above the log); a wide pane puts it in its own column. */}
      {details && (
        <aside className={s.details} data-details-panel="" aria-label={t('rail.details')} tabIndex={-1}>
          <SubSection title={t('rail.details')} actions={{ secondary: [{ id: 'details-close', label: t('details.closeShort'), name: t('details.close'), icon: 'x', dismiss: true, onPress: () => onDetails?.(false) }] }}>
            <Rail {...rail} />
          </SubSection>
        </aside>
      )}
      <ActivityLog
        {...log}
        hideTasks={tasks === 'hide'}
        onHideTasks={(v) => setTasks(v ? 'hide' : undefined, { replace: true })}
        tail={tail}
        placeOf={placeOf}
        working={working}
        card={card}
        onBehind={setBehind}
        onCardSeen={setCardSeen}
        jumpRef={jump}
        chatBox={chatBox}
        showCardRef={showCard}
        revealRef={revealRef}
      />
      {/* The chat box: its own dock at the bottom of the tab, under the log and the rail, full width; held at the
          bottom of the one scroll (the log no longer scrolls in its own box). */}
      {composer && (
        <div className={s.sayDock} data-say-dock="">
          {card && waiting && !cardSeen && <NeedsBar gates={[waiting]} onShow={() => showCard.current?.()} />}
          {behind && <JumpToNewest onPress={() => jump.current?.()} />}
          <ChatBoxProvider value={chatBox}>{composer}</ChatBoxProvider>
        </div>
      )}
    </div>
  );
}

export { bringTopIntoView } from './activityScroll';

/**
 * The log column alone: the Activity tab's (task updates hidden through the page URL) and a Board tile's (tile.tsx,
 * hidden in the tile's own state, never the host page's URL).
 */
interface FollowProps {
  /** A turn runs: with no reply text yet, a working row ends the thread. */
  working?: boolean;
  /** The waiting card, drawn at the end of the thread (the Activity tab; a Board tile draws its own above the log). */
  card?: ReactNode;
  /** Whether the reader is behind: scrolled up when something new arrived at the end (the host shows Jump to newest). */
  onBehind?: (behind: boolean) => void;
  /** Whether the card is wholly on screen (above the dock) (the host shows the Waiting-for-you bar when it is not). */
  onCardSeen?: (seen: boolean) => void;
  /** Filled with the host's Jump to newest: to the end of the scroll, the keyboard on the chat box. */
  jumpRef?: MutableRefObject<(() => void) | null>;
  /** The chat box's input, where Jump to newest puts the keyboard (the Activity tab's; a Board tile has none). */
  chatBox?: MutableRefObject<ChatBoxHandle | null>;
  /** Filled with the host's Show (NeedsBar): the card into view and the keyboard on it. */
  showCardRef?: MutableRefObject<(() => void) | null>;
  /** Filled with a way to bring an element above the log on screen (the Details panel the person opened): when that
   *  scroll takes the reader off the end, the log stops following it, so its next resize does not take them back down; a
   *  reader left at the end (the panel already on screen) keeps following. */
  revealRef?: MutableRefObject<((el: HTMLElement | null) => void) | null>;
}

export function ActivityLog({ page, loading, error, onRetry, onLoadOlder, loadingOlder, olderFailed, hideTasks, onHideTasks, onOpenArchive, composer, tail, placeOf, working, card, onBehind, onCardSeen, jumpRef, chatBox, showCardRef, revealRef }: LogProps & FollowProps & { hideTasks: boolean; onHideTasks: (hide: boolean) => void; composer?: ReactNode; tail?: string | null; placeOf?: (row: LogRow) => RowPlaceView | null }) {
  const t = useStrings(strings);
  const colRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const shown = hideTasks && page ? page.rows.filter((r) => !isTaskUpdate(r.kind)) : page?.rows;
  const hidden = (page?.rows.length ?? 0) - (shown?.length ?? 0);
  const firstSeq = shown?.[0]?.seq ?? null;
  const lastSeq = shown?.[shown.length - 1]?.seq ?? null;
  const tailLen = tail?.length ?? 0;
  const hasCard = card != null;
  // A Bot that waits on the person is not said to be working on it: the card is what is happening.
  const workingRow = !!working && !tail && !hasCard;
  // The follow rule (the kit's, SessionView): the log lives in the page's one scroll. It opens at the end; while the reader
  // is at the end (within a line) it follows anything new at the end (a row, the live reply growing, the working row, the
  // card); once they have scrolled up it never moves by itself and says it is behind. `wasEnd` is where the reader was
  // before the change, noted on every scroll and after every move of our own.
  const wasEnd = useRef(true);
  // The scroll position and content height last seen: only a move up leaves the end, unless the content shrank. Content that
  // grows under a reader at the end (the dock's bars, a late font) lowers the end before the scroll event is read, and content
  // that shrinks for a moment clamps or anchors the position up; neither is the reader leaving it.
  const last = useRef({ top: 0, height: 0 });
  const behindRef = useRef(false);
  const setBehind = useCallback((b: boolean) => {
    if (behindRef.current === b) return;
    behindRef.current = b;
    onBehind?.(b);
  }, [onBehind]);
  const measureCard = useCallback(() => {
    const el = cardRef.current;
    const v = visibleOf(colRef.current);
    if (!el || !v || !onCardSeen) return;
    const b = el.getBoundingClientRect();
    // A card with no height is not laid out yet (the terminal lays out at its next frame, after this is first asked):
    // its place says nothing, so what was known stands until a measure that sees it. Reading it as off screen drew the
    // "Waiting for you" strip for some frames on every open, under a card in full view.
    if (b.height === 0) return;
    // A card taller than the space counts as seen while it fills that space from its start (where Show puts it).
    const fits = b.height <= v.bottom - v.top;
    onCardSeen(fits ? b.top >= v.top - 1 && b.bottom <= v.bottom + 1 : b.top >= v.top - 1 && b.top <= v.top + SHOW_GAP + 1 && b.bottom >= v.bottom - 1);
  }, [onCardSeen]);
  // Load older: the first row's place on screen before the older rows arrive, restored once they are drawn above it. The
  // place follows the reader's own scrolls while the rows are on their way (onScroll), so a restore only ever undoes the
  // rows drawn above, never a move of the reader's. A failed load drops it, and so does a change of the task filter (rows it
  // brings back above that row are not older rows, and the place was read before them); one that brought
  // nothing keeps it, following the reader's scrolls, and the row's leaving the log drops it.
  const anchor = useRef<{ seq: number; top: number } | null>(null);
  const firstSeqRef = useRef(firstSeq);
  useLayoutEffect(() => {
    firstSeqRef.current = firstSeq;
  }, [firstSeq]);
  useLayoutEffect(() => {
    if (olderFailed) anchor.current = null;
  }, [olderFailed]);
  useLayoutEffect(() => {
    anchor.current = null;
  }, [hideTasks]);
  const rowTop = (seq: number) => rowTopIn(colRef.current, seq);
  const loadOlder = () => {
    if (firstSeq !== null) {
      const top = rowTop(firstSeq);
      if (top !== undefined) anchor.current = { seq: firstSeq, top };
    }
    onLoadOlder();
  };
  useLayoutEffect(() => {
    const a = anchor.current;
    const sc = scrollerOf(colRef.current);
    if (!a || !sc || firstSeq === a.seq) return;
    const top = rowTop(a.seq);
    anchor.current = null;
    if (top !== undefined) sc.scrollTop += top - a.top;
    noteSeen(last, sc);
    wasEnd.current = atEnd(sc);
  }, [firstSeq]);
  useLayoutEffect(() => {
    const sc = scrollerOf(colRef.current);
    if (!sc) return;
    if (wasEnd.current) {
      toEnd(sc);
      noteSeen(last, sc);
      setBehind(false);
    } else setBehind(true);
    wasEnd.current = atEnd(sc) || wasEnd.current;
    measureCard();
  }, [lastSeq, tailLen, workingRow, hasCard, setBehind, measureCard]);
  // Which element scrolls the log can change while it is drawn: below the layout's phone breakpoint the detail area stops
  // scrolling and an ancestor takes over (ListDetailPage.module.css). So the scroll is heard at the document (scroll events
  // do not bubble; the capture phase sees every one) and the scroller is asked again at each event. A new scroller starts
  // from where it stands (`last` is its own).
  const scRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    scRef.current = scrollerOf(colRef.current);
    const onScroll = (e: Event) => {
      const sc = scrollerOf(colRef.current);
      if (!sc || !isScrollOf(e, sc)) return;
      if (scRef.current !== sc) {
        scRef.current = sc;
        noteSeen(last, sc);
      }
      // Growth by itself cannot move the position up, so a move up is the reader leaving even when it is heard in the frame of the
      // growth (the Details panel opening above the log). Content that shrank can move it without the reader (a clamp, or the
      // browser's scroll anchoring when content above its anchor goes): that is not leaving. Accepted: anchoring that moves up
      // while more is added below reads as leaving; Jump to newest brings the reader back.
      const shrank = sc.scrollHeight < last.current.height;
      wasEnd.current = atEnd(sc) || (wasEnd.current && (shrank || sc.scrollTop >= last.current.top - 1));
      noteSeen(last, sc);
      if (atEnd(sc)) setBehind(false);
      const a = anchor.current;
      const top = a ? rowTopIn(colRef.current, a.seq) : undefined;
      if (a && top !== undefined && a.seq === firstSeqRef.current) a.top = top;
      measureCard();
    };
    return onAnyScroll(onScroll);
  }, [setBehind, measureCard]);
  // Content that changes size after it is drawn (fonts, wrapping, the dock's own bars) moves the end and the card: at the end
  // the log stays there, and whether the card is wholly on screen is asked again.
  useEffect(() => {
    const col = colRef.current;
    if (!col) return undefined;
    return observeLogResize(col, () => {
      const sc = scrollerOf(colRef.current);
      if (sc && scRef.current !== sc) {
        // Another element scrolls the log now (a resize across the breakpoint): its own place is the one to follow from.
        scRef.current = sc;
        noteSeen(last, sc);
      }
      if (sc && wasEnd.current) {
        toEnd(sc);
        noteSeen(last, sc);
      }
      measureCard();
    });
  }, [measureCard]);
  if (jumpRef) {
    jumpRef.current = () => {
      const sc = scrollerOf(colRef.current);
      if (!sc) return;
      toEnd(sc);
      noteSeen(last, sc);
      wasEnd.current = true;
      setBehind(false);
      // The button goes with this press: the keyboard moves to the chat box, under the newest content.
      chatBox?.current?.focus();
    };
  }
  if (revealRef) {
    revealRef.current = (el) => {
      // No scroll (the panel already on screen, a wide pane's sticky one): the follow state is the reader's own, and a
      // reader at the end is followed through the layout change (the log's resize). Never judged here by the end's place:
      // the layout has already moved it, before the log answers.
      if (!bringTopIntoView(el)) return;
      const sc = scrollerOf(colRef.current);
      if (!sc) return;
      // Scrolled to the panel: decided now, not by the scroll event (it comes after the log's next resize, which would
      // follow the end).
      wasEnd.current = atEnd(sc);
      noteSeen(last, sc);
    };
  }
  if (showCardRef) {
    showCardRef.current = () => {
      const el = cardRef.current;
      const sc = scrollerOf(colRef.current);
      const v = visibleOf(colRef.current);
      if (!el || !sc || !v) return;
      // Into the space the dock leaves (a sticky dock is not something scrollIntoView avoids): the card's end just above the
      // dock, or, for a card taller than that space, its start at the top.
      const b = el.getBoundingClientRect();
      const gap = SHOW_GAP;
      let d = Math.max(0, b.bottom - (v.bottom - gap));
      if (b.top - d < v.top + gap) d = b.top - (v.top + gap);
      if (d !== 0) {
        sc.scrollTop += d;
        noteSeen(last, sc);
        wasEnd.current = atEnd(sc);
        if (wasEnd.current) setBehind(false);
      }
      const target = el.querySelector<HTMLElement>('button:not([disabled]), textarea:not([disabled]), input:not([disabled])');
      target?.focus({ preventScroll: true });
      measureCard();
    };
  }
  const live = page?.live;
  const lagging = live === 'no_stream' || (error && page !== undefined);

  return (
      <div ref={colRef} className={s.logCol}>
        <div className={s.logHead}>
          <h3 className={s.logTitle}>{t('activity.title')}</h3>
          {live && live !== 'no_stream' && (
            <StatusPill tone={live === 'up_to_date' ? 'ok' : 'warn'} dot>
              {t(`activity.live.${live}`)}
            </StatusPill>
          )}
          {page && page.rows.length > 0 && (
            <Checkbox label={t('activity.hideTasks')} isSelected={hideTasks} onChange={onHideTasks} />
          )}
          {hidden > 0 && <span className={s.help}>{t('activity.tasksHidden', { count: hidden })}</span>}
          {page && page.archiveRows > 0 && <span className={s.logArchive}>{t('activity.archive', { count: page.archiveRows })}</span>}
          {onOpenArchive && (
            <TextButton icon="file-archive" onPress={onOpenArchive}>
              {t('archive.open')}
            </TextButton>
          )}
        </div>
        {lagging && (
          <Band tone="warn" size="table" actions={<TextButton onPress={onRetry}>{t('action.tryAgain')}</TextButton>}>
            {t(live === 'no_stream' ? 'activity.live.no_stream' : 'activity.error')}
          </Band>
        )}
        {loading && <Skeleton rows={6} />}
        {error && !page && <ErrorState size="sm" title={t('activity.error')} onRetry={onRetry} />}
        {page && page.rows.length === 0 && <EmptyState size="sm" icon="logs" title={t('activity.empty')} body={t('activity.emptyBody')} />}
        {page && page.rows.length > 0 && (
          <>
            {page.hasOlder && (
              <div className={s.older}>
                <TextButton icon="arrow-up" isDisabled={loadingOlder} onPress={loadOlder}>
                  {t('activity.older')}
                </TextButton>
                {olderFailed && <span className={s.help}>{t('activity.olderFailed')}</span>}
              </div>
            )}
            <ol className={s.log} aria-label={t('activity.title')}>
              {(shown ?? []).map((r) => (
                <LogItem key={r.seq} row={r} place={placeOf?.(r)} />
              ))}
            </ol>
          </>
        )}
        {tail ? <LiveReply text={tail} /> : null}
        {workingRow && (
          <div className={s.working}>
            <Spinner label={t('activity.working')} />
          </div>
        )}
        {card != null && (
          <div ref={cardRef} className={s.cardEnd} data-card-end="">
            {card}
          </div>
        )}
        {composer}
      </div>
  );
}
